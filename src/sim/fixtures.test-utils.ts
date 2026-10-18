// Test factories shared by the system tests (not part of the public sim API).
import { mvpFlight } from '@data/index';
import type { SimEvent } from './core/events';
import { createWorld } from './core/world';
import type { World } from './core/world';
import { spawnSiteLayout } from './entities/site';
import { step } from './step';
import { createCountdown } from './systems/countdown';
import type { Countdown, Entity, EntityOf, Id, Kind, Phase, PollId } from './types';

export interface MvpSetup {
  world: World;
  cd: Countdown;
  ids: Record<string, Id>;
}

export interface MvpOptions {
  seed?: number;
  /** T-clock at creation, s. */
  startTS?: number;
  phase?: Phase;
  pollsPassed?: PollId[];
}

/** LC-1 layout spawned + the MVP flight countdown (Standby at T-06:00:00 unless overridden). */
export function mvpSetup(opts: MvpOptions = {}): MvpSetup {
  const world = createWorld({ seed: opts.seed ?? 7 });
  const ids = spawnSiteLayout(world);
  const cd = createCountdown(world, {
    flightName: mvpFlight.name,
    siteId: mvpFlight.siteId,
    contractId: mvpFlight.contractId,
    boosterId: id(ids, mvpFlight.booster),
    shipId: id(ids, mvpFlight.ship),
    padId: id(ids, mvpFlight.mount),
    ...(opts.startTS === undefined ? {} : { startTS: opts.startTS }),
  });
  if (opts.phase) cd.phase.state = opts.phase;
  if (opts.pollsPassed) cd.pollsPassed = [...opts.pollsPassed];
  world.outbox.length = 0;
  return { world, cd, ids };
}

export function id(ids: Record<string, Id>, callSign: string): Id {
  const v = ids[callSign];
  if (!v) throw new Error(`no entity ${callSign}`);
  return v;
}

export function entity<K extends Kind>(world: World, entityId: Id, kind: K): EntityOf<K> {
  const e: Entity | undefined = world.entities.byId[entityId];
  if (e?.kind !== kind) throw new Error(`${entityId} is not a ${kind}`);
  return e as EntityOf<K>;
}

export function run(world: World, ticks: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...step(world));
  return events;
}

export function runUntil(world: World, done: () => boolean, maxTicks = 2_000_000): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < maxTicks && !done(); i++) events.push(...step(world));
  if (!done()) throw new Error('runUntil: condition not reached');
  return events;
}

export const rejected = (events: readonly SimEvent[]): string[] =>
  events.flatMap((e) => (e.t === 'CommandRejected' ? [e.reason] : []));

export function stateChanges(events: readonly SimEvent[], entityId: Id): string[] {
  return events.flatMap((e) => (e.t === 'EntityStateChanged' && e.id === entityId ? [e.to] : []));
}
