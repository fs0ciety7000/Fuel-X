// Countdown (ARCHITECTURE §7.1, GDD §4.5–4.6, AC 11–13). Two orthogonal table-driven FSMs per flight
// attempt:
//   phase: Standby → Rollout → Stack → PropellantLoad → TerminalCount → Liftoff → Boostback →
//          TowerCatch | Divert → Safing → Debrief   (+ Scrubbed → Debrief)
//   clock: Counting ⇄ Holding → Stopped — the T-clock only advances while Counting.
// The phase keeps running underneath a hold (stacking, loading and topping continue), which is what
// ARCHITECTURE calls `Holding` with a `resumePhase`. Polls are holds with reason POLL that need a GO
// (or pass automatically when every station is GO, the countdown's `autoGoWhenAllGreen` switch is on and the
// data flag `autoGoAtPoll[poll]` allows it — never at the final poll, GDD §13.2.1).
import {
  STATION_IDS as stationIdsData,
  contracts as contractsData,
  countdown as countdownData,
  time as timeImport,
} from '@data/index';
import type { PollId, TimeScale } from '@data/index';
import { emit } from '../core/events';
import { ensureAttempt } from './economy';
import { defineFsm } from '../core/fsm';
import type { FsmContext } from '../core/fsm';
import { secondsToTicks } from '../core/time';
import { countdownIds, invalidateCountdownIds } from '../core/world';
import type { World } from '../core/world';
import type { CommandOf } from '../core/commands';
import type {
  ClockState,
  Countdown,
  CountdownHold,
  CountdownInputs,
  HoldReleasedBy,
  Id,
  Phase,
  ScrubReason,
  SiteId,
  Station,
} from '../types';

// Module-level aliases: hot paths read a local const, not the import binding (a getter per access under
// Vitest / tsx, which re-export `@data/index` through `export *`). Same objects; data is never reassigned.
const STATION_IDS = stationIdsData;
const contracts = contractsData;
const cdData = countdownData;
const timeData = timeImport;

export const STATIONS: readonly Station[] = STATION_IDS;
export const PHASES: readonly Phase[] = [
  'Standby',
  'Rollout',
  'Stack',
  'PropellantLoad',
  'TerminalCount',
  'Liftoff',
  'Boostback',
  'TowerCatch',
  'Divert',
  'Safing',
  'Scrubbed',
  'Debrief',
];
/** Phases before T-0: HOLD / SCRUB allowed, window can close. */
export const PRE_LIFTOFF_PHASES: readonly Phase[] = ['Standby', 'Rollout', 'Stack', 'PropellantLoad', 'TerminalCount'];
/** Phases in which a NO-GO station auto-holds the count. */
const NO_GO_HOLD_PHASES: readonly Phase[] = ['PropellantLoad', 'TerminalCount'];
const POLL_ORDER: readonly PollId[] = ['load', 'terminal', 'final'];

// Ticks precomputed from data (T-offsets in s → ticks).
const POLL_TICKS: Record<PollId, number> = {
  load: secondsToTicks(cdData.pollTS.load),
  terminal: secondsToTicks(cdData.pollTS.terminal),
  final: secondsToTicks(cdData.pollTS.final),
};
const LOAD_MUST_COMPLETE_TICKS = secondsToTicks(cdData.loadMustCompleteByTS);
const RECYCLE_TO_TICKS = secondsToTicks(cdData.recycleToTS);
const SAFING_TICKS = secondsToTicks(cdData.safingDurationS);
const FORCE_1X_FROM_TICKS = secondsToTicks(timeData.force1xFromTS);
const FORCE_1X_AFTER_RECOVERY_TICKS = secondsToTicks(timeData.force1xAfterRecoveryS);
const MILESTONE_TICKS = cdData.milestones.map((m) => ({ name: m.name, tClockTicks: secondsToTicks(m.tS) }));
const MAX_SCALE_BY_PHASE: Record<Phase, TimeScale> = timeData.maxTimeScaleByPhase;

// --- Context & predicates -------------------------------------------------------------------------

interface CdCtx extends FsmContext {
  readonly cd: Countdown;
  /** Hold to start (clock: Hold / AutoHold). */
  readonly hold: CountdownHold;
}

const MANUAL_HOLD: CountdownHold = { reason: 'MANUAL', poll: null };

function ctx(world: World, cd: Countdown, hold: CountdownHold = MANUAL_HOLD): CdCtx {
  return { world, cd, hold };
}

export const isPreLiftoff = (phase: Phase): boolean => PRE_LIFTOFF_PHASES.includes(phase);
// Loops, not every/some with a closure over `cd`: these run every tick.
function allGo(cd: Countdown): boolean {
  for (const s of STATIONS) if (cd.inputs.stations[s] !== 'GO') return false;
  return true;
}
function anyNoGo(cd: Countdown): boolean {
  for (const s of STATIONS) if (cd.inputs.stations[s] === 'NO_GO') return true;
  return false;
}
const marginalStations = (cd: Countdown): Station[] => STATIONS.filter((s) => cd.inputs.stations[s] === 'MARGINAL');

/** Poll located exactly at a T-clock value, if any. */
function pollAt(tClockTicks: number): PollId | null {
  for (const p of POLL_ORDER) if (POLL_TICKS[p] === tClockTicks) return p;
  return null;
}

/** Why a poll cannot be passed right now (station status aside), or null. */
function pollBlocker(world: World, cd: Countdown, poll: PollId): string | null {
  switch (poll) {
    case 'load':
      return cd.phase.state === 'Stack' && cd.inputs.stackComplete ? null : 'STACK_NOT_COMPLETE';
    case 'terminal':
      return cd.phase.state === 'PropellantLoad' ? null : 'NOT_IN_PROPELLANT_LOAD';
    case 'final':
      // Liftoff must fall inside the window: T-0 would happen `-tClock` ticks from now.
      return world.tick - cd.tClockTicks >= cd.windowOpenTick ? null : 'WINDOW_NOT_OPEN_AT_T0';
  }
}

/** Why the clock cannot be released by GO right now, or null. */
export function releaseBlocker(world: World, cd: Countdown): string | null {
  if (cd.clock.state !== 'Holding' || !cd.hold) return 'NOT_HOLDING';
  if (cd.hold.poll) {
    const blocked = pollBlocker(world, cd, cd.hold.poll);
    if (blocked) return blocked;
  }
  if (anyNoGo(cd)) return 'STATION_NO_GO';
  if (cd.phase.state === 'TerminalCount' && cd.tClockTicks >= LOAD_MUST_COMPLETE_TICKS && !cd.inputs.loadComplete) {
    return 'LOAD_INCOMPLETE';
  }
  return null;
}

function recycleBlocker(world: World, cd: Countdown): string | null {
  if (cd.phase.state !== 'TerminalCount') return 'NOT_IN_TERMINAL_COUNT';
  if (cd.tClockTicks <= RECYCLE_TO_TICKS) return 'NOT_PAST_RECYCLE_POINT';
  if (world.tick >= cd.windowCloseTick) return 'WINDOW_CLOSED';
  return null;
}

// --- Phase FSM --------------------------------------------------------------------------------------

export type PhaseTrigger =
  'StartRollout' | 'auto' | 'LoadPollPassed' | 'TerminalPollPassed' | 'T0' | 'Recycle' | 'Scrub' | 'WindowClosed';

function scrub(reason: ScrubReason) {
  return (c: CdCtx): void => {
    c.cd.scrubReason = reason;
    if (reason === 'WINDOW_CLOSED') {
      const contract = contracts[c.cd.contractId];
      emit(c.world, {
        t: 'WindowMissed',
        countdownId: c.cd.id,
        contractId: c.cd.contractId,
        penaltyCr: contract?.penaltyWindowMissedCr ?? 0,
      });
    }
    clockFsm.fire(c.cd.clock, 'Stop', c);
  };
}

export const phaseFsm = defineFsm<Phase, PhaseTrigger, CdCtx>({
  name: 'countdown.phase',
  states: PHASES,
  transitions: [
    { from: 'Standby', to: 'Rollout', on: 'StartRollout' },
    { from: 'Rollout', to: 'Stack', on: 'auto', guard: (c) => c.cd.inputs.rolloutComplete },
    { from: 'Stack', to: 'PropellantLoad', on: 'LoadPollPassed', guard: (c) => c.cd.inputs.stackComplete },
    { from: 'PropellantLoad', to: 'TerminalCount', on: 'TerminalPollPassed' },
    {
      from: 'TerminalCount',
      to: 'TerminalCount',
      on: 'Recycle',
      guard: (c) => recycleBlocker(c.world, c.cd) === null,
      effect: (c) => {
        const from = c.cd.tClockTicks;
        c.cd.tClockTicks = RECYCLE_TO_TICKS;
        // Polls later than the recycle point (the final poll) must be passed again.
        c.cd.pollsPassed = c.cd.pollsPassed.filter((p) => POLL_TICKS[p] <= RECYCLE_TO_TICKS);
        emit(c.world, { t: 'Recycled', countdownId: c.cd.id, fromTClockTicks: from, toTClockTicks: RECYCLE_TO_TICKS });
        clockFsm.fire(c.cd.clock, 'Recycle', c);
      },
    },
    {
      from: 'TerminalCount',
      to: 'Liftoff',
      on: 'T0',
      effect: (c) => {
        c.cd.liftoffTick = c.world.tick;
      },
    },
    { from: 'Liftoff', to: 'Boostback', on: 'auto', guard: (c) => c.cd.inputs.stageSeparated },
    { from: 'Boostback', to: 'TowerCatch', on: 'auto', guard: (c) => c.cd.inputs.recoveryMode === 'CATCH' },
    { from: 'Boostback', to: 'Divert', on: 'auto', guard: (c) => c.cd.inputs.recoveryMode === 'DIVERT' },
    { from: ['TowerCatch', 'Divert'], to: 'Safing', on: 'auto', guard: (c) => c.cd.inputs.recoveryComplete },
    {
      from: 'Safing',
      to: 'Debrief',
      on: 'auto',
      guard: (c) => c.world.tick - c.cd.phase.enteredTick >= SAFING_TICKS,
      effect: (c) => {
        clockFsm.fire(c.cd.clock, 'Stop', c);
      },
    },
    { from: PRE_LIFTOFF_PHASES, to: 'Scrubbed', on: 'Scrub', effect: scrub('COMMAND') },
    { from: PRE_LIFTOFF_PHASES, to: 'Scrubbed', on: 'WindowClosed', effect: scrub('WINDOW_CLOSED') },
    { from: 'Scrubbed', to: 'Debrief', on: 'auto', guard: (c) => c.cd.inputs.detankComplete },
  ],
  event: (c, from, to, on) => ({ t: 'PhaseChanged', countdownId: c.cd.id, from, to, trigger: on }),
});

// --- Clock FSM --------------------------------------------------------------------------------------

export type ClockTrigger = 'Hold' | 'AutoHold' | 'Go' | 'AutoRelease' | 'Recycle' | 'Stop';

const RELEASED_BY: Partial<Record<ClockTrigger, HoldReleasedBy>> = {
  Go: 'GO',
  AutoRelease: 'AUTO',
  Recycle: 'RECYCLE',
};

const startHold = (c: CdCtx): void => {
  c.cd.hold = { ...c.hold };
};
const clearHold = (c: CdCtx): void => {
  c.cd.hold = null;
};
const holdable = (c: CdCtx): boolean => isPreLiftoff(c.cd.phase.state);

export const clockFsm = defineFsm<ClockState, ClockTrigger, CdCtx>({
  name: 'countdown.clock',
  states: ['Counting', 'Holding', 'Stopped'],
  transitions: [
    { from: 'Counting', to: 'Holding', on: 'Hold', guard: holdable, effect: startHold },
    { from: 'Counting', to: 'Holding', on: 'AutoHold', guard: holdable, effect: startHold },
    {
      from: 'Holding',
      to: 'Counting',
      on: 'Go',
      guard: (c) => releaseBlocker(c.world, c.cd) === null,
      effect: clearHold,
    },
    { from: 'Holding', to: 'Counting', on: 'AutoRelease', effect: clearHold },
    { from: 'Holding', to: 'Counting', on: 'Recycle', effect: clearHold },
    { from: ['Counting', 'Holding'], to: 'Stopped', on: 'Stop', effect: clearHold },
  ],
  event: (c, from, to, on) => {
    const base = { countdownId: c.cd.id, tClockTicks: c.cd.tClockTicks };
    if (to === 'Holding') return { t: 'HoldStarted', ...base, reason: c.hold.reason, poll: c.hold.poll };
    const by = RELEASED_BY[on];
    if (from === 'Holding' && to === 'Counting' && c.cd.hold && by) {
      return { t: 'HoldReleased', ...base, reason: c.cd.hold.reason, by };
    }
    return { t: 'ClockChanged', countdownId: c.cd.id, from, to, trigger: on };
  },
});

// --- Creation ---------------------------------------------------------------------------------------

export interface CreateCountdownOptions {
  flightName: string;
  siteId: SiteId;
  contractId: string;
  boosterId: Id;
  shipId: Id;
  padId: Id;
  /** T-clock at creation, s (default: scenario start T-06:00:00). The window is placed relative to it. */
  startTS?: number;
  autoGoWhenAllGreen?: boolean;
}

export function defaultCountdownInputs(): CountdownInputs {
  return {
    stations: { WEATHER: 'GO', RANGE: 'GO', PROPELLANT: 'GO', VEHICLE: 'GO', PAD_CREW: 'GO' },
    rolloutComplete: false,
    stackComplete: false,
    loadComplete: false,
    stageSeparated: false,
    recoveryMode: null,
    recoveryComplete: false,
    detankComplete: false,
    leakFixActive: false,
  };
}

/** Adds a countdown in `Standby`, clock `Counting`, T-clock at `startTS`. */
export function createCountdown(world: World, opts: CreateCountdownOptions): Countdown {
  const contract = contracts[opts.contractId];
  if (!contract) throw new Error(`createCountdown: unknown contract ${opts.contractId}`);
  const startTS = opts.startTS ?? cdData.scenarioStartTS;
  const id = `cd${String(Object.keys(world.countdowns).length + 1).padStart(2, '0')}`;
  const windowOpenTick = world.tick + secondsToTicks(contract.windowOpenTS - startTS);
  const cd: Countdown = {
    id,
    flightName: opts.flightName,
    siteId: opts.siteId,
    contractId: opts.contractId,
    boosterId: opts.boosterId,
    shipId: opts.shipId,
    padId: opts.padId,
    createdTick: world.tick,
    phase: { state: 'Standby', enteredTick: world.tick },
    clock: { state: 'Counting', enteredTick: world.tick },
    tClockTicks: secondsToTicks(startTS),
    hold: null,
    pollsPassed: [],
    goWithMarginal: [],
    windowOpenTick,
    windowCloseTick: windowOpenTick + secondsToTicks(contract.windowDurationS),
    autoGoWhenAllGreen: opts.autoGoWhenAllGreen ?? true,
    liftoffTick: null,
    scrubReason: null,
    inputs: defaultCountdownInputs(),
  };
  world.countdowns[id] = cd;
  invalidateCountdownIds(world);
  world.contracts[contract.id] ??= { id: contract.id, status: 'ACTIVE', countdownId: id, closedTick: null };
  ensureAttempt(world, cd);
  return cd;
}

// --- Commands (return a rejection reason code, or null when applied) --------------------------------

function passPoll(world: World, cd: Countdown, poll: PollId, auto: boolean): void {
  cd.pollsPassed.push(poll);
  // The hold (if any) no longer waits on this poll; releasing it is the caller's next step.
  if (cd.hold?.poll === poll) cd.hold = { ...cd.hold, poll: null };
  emit(world, { t: 'PollPassed', countdownId: cd.id, poll, auto, marginal: marginalStations(cd) });
  if (poll === 'load') phaseFsm.fire(cd.phase, 'LoadPollPassed', ctx(world, cd));
  else if (poll === 'terminal') phaseFsm.fire(cd.phase, 'TerminalPollPassed', ctx(world, cd));
}

function getCountdown(world: World, id: Id): Countdown | null {
  return world.countdowns[id] ?? null;
}

export function commandStartRollout(world: World, cmd: CommandOf<'StartRollout'>): string | null {
  const id = countdownIds(world).find((k) => world.countdowns[k]?.boosterId === cmd.boosterId);
  const cd = id === undefined ? null : getCountdown(world, id);
  if (!cd) return 'NO_COUNTDOWN_FOR_BOOSTER';
  return phaseFsm.fire(cd.phase, 'StartRollout', ctx(world, cd)) ? null : 'ROLLOUT_ALREADY_STARTED';
}

export function commandGo(world: World, cmd: CommandOf<'Go'>): string | null {
  const cd = getCountdown(world, cmd.countdownId);
  if (!cd) return 'UNKNOWN_COUNTDOWN';
  const blocked = releaseBlocker(world, cd);
  if (blocked) return blocked;
  for (const s of marginalStations(cd)) if (!cd.goWithMarginal.includes(s)) cd.goWithMarginal.push(s);
  const poll = cd.hold?.poll ?? null;
  if (poll) passPoll(world, cd, poll, false);
  clockFsm.fire(cd.clock, 'Go', ctx(world, cd));
  return null;
}

export function commandHold(world: World, cmd: CommandOf<'Hold'>): string | null {
  const cd = getCountdown(world, cmd.countdownId);
  if (!cd) return 'UNKNOWN_COUNTDOWN';
  if (!isPreLiftoff(cd.phase.state)) return 'NOT_HOLDABLE';
  if (cd.clock.state === 'Holding') return 'ALREADY_HOLDING';
  return clockFsm.fire(cd.clock, 'Hold', ctx(world, cd, MANUAL_HOLD)) ? null : 'CLOCK_STOPPED';
}

export function commandRecycle(world: World, cmd: CommandOf<'Recycle'>): string | null {
  const cd = getCountdown(world, cmd.countdownId);
  if (!cd) return 'UNKNOWN_COUNTDOWN';
  const blocked = recycleBlocker(world, cd);
  if (blocked) return blocked;
  phaseFsm.fire(cd.phase, 'Recycle', ctx(world, cd));
  return null;
}

export function commandScrub(world: World, cmd: CommandOf<'Scrub'>): string | null {
  const cd = getCountdown(world, cmd.countdownId);
  if (!cd) return 'UNKNOWN_COUNTDOWN';
  return phaseFsm.fire(cd.phase, 'Scrub', ctx(world, cd)) ? null : 'NOT_SCRUBBABLE';
}

// --- System -----------------------------------------------------------------------------------------

function autoHold(world: World, cd: Countdown, hold: CountdownHold): void {
  clockFsm.fire(cd.clock, 'AutoHold', ctx(world, cd, hold));
}

/** The poll passes by itself when all five stations are GO (per-poll data flag × the countdown's switch). */
function autoGoAt(cd: Countdown, poll: PollId): boolean {
  return cd.autoGoWhenAllGreen && cdData.autoGoAtPoll[poll];
}

function tryAutoRelease(world: World, cd: Countdown): void {
  const hold = cd.hold;
  if (!hold || !cd.autoGoWhenAllGreen || !allGo(cd)) return;
  if (hold.reason === 'POLL' && hold.poll && autoGoAt(cd, hold.poll) && pollBlocker(world, cd, hold.poll) === null) {
    passPoll(world, cd, hold.poll, true);
    clockFsm.fire(cd.clock, 'AutoRelease', ctx(world, cd));
  } else if (hold.reason === 'LOAD_INCOMPLETE' && cd.inputs.loadComplete) {
    clockFsm.fire(cd.clock, 'AutoRelease', ctx(world, cd));
  }
}

/** A LEAK_FIX hold resumes the count by itself once the fix is done and no station is NO-GO. */
function tryReleaseLeakFix(world: World, cd: Countdown): void {
  if (cd.hold?.reason !== 'LEAK_FIX' || cd.inputs.leakFixActive || anyNoGo(cd)) return;
  clockFsm.fire(cd.clock, 'AutoRelease', ctx(world, cd));
}

/** A3 HOLD_FIX: holds the count with reason LEAK_FIX if it is counting; false when it cannot hold. */
export function holdForLeakFix(world: World, cd: Countdown): boolean {
  return clockFsm.fire(cd.clock, 'AutoHold', ctx(world, cd, { reason: 'LEAK_FIX', poll: null })) !== null;
}

/** One tick of T-clock before liftoff: NO-GO auto-hold, polls, load auto-hold, advance, milestones, T-0. */
function advancePreLiftoff(world: World, cd: Countdown): void {
  if (NO_GO_HOLD_PHASES.includes(cd.phase.state) && anyNoGo(cd)) {
    autoHold(world, cd, { reason: 'NO_GO', poll: null });
    return;
  }
  const poll = pollAt(cd.tClockTicks);
  if (poll && !cd.pollsPassed.includes(poll)) {
    emit(world, { t: 'PollOpened', countdownId: cd.id, poll });
    if (autoGoAt(cd, poll) && allGo(cd) && pollBlocker(world, cd, poll) === null) {
      passPoll(world, cd, poll, true);
    } else {
      autoHold(world, cd, { reason: 'POLL', poll });
      emit(world, {
        t: 'DecisionRequired',
        countdownId: cd.id,
        decision: 'POLL',
        poll,
        deadlineTick: cd.windowCloseTick,
      });
      return;
    }
  }
  if (cd.tClockTicks === LOAD_MUST_COMPLETE_TICKS && cd.phase.state === 'TerminalCount' && !cd.inputs.loadComplete) {
    autoHold(world, cd, { reason: 'LOAD_INCOMPLETE', poll: null });
    return;
  }
  cd.tClockTicks++;
  for (const m of MILESTONE_TICKS) {
    if (m.tClockTicks === cd.tClockTicks) emit(world, { t: 'Milestone', countdownId: cd.id, name: m.name });
  }
  if (cd.tClockTicks === 0) phaseFsm.fire(cd.phase, 'T0', ctx(world, cd));
}

function updateCountdown(world: World, cd: Countdown): void {
  if (isPreLiftoff(cd.phase.state) && world.tick >= cd.windowCloseTick) {
    phaseFsm.fire(cd.phase, 'WindowClosed', ctx(world, cd));
    return;
  }
  if (phaseFsm.canFire(cd.phase.state, 'auto')) phaseFsm.fire(cd.phase, 'auto', ctx(world, cd));
  if (cd.clock.state === 'Holding') {
    tryReleaseLeakFix(world, cd);
    if (cd.clock.state === 'Holding') tryAutoRelease(world, cd);
  }
  if (cd.clock.state !== 'Counting') return;
  if (isPreLiftoff(cd.phase.state)) advancePreLiftoff(world, cd);
  else cd.tClockTicks++; // mission clock T+ through flight and safing
}

/** Pipeline system #4 (ARCHITECTURE §4). */
export function countdownSystem(world: World): void {
  for (const id of countdownIds(world)) {
    const cd = world.countdowns[id];
    if (cd) updateCountdown(world, cd);
  }
}

// --- Queries ----------------------------------------------------------------------------------------

/**
 * Highest time scale the phase allows (GDD §6): data table per phase, capped while holding, forced 1×
 * from T-00:03:00 through catch/divert + 30 s. Decision-prompt / NO-GO drops are app time rules.
 */
export function maxTimeScale(world: World, cd: Countdown): TimeScale {
  const phase = cd.phase.state;
  if (phase === 'Safing' && world.tick - cd.phase.enteredTick < FORCE_1X_AFTER_RECOVERY_TICKS) return 1;
  if (isPreLiftoff(phase) && cd.tClockTicks >= FORCE_1X_FROM_TICKS) return 1;
  const base = MAX_SCALE_BY_PHASE[phase];
  if (cd.clock.state === 'Holding' && timeData.holdMaxTimeScale < base) return timeData.holdMaxTimeScale;
  return base;
}
