import { countdown as cdData, mvpContract } from '@data/index';
import { describe, expect, it } from 'vitest';
import { createCommandQueue, enqueueCommand } from '../core/commands';
import type { Command } from '../core/commands';
import type { SimEvent } from '../core/events';
import { hashWorld } from '../core/serialize';
import { secondsToTicks } from '../core/time';
import { createWorld } from '../core/world';
import type { World } from '../core/world';
import { advance, step } from '../step';
import type { ClockState, Countdown, Phase, PollId, Station } from '../types';
import { roadShouldBeClosed } from './logistics';
import {
  PHASES,
  clockFsm,
  createCountdown,
  maxTimeScale,
  phaseFsm,
  type ClockTrigger,
  type PhaseTrigger,
} from './countdown';

// --- Fixtures -----------------------------------------------------------------------------------

const T = secondsToTicks; // T-offset seconds → T-clock ticks
const POLL: Record<PollId, number> = {
  load: T(cdData.pollTS.load),
  terminal: T(cdData.pollTS.terminal),
  final: T(cdData.pollTS.final),
};

interface Setup {
  world: World;
  cd: Countdown;
}

interface SetupOptions {
  startTS?: number;
  phase?: Phase;
  pollsPassed?: PollId[];
  autoGo?: boolean;
  inputs?: Partial<Countdown['inputs']>;
}

/** World + countdown starting at `startTS`, optionally forced into a later phase (factory overrides). */
function setup(opts: SetupOptions = {}): Setup {
  const world = createWorld({ seed: 7 });
  const cd = createCountdown(world, {
    flightName: 'LC-1 FLIGHT 7',
    siteId: 'LC-1',
    contractId: 'NRL-3',
    boosterId: 'e000001',
    shipId: 'e000002',
    padId: 'e000003',
    ...(opts.startTS === undefined ? {} : { startTS: opts.startTS }),
    ...(opts.autoGo === undefined ? {} : { autoGoWhenAllGreen: opts.autoGo }),
  });
  if (opts.phase) cd.phase.state = opts.phase;
  if (opts.pollsPassed) cd.pollsPassed = [...opts.pollsPassed];
  Object.assign(cd.inputs, opts.inputs);
  // Start with the road state the countdown implies, so the first tick has no RoadClosureChanged (3.4).
  world.logistics.roadClosed = roadShouldBeClosed(world);
  return { world, cd };
}

const cmd = (t: 'Go' | 'Hold' | 'Recycle' | 'Scrub', cd: Countdown): Command => ({ t, countdownId: cd.id });

function run(world: World, ticks: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...step(world));
  return events;
}

function runUntil(world: World, done: () => boolean, maxTicks = 2_000_000): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < maxTicks && !done(); i++) events.push(...step(world));
  if (!done()) throw new Error('runUntil: condition not reached');
  return events;
}

const types = (events: readonly SimEvent[]): string[] => events.map((e) => e.t);
const rejected = (events: readonly SimEvent[]): string[] =>
  events.flatMap((e) => (e.t === 'CommandRejected' ? [e.reason] : []));
const setStation = (cd: Countdown, s: Station, status: 'GO' | 'MARGINAL' | 'NO_GO'): void => {
  cd.inputs.stations[s] = status;
};

// --- FSM tables ---------------------------------------------------------------------------------

describe('phase FSM table', () => {
  const ALL_TRIGGERS: PhaseTrigger[] = [
    'StartRollout',
    'auto',
    'LoadPollPassed',
    'TerminalPollPassed',
    'T0',
    'Recycle',
    'Scrub',
    'WindowClosed',
  ];

  // [from, trigger, inputs/conditions, expected to]
  const allowed: [Phase, PhaseTrigger, Partial<Countdown['inputs']>, Phase][] = [
    ['Standby', 'StartRollout', {}, 'Rollout'],
    ['Rollout', 'auto', { rolloutComplete: true }, 'Stack'],
    ['Stack', 'LoadPollPassed', { stackComplete: true }, 'PropellantLoad'],
    ['PropellantLoad', 'TerminalPollPassed', {}, 'TerminalCount'],
    ['TerminalCount', 'T0', {}, 'Liftoff'],
    ['TerminalCount', 'Recycle', {}, 'TerminalCount'],
    ['Liftoff', 'auto', { stageSeparated: true }, 'Boostback'],
    ['Boostback', 'auto', { recoveryMode: 'CATCH' }, 'TowerCatch'],
    ['Boostback', 'auto', { recoveryMode: 'DIVERT' }, 'Divert'],
    ['TowerCatch', 'auto', { recoveryComplete: true }, 'Safing'],
    ['Divert', 'auto', { recoveryComplete: true }, 'Safing'],
    ['Scrubbed', 'auto', { detankComplete: true }, 'Debrief'],
    ...(['Standby', 'Rollout', 'Stack', 'PropellantLoad', 'TerminalCount'] as const).flatMap(
      (p): [Phase, PhaseTrigger, Partial<Countdown['inputs']>, Phase][] => [
        [p, 'Scrub', {}, 'Scrubbed'],
        [p, 'WindowClosed', {}, 'Scrubbed'],
      ],
    ),
  ];

  it.each(allowed)('%s --%s--> %s fires and emits PhaseChanged', (from, on, inputs, to) => {
    // T-02:00 so a Recycle guard (past T-00:10:00, window open) holds.
    const { world, cd } = setup({ startTS: -120, phase: from, inputs });
    const tr = phaseFsm.fire(cd.phase, on, { world, cd, hold: { reason: 'MANUAL', poll: null } });
    expect(tr?.to).toBe(to);
    expect(cd.phase.state).toBe(to);
    expect(world.outbox[0]).toEqual({ t: 'PhaseChanged', tick: 0, countdownId: cd.id, from, to, trigger: on });
  });

  it('every other (phase, trigger) pair is refused without side effects (default inputs)', () => {
    for (const from of PHASES) {
      for (const on of ALL_TRIGGERS) {
        if (allowed.some(([f, o, inputs]) => f === from && o === on && Object.keys(inputs).length === 0)) continue;
        const { world, cd } = setup({ startTS: -120, phase: from });
        const before = JSON.stringify(cd);
        expect(phaseFsm.fire(cd.phase, on, { world, cd, hold: { reason: 'MANUAL', poll: null } })).toBeNull();
        expect(JSON.stringify(cd)).toBe(before);
        expect(world.outbox).toEqual([]);
      }
    }
  });

  it('Safing → Debrief only after the configured safing duration, and stops the clock', () => {
    const { world, cd } = setup({ phase: 'Safing' });
    const c = { world, cd, hold: { reason: 'MANUAL' as const, poll: null } };
    world.tick = T(cdData.safingDurationS) - 1;
    expect(phaseFsm.fire(cd.phase, 'auto', c)).toBeNull();
    world.tick += 1;
    expect(phaseFsm.fire(cd.phase, 'auto', c)?.to).toBe('Debrief');
    expect(cd.clock.state).toBe('Stopped');
  });
});

describe('clock FSM table', () => {
  const STATES: ClockState[] = ['Counting', 'Holding', 'Stopped'];
  const TRIGGERS: ClockTrigger[] = ['Hold', 'AutoHold', 'Go', 'AutoRelease', 'Recycle', 'Stop'];
  const allowed: [ClockState, ClockTrigger, ClockState, string][] = [
    ['Counting', 'Hold', 'Holding', 'HoldStarted'],
    ['Counting', 'AutoHold', 'Holding', 'HoldStarted'],
    ['Holding', 'Go', 'Counting', 'HoldReleased'],
    ['Holding', 'AutoRelease', 'Counting', 'HoldReleased'],
    ['Holding', 'Recycle', 'Counting', 'HoldReleased'],
    ['Counting', 'Stop', 'Stopped', 'ClockChanged'],
    ['Holding', 'Stop', 'Stopped', 'ClockChanged'],
  ];

  it.each(allowed)('%s --%s--> %s emits %s', (from, on, to, event) => {
    const { world, cd } = setup({ phase: 'Stack' });
    cd.clock.state = from;
    if (from === 'Holding') cd.hold = { reason: 'MANUAL', poll: null };
    expect(clockFsm.fire(cd.clock, on, { world, cd, hold: { reason: 'NO_GO', poll: null } })?.to).toBe(to);
    expect(world.outbox.map((e) => e.t)).toEqual([event]);
    expect(cd.hold === null).toBe(to !== 'Holding');
  });

  it('refuses every other pair, and holds after liftoff', () => {
    for (const from of STATES) {
      for (const on of TRIGGERS) {
        if (allowed.some(([f, o]) => f === from && o === on)) continue;
        const { world, cd } = setup({ phase: 'Stack' });
        cd.clock.state = from;
        expect(clockFsm.fire(cd.clock, on, { world, cd, hold: { reason: 'MANUAL', poll: null } })).toBeNull();
        expect(world.outbox).toEqual([]);
      }
    }
    const { world, cd } = setup({ phase: 'Liftoff' });
    expect(clockFsm.fire(cd.clock, 'Hold', { world, cd, hold: { reason: 'MANUAL', poll: null } })).toBeNull();
  });
});

// --- Polls (AC 11) ------------------------------------------------------------------------------

describe('polls', () => {
  it('auto-GO passes the load poll without stopping when all stations are GO', () => {
    const { world, cd } = setup({ startTS: -4_801, phase: 'Stack', inputs: { stackComplete: true } });
    const events = run(world, 60);
    expect(types(events)).toEqual(['PollOpened', 'PollPassed', 'PhaseChanged']);
    expect(events[1]).toMatchObject({ poll: 'load', auto: true, marginal: [] });
    expect(cd.phase.state).toBe('PropellantLoad');
    expect(cd.tClockTicks).toBe(T(-4_801) + 60);
  });

  it('a MARGINAL station blocks the poll until a player GO, then records the risk', () => {
    const { world, cd } = setup({ startTS: -4_801, phase: 'Stack', inputs: { stackComplete: true } });
    setStation(cd, 'WEATHER', 'MARGINAL');
    const before = run(world, 30 * 60 * 5); // 5 min of sim time
    expect(cd.tClockTicks).toBe(POLL.load);
    expect(cd.clock.state).toBe('Holding');
    expect(cd.hold).toEqual({ reason: 'POLL', poll: 'load' });
    expect(types(before)).toEqual(['PollOpened', 'HoldStarted', 'DecisionRequired']);
    expect(before[2]).toMatchObject({ decision: 'POLL', poll: 'load', deadlineTick: cd.windowCloseTick });

    const go = step(world, [cmd('Go', cd)]);
    expect(types(go)).toEqual(['PollPassed', 'PhaseChanged', 'HoldReleased']);
    expect(go[0]).toMatchObject({ poll: 'load', auto: false, marginal: ['WEATHER'] });
    expect(go[2]).toMatchObject({ reason: 'POLL', by: 'GO' });
    expect(cd.goWithMarginal).toEqual(['WEATHER']);
    expect(cd.tClockTicks).toBe(POLL.load + 1);
  });

  it('the load poll needs the stack: GO is refused, then auto-passes once stacking ends', () => {
    const { world, cd } = setup({ startTS: -4_801, phase: 'Stack' });
    run(world, 100);
    expect(cd.hold).toEqual({ reason: 'POLL', poll: 'load' });
    expect(rejected(step(world, [cmd('Go', cd)]))).toEqual(['STACK_NOT_COMPLETE']);
    cd.inputs.stackComplete = true;
    const events = step(world);
    expect(types(events)).toEqual(['PollPassed', 'PhaseChanged', 'HoldReleased']);
    expect(events[2]).toMatchObject({ by: 'AUTO' });
    expect(cd.phase.state).toBe('PropellantLoad');
  });

  it('with autoGoWhenAllGreen off, each of the three polls needs a GO', () => {
    const { world, cd } = setup({
      startTS: -4_801,
      phase: 'Stack',
      autoGo: false,
      inputs: { stackComplete: true, loadComplete: true },
    });
    const goes: PollId[] = [];
    runUntil(world, () => {
      if (cd.hold?.reason === 'POLL') {
        expect(cd.tClockTicks).toBe(POLL[cd.hold.poll ?? 'load']);
        goes.push(cd.hold.poll ?? 'load');
        expect(rejected(step(world, [cmd('Go', cd)]))).toEqual([]);
      }
      return cd.phase.state === 'Liftoff';
    });
    expect(goes).toEqual(['load', 'terminal', 'final']);
    expect(cd.pollsPassed).toEqual(['load', 'terminal', 'final']);
    expect(cd.tClockTicks).toBe(0);
  });

  it('GO when nothing is held is refused', () => {
    const { world, cd } = setup();
    expect(rejected(step(world, [cmd('Go', cd)]))).toEqual(['NOT_HOLDING']);
  });
});

// --- Hold (AC 12) -------------------------------------------------------------------------------

describe('HOLD', () => {
  it('stops the T-clock while sim time and the window keep running; GO resumes', () => {
    const { world, cd } = setup({ startTS: -3_000, phase: 'PropellantLoad', pollsPassed: ['load'] });
    const window = { open: cd.windowOpenTick, close: cd.windowCloseTick };
    const held = step(world, [cmd('Hold', cd)]);
    expect(types(held)).toEqual(['HoldStarted']);
    expect(held[0]).toMatchObject({ reason: 'MANUAL', poll: null, tClockTicks: T(-3_000) });
    const tClock = cd.tClockTicks;
    run(world, 900);
    expect(cd.tClockTicks).toBe(tClock);
    expect(world.tick).toBe(901);
    expect(cd.windowCloseTick - world.tick).toBe(window.close - 901); // window kept closing
    expect(cd.windowOpenTick).toBe(window.open);
    expect(rejected(step(world, [cmd('Hold', cd)]))).toEqual(['ALREADY_HOLDING']);
    const go = step(world, [cmd('Go', cd)]);
    expect(go[0]).toMatchObject({ t: 'HoldReleased', reason: 'MANUAL', by: 'GO' });
    expect(cd.tClockTicks).toBe(tClock + 1);
  });

  it('a NO-GO station auto-holds the count; GO is refused until it clears, never auto-released', () => {
    const { world, cd } = setup({ startTS: -3_000, phase: 'PropellantLoad', pollsPassed: ['load'] });
    setStation(cd, 'RANGE', 'NO_GO');
    expect(step(world)[0]).toMatchObject({ t: 'HoldStarted', reason: 'NO_GO' });
    expect(rejected(step(world, [cmd('Go', cd)]))).toEqual(['STATION_NO_GO']);
    setStation(cd, 'RANGE', 'GO');
    run(world, 30);
    expect(cd.clock.state).toBe('Holding');
    expect(types(step(world, [cmd('Go', cd)]))).toEqual(['HoldReleased']);
  });

  it('a NO-GO station does not stop the count during prep (stack wind holds are task holds)', () => {
    const { world, cd } = setup({ startTS: -10_000, phase: 'Stack' });
    setStation(cd, 'WEATHER', 'NO_GO');
    run(world, 30);
    expect(cd.clock.state).toBe('Counting');
  });

  it('is refused after liftoff and once stopped', () => {
    const lifted = setup({ phase: 'Liftoff' });
    expect(rejected(step(lifted.world, [cmd('Hold', lifted.cd)]))).toEqual(['NOT_HOLDABLE']);
    const scrubbed = setup({ phase: 'Stack' });
    step(scrubbed.world, [cmd('Scrub', scrubbed.cd)]);
    expect(rejected(step(scrubbed.world, [cmd('Hold', scrubbed.cd)]))).toEqual(['NOT_HOLDABLE']);
  });
});

describe('auto-hold at T-00:03:00 (AC 15)', () => {
  const terminal = (autoGo = true): Setup =>
    setup({ startTS: -181, phase: 'TerminalCount', pollsPassed: ['load', 'terminal'], autoGo });

  it('holds at T-00:03:00 if the load is not complete, auto-releases when it completes', () => {
    const { world, cd } = terminal();
    const events = run(world, 60);
    expect(types(events)).toEqual(['Milestone', 'HoldStarted']);
    expect(events[1]).toMatchObject({ reason: 'LOAD_INCOMPLETE', tClockTicks: T(-180) });
    expect(cd.tClockTicks).toBe(T(-180));
    expect(rejected(step(world, [cmd('Go', cd)]))).toEqual(['LOAD_INCOMPLETE']);
    cd.inputs.loadComplete = true;
    const release = step(world);
    expect(release[0]).toMatchObject({ t: 'HoldReleased', reason: 'LOAD_INCOMPLETE', by: 'AUTO' });
    expect(cd.tClockTicks).toBe(T(-180) + 1);
  });

  it('without auto-GO the player must release it', () => {
    const { world, cd } = terminal(false);
    runUntil(world, () => cd.clock.state === 'Holding');
    cd.inputs.loadComplete = true;
    run(world, 10);
    expect(cd.clock.state).toBe('Holding');
    expect(types(step(world, [cmd('Go', cd)]))).toEqual(['HoldReleased']);
  });

  it('does not hold when the load is complete', () => {
    const { world, cd } = setup({
      startTS: -181,
      phase: 'TerminalCount',
      pollsPassed: ['load', 'terminal'],
      inputs: { loadComplete: true },
    });
    const events = run(world, 60);
    expect(types(events)).toEqual(['Milestone']);
    expect(events[0]).toMatchObject({ name: 'TERMINAL_FORCE_1X' });
    expect(cd.clock.state).toBe('Counting');
  });
});

// --- Recycle & scrub (AC 12) --------------------------------------------------------------------

describe('RECYCLE', () => {
  it('returns the T-clock to T-00:10:00 and re-runs the final poll', () => {
    const { world, cd } = setup({
      startTS: -30,
      phase: 'TerminalCount',
      pollsPassed: ['load', 'terminal', 'final'],
      inputs: { loadComplete: true },
    });
    const events = step(world, [cmd('Recycle', cd)]);
    expect(types(events)).toEqual(['PhaseChanged', 'Recycled']);
    expect(events[0]).toMatchObject({ from: 'TerminalCount', to: 'TerminalCount', trigger: 'Recycle' });
    expect(events[1]).toMatchObject({ fromTClockTicks: T(-30), toTClockTicks: T(-600) });
    expect(cd.pollsPassed).toEqual(['load', 'terminal']);
    expect(cd.tClockTicks).toBe(T(-600) + 1);
    const toFinal = runUntil(world, () => cd.pollsPassed.includes('final'));
    expect(types(toFinal)).toContain('PollOpened');
  });

  it('from a hold releases it (by RECYCLE)', () => {
    const { world, cd } = setup({ startTS: -181, phase: 'TerminalCount', pollsPassed: ['load', 'terminal'] });
    runUntil(world, () => cd.hold?.reason === 'LOAD_INCOMPLETE');
    const events = step(world, [cmd('Recycle', cd)]);
    expect(types(events)).toEqual(['PhaseChanged', 'Recycled', 'HoldReleased']);
    expect(events[2]).toMatchObject({ reason: 'LOAD_INCOMPLETE', by: 'RECYCLE' });
    expect(cd.clock.state).toBe('Counting');
  });

  it('is refused outside terminal count, at the recycle point, and after the window', () => {
    const load = setup({ startTS: -3_000, phase: 'PropellantLoad' });
    expect(rejected(step(load.world, [cmd('Recycle', load.cd)]))).toEqual(['NOT_IN_TERMINAL_COUNT']);
    const atPoint = setup({ startTS: -600, phase: 'TerminalCount' });
    expect(rejected(step(atPoint.world, [cmd('Recycle', atPoint.cd)]))).toEqual(['NOT_PAST_RECYCLE_POINT']);
    const late = setup({ startTS: -60, phase: 'TerminalCount' });
    late.world.tick = late.cd.windowCloseTick;
    expect(rejected(step(late.world, [cmd('Recycle', late.cd)]))).toContain('WINDOW_CLOSED');
  });
});

describe('SCRUB', () => {
  it('ends the attempt: Scrubbed, clock stopped, then Debrief once detanked', () => {
    const { world, cd } = setup({ startTS: -2_000, phase: 'PropellantLoad', pollsPassed: ['load'] });
    const events = step(world, [cmd('Scrub', cd)]);
    expect(types(events)).toEqual(['PhaseChanged', 'ClockChanged', 'RoadClosureChanged']);
    expect(events[0]).toMatchObject({ from: 'PropellantLoad', to: 'Scrubbed', trigger: 'Scrub' });
    expect(cd.scrubReason).toBe('COMMAND');
    const tClock = cd.tClockTicks;
    run(world, 300);
    expect(cd.tClockTicks).toBe(tClock);
    expect(cd.phase.state).toBe('Scrubbed');
    cd.inputs.detankComplete = true;
    expect(step(world)[0]).toMatchObject({ t: 'PhaseChanged', from: 'Scrubbed', to: 'Debrief' });
  });

  it('is refused after liftoff', () => {
    const { world, cd } = setup({ phase: 'Boostback' });
    expect(rejected(step(world, [cmd('Scrub', cd)]))).toEqual(['NOT_SCRUBBABLE']);
  });
});

// --- Window (AC 13) -----------------------------------------------------------------------------

describe('launch window', () => {
  it('is placed from the contract relative to the scenario start', () => {
    const { cd } = setup();
    expect(cd.windowOpenTick).toBe(T(mvpContract.windowOpenTS - cdData.scenarioStartTS));
    expect(cd.windowCloseTick - cd.windowOpenTick).toBe(T(mvpContract.windowDurationS));
  });

  it('closing during a hold auto-scrubs with the window-missed penalty', () => {
    const { world, cd } = setup({ startTS: -300, phase: 'TerminalCount', pollsPassed: ['load', 'terminal'] });
    step(world, [cmd('Hold', cd)]);
    const events = runUntil(world, () => cd.phase.state === 'Scrubbed');
    expect(world.tick - 1).toBe(cd.windowCloseTick); // scrubbed on the closing tick itself
    // The scrub also reopens the road into the hazard radius (3.4 logistics).
    // 3.8 economy books the penalty and closes the contract in the same tick.
    expect(types(events)).toEqual([
      'PhaseChanged',
      'WindowMissed',
      'ClockChanged',
      'RoadClosureChanged',
      'LedgerPosted',
      'ContractUpdated',
    ]);
    expect(events[0]).toMatchObject({ from: 'TerminalCount', to: 'Scrubbed', trigger: 'WindowClosed' });
    expect(events[1]).toMatchObject({ contractId: 'NRL-3', penaltyCr: mvpContract.penaltyWindowMissedCr });
    expect(cd.scrubReason).toBe('WINDOW_CLOSED');
    expect(cd.clock.state).toBe('Stopped');
  });

  it('the final poll refuses GO if T-0 would fall before the window opens', () => {
    const { world, cd } = setup({
      startTS: -41,
      phase: 'TerminalCount',
      pollsPassed: ['load', 'terminal'],
      inputs: { loadComplete: true },
    });
    cd.windowOpenTick = world.tick + T(3_600);
    run(world, 60);
    expect(cd.hold).toEqual({ reason: 'POLL', poll: 'final' });
    expect(rejected(step(world, [cmd('Go', cd)]))).toEqual(['WINDOW_NOT_OPEN_AT_T0']);
  });
});

// --- Full nominal count -------------------------------------------------------------------------

/** Scripted inputs standing in for 3.4–3.6 until those systems exist. */
function nominalRun(seed = 7, extra: (world: World, cd: Countdown) => void = () => {}): Setup & { log: SimEvent[] } {
  const world = createWorld({ seed });
  const cd = createCountdown(world, {
    flightName: 'LC-1 FLIGHT 7',
    siteId: 'LC-1',
    contractId: 'NRL-3',
    boosterId: 'e000001',
    shipId: 'e000002',
    padId: 'e000003',
  });
  const q = createCommandQueue();
  enqueueCommand(q, 0, { t: 'StartRollout', boosterId: 'e000001' });
  const log: SimEvent[] = [];
  for (let i = 0; i < 2_000_000 && cd.phase.state !== 'Debrief'; i++) {
    const tS = cd.tClockTicks / 30;
    if (tS >= -14_000) cd.inputs.rolloutComplete = true;
    if (tS >= -9_000) cd.inputs.stackComplete = true;
    if (tS >= -1_900) cd.inputs.loadComplete = true;
    if (tS >= 160) cd.inputs.stageSeparated = true;
    if (tS >= 380) cd.inputs.recoveryMode = 'CATCH';
    if (tS >= 415) cd.inputs.recoveryComplete = true;
    extra(world, cd);
    advance(world, 1, q);
    log.push(...world.outbox.splice(0));
  }
  return { world, cd, log };
}

describe('nominal count, T-06:00:00 → debrief', () => {
  const { world, cd, log } = nominalRun();

  it('walks every phase in order with liftoff exactly at T-0', () => {
    const phases = log.flatMap((e) => (e.t === 'PhaseChanged' ? [e.to] : []));
    expect(phases).toEqual([
      'Rollout',
      'Stack',
      'PropellantLoad',
      'TerminalCount',
      'Liftoff',
      'Boostback',
      'TowerCatch',
      'Safing',
      'Debrief',
    ]);
    // No holds: T-0 is reached 6 h of ticks after the start.
    expect(cd.liftoffTick).toBe(T(21_600) - 1);
    expect(types(log)).not.toContain('HoldStarted');
    expect(cd.pollsPassed).toEqual(['load', 'terminal', 'final']);
    expect(cd.clock.state).toBe('Stopped');
  });

  it('emits the T-clock milestones in order', () => {
    expect(log.flatMap((e) => (e.t === 'Milestone' ? [e.name] : []))).toEqual(cdData.milestones.map((m) => m.name));
  });

  it('reaches Debrief exactly the safing duration after entering Safing', () => {
    const safing = log.find((e) => e.t === 'PhaseChanged' && e.to === 'Safing');
    const debrief = log.find((e) => e.t === 'PhaseChanged' && e.to === 'Debrief');
    expect((debrief?.tick ?? 0) - (safing?.tick ?? 0)).toBe(T(cdData.safingDurationS));
    expect(world.tick).toBe((debrief?.tick ?? 0) + 1);
  });

  it('is deterministic: same inputs → same event log and world hash', () => {
    const again = nominalRun();
    expect(again.log).toEqual(log);
    expect(hashWorld(again.world)).toBe(hashWorld(world));
  });

  it('a 10-minute hold shifts liftoff by exactly 10 minutes', () => {
    const held = nominalRun(7, (w, c) => {
      if (c.tClockTicks === T(-1_200) && c.clock.state === 'Counting') {
        step(w, [{ t: 'Hold', countdownId: c.id }]);
        advance(w, T(600) - 1);
        step(w, [{ t: 'Go', countdownId: c.id }]);
      }
    });
    expect(held.cd.liftoffTick).toBe(T(21_600) - 1 + T(600));
  });
});

// --- Time-scale caps (GDD §6) -------------------------------------------------------------------

describe('maxTimeScale', () => {
  it.each<[Phase, number, number]>([
    ['Rollout', -10_000, 100],
    ['PropellantLoad', -3_000, 10],
    ['TerminalCount', -300, 10],
    ['TerminalCount', -180, 1],
    ['Liftoff', 10, 1],
    ['TowerCatch', 400, 1],
    ['Debrief', 3_000, 100],
  ])('%s at T%+d s → %d×', (phase, tS, expected) => {
    const { world, cd } = setup({ startTS: tS, phase });
    expect(maxTimeScale(world, cd)).toBe(expected);
  });

  it('caps holds at 10× and forces 1× for 30 s after entering Safing', () => {
    const { world, cd } = setup({ startTS: -10_000, phase: 'Stack' });
    step(world, [cmd('Hold', cd)]);
    expect(maxTimeScale(world, cd)).toBe(10);
    const safing = setup({ phase: 'Safing' });
    safing.cd.phase.enteredTick = 0;
    safing.world.tick = T(29);
    expect(maxTimeScale(safing.world, safing.cd)).toBe(1);
    safing.world.tick = T(30);
    expect(maxTimeScale(safing.world, safing.cd)).toBe(100);
  });
});
