// Time rules (GDD §6, AC 23; ARCHITECTURE §3). Pure functions of sim events + world, evaluated by TimeControl after
// every tick (never inside the sim). Two mechanisms, never mixed:
// - **cap**: `maxTimeScale` (sim, per phase / hold / forced-1× window) limits the *effective* rate while it applies;
//   the requested rate is remembered. At Debrief the run is over: the cap is 0 (`RUN_ENDED`).
// - **drop**: a one-shot reset of the *requested* rate to 1×, fired by the triggers below (one per event instance).
// Skip to next milestone = fast-forward (same fixed dt, more steps per frame) to the next scheduled T-clock mark
// (poll / data milestone) or, in Safing / Scrubbed, to the Debrief; any drop trigger interrupts it.
import type { SkipBlockCode, TimeDropCode } from '@bridge/projection-types';
import { STATIONS, isPreLiftoff, maxTimeScale, secondsToTicks } from '@sim/index';
import { countdown as cdData } from '@data/index';
import type { Countdown, HoldReason, PollId, SimEvent, World } from '@sim/types';
import { blockingDecisionOpen } from '../decisions/open';

export type TimeScale = 0 | 1 | 10 | 100;

/** Why the requested rate was dropped to 1× (bridge type: the projection carries it). */
export type DropCode = TimeDropCode;
export type { SkipBlockCode };

export const DROP_LABEL: Record<DropCode, string> = {
  DECISION_OPEN: 'DECISION OPEN',
  NO_GO: 'NO-GO',
  GO_POSSIBLE: 'GO POSSIBLE',
};

export const SKIP_BLOCK_LABEL: Record<SkipBlockCode, string> = {
  RUN_ENDED: 'RUN ENDED',
  FORCED_1X: '1× LOCKED',
  DECISION_OPEN: 'DECISION OPEN',
  NO_MILESTONE: 'NO MILESTONE SCHEDULED',
};

/** A skip destination: a T-clock mark before liftoff, or the Debrief after the flight / a scrub. */
export type SkipTarget =
  { kind: 'TCLOCK'; tClockTicks: number; name: string; poll: PollId | null } | { kind: 'DEBRIEF'; name: 'DEBRIEF' };

/** Holds whose D2 strip drops the rate (GDD §13.2.1: not MANUAL, not LEAK_FIX — the player asked for those). */
const DROP_HOLDS: ReadonlySet<HoldReason> = new Set<HoldReason>(['POLL', 'NO_GO', 'LOAD_INCOMPLETE']);

/** The run is over (GDD §6: debrief = paused, rate control disabled `RUN ENDED`). */
export function runEnded(cd: Readonly<Countdown> | null): boolean {
  return cd?.phase.state === 'Debrief';
}

/** Cap of the effective rate: the sim's per-phase rule, 0 once the run ended, 100 without a countdown. */
export function capFor(world: Readonly<World>, cd: Readonly<Countdown> | null): TimeScale {
  if (!cd) return 100;
  if (runEnded(cd)) return 0;
  return maxTimeScale(world as World, cd as Countdown);
}

function allGo(cd: Readonly<Countdown>): boolean {
  return STATIONS.every((s) => cd.inputs.stations[s] === 'GO');
}

/**
 * Drop trigger fired by one tick's events (GDD §6), evaluated on the world *after* that tick:
 * - `DecisionRequired{CATCH | LEAK}` (D3, D3b) and a POLL / NO_GO / LOAD_INCOMPLETE `HoldStarted` (D2) → DECISION_OPEN;
 * - `StationChanged{NO_GO}` → NO_GO;
 * - while holding (not LEAK_FIX), a `StationChanged{GO}` that leaves all five GO → GO_POSSIBLE.
 * D1 never drops. Returns the first applicable code (priority as listed), null when none.
 */
export function dropTrigger(
  events: readonly SimEvent[],
  world: Readonly<World>,
  cd: Readonly<Countdown> | null,
): DropCode | null {
  if (events.length === 0) return null;
  let decision = false;
  let noGo = false;
  let goChange = false;
  for (const e of events) {
    switch (e.t) {
      case 'DecisionRequired':
        if (e.decision === 'CATCH' || e.decision === 'LEAK') decision = true;
        break;
      case 'HoldStarted':
        if (DROP_HOLDS.has(e.reason)) decision = true;
        break;
      case 'StationChanged':
        if (e.status === 'NO_GO') noGo = true;
        else if (e.status === 'GO') goChange = true;
        break;
      default:
        break;
    }
  }
  if (decision) return 'DECISION_OPEN';
  if (noGo) return 'NO_GO';
  if (
    goChange &&
    cd &&
    isPreLiftoff(cd.phase.state) &&
    cd.clock.state === 'Holding' &&
    cd.hold?.reason !== 'LEAK_FIX' &&
    allGo(cd)
  ) {
    return 'GO_POSSIBLE';
  }
  return null;
}

interface Mark {
  tClockTicks: number;
  name: string;
  poll: PollId | null;
}

const POLL_NAME: Record<PollId, string> = { load: 'LOAD POLL', terminal: 'TERMINAL POLL', final: 'FINAL POLL' };

/** Scheduled T-clock marks (polls + data milestones), ascending. */
const MARKS: readonly Mark[] = [
  ...(Object.entries(cdData.pollTS) as [PollId, number][]).map(([poll, tS]) => ({
    tClockTicks: secondsToTicks(tS),
    name: POLL_NAME[poll],
    poll,
  })),
  ...cdData.milestones.map((m) => ({ tClockTicks: secondsToTicks(m.tS), name: m.name.replace(/_/g, ' '), poll: null })),
].sort((a, b) => a.tClockTicks - b.tClockTicks);

/** Next skip destination, or null (flight phases, nothing scheduled). */
export function nextSkipTarget(cd: Readonly<Countdown> | null): SkipTarget | null {
  if (!cd) return null;
  const phase = cd.phase.state;
  if (phase === 'Safing' || phase === 'Scrubbed') return { kind: 'DEBRIEF', name: 'DEBRIEF' };
  if (!isPreLiftoff(phase)) return null;
  const next = MARKS.find((m) => m.tClockTicks > cd.tClockTicks);
  return next ? { kind: 'TCLOCK', ...next } : null;
}

/** Why SKIP cannot start now (GDD §6, DESIGN_SYSTEM §6.25), null when it can. */
export function skipBlocker(world: Readonly<World>, cd: Readonly<Countdown> | null): SkipBlockCode | null {
  if (runEnded(cd)) return 'RUN_ENDED';
  if (cd && capFor(world, cd) <= 1) return 'FORCED_1X';
  if (blockingDecisionOpen(world, cd)) return 'DECISION_OPEN';
  if (!nextSkipTarget(cd)) return 'NO_MILESTONE';
  return null;
}

/** The skip arrived after this tick (target mark reached, milestone/poll fired, Debrief entered). */
export function skipArrived(target: SkipTarget, events: readonly SimEvent[], cd: Readonly<Countdown> | null): boolean {
  if (!cd) return true;
  if (target.kind === 'DEBRIEF') return cd.phase.state === 'Debrief';
  if (!isPreLiftoff(cd.phase.state) || cd.tClockTicks >= target.tClockTicks) return true;
  return events.some((e) => e.t === 'Milestone' || e.t === 'PollOpened');
}
