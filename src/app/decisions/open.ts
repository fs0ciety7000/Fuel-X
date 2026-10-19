// Which MVP decisions are open (GDD §13.2.1), from the world only. Shared by the projector (decision strip, priority
// D3 > D3b > D2 > D1) and the time rules (skip is disabled while a blocking decision is open, GDD §6). D1 needs the
// projected station statuses and stays in the projector (it never touches the rate).
import { isPreLiftoff } from '@sim/index';
import type { Countdown, Entity, World } from '@sim/types';

type Booster = Extract<Entity, { kind: 'booster' }>;

/** D3: from `DecisionRequired{CATCH}` until the outcome, closed once committed and past the deadline. */
export function catchOpen(world: Readonly<World>, b: Readonly<Booster>): boolean {
  const r = b.recovery;
  if (!r || r.decisionRequiredTick === null || r.result !== null || r.deadlineTick === null) return false;
  return !(world.tick >= r.deadlineTick && r.mode !== null);
}

/** D3 for the countdown's booster. */
export function catchOpenFor(world: Readonly<World>, cd: Readonly<Countdown>): boolean {
  const b = world.entities.byId[cd.boosterId];
  return b?.kind === 'booster' && catchOpen(world, b);
}

/** D3b: A3 leak active and not answered (the sim answers DEGRADED at `leak.deadlineTick`). */
export function leakOpen(world: Readonly<World>, cd: Readonly<Countdown>): boolean {
  const leak = world.anomalies[cd.id]?.leak;
  return !!leak?.active && leak.response === null;
}

/** D2: any pre-liftoff hold (the strip offers GO / RECYCLE / SCRUB). */
export function holdOpen(cd: Readonly<Countdown>): boolean {
  return isPreLiftoff(cd.phase.state) && cd.clock.state === 'Holding' && cd.hold !== null;
}

/** A blocking decision (D2, D3, D3b) is open. */
export function blockingDecisionOpen(world: Readonly<World>, cd: Readonly<Countdown> | null): boolean {
  return !!cd && (catchOpenFor(world, cd) || leakOpen(world, cd) || holdOpen(cd));
}
