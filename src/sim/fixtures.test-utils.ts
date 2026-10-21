// Test factories shared by the system tests (not part of the public sim API).
import { countdown as cdData, lc1Layout, siteGeometry as geo, tower as td } from '@data/index';
import { entitiesOfKind } from './core/entities';
import type { SimEvent } from './core/events';
import { LIVE_CONFIG, createWorld } from './core/world';
import type { SimConfig, World } from './core/world';
import { createMvpFlight } from './entities/flight';
import { CARRIAGE_STACK_SHIP_M } from './math/tower';
import { spawnSiteLayout } from './entities/site';
import { step } from './step';
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
  config?: Partial<SimConfig>;
  /** Booster + ship already stacked on OLM-1 (phase Stack unless `phase` says otherwise). */
  prepped?: boolean;
}

/** LC-1 layout spawned + the MVP flight countdown (Standby at T-06:00:00 unless overridden). */
export function mvpSetup(opts: MvpOptions = {}): MvpSetup {
  const world = createWorld({ seed: opts.seed ?? 7, ...(opts.config ? { config: opts.config } : {}) });
  const ids = spawnSiteLayout(world);
  const cd = createMvpFlight(world, ids, opts.startTS === undefined ? {} : { startTS: opts.startTS });
  if (opts.prepped) {
    const b = entity(world, cd.boosterId, 'booster');
    const s = entity(world, cd.shipId, 'ship');
    b.fsm.state = 'STACKED';
    s.fsm.state = 'STACKED';
    // Asset origins (5.0b): booster on the mount deck, ship on the booster ship mount.
    b.pos = { x: 0, y: geo.pad.vehicleMountM, z: 0 };
    s.pos = { x: 0, y: geo.pad.vehicleMountM + geo.booster.shipMountM, z: 0 };
    cd.inputs.rolloutComplete = true;
    cd.inputs.stackComplete = true;
    cd.phase.state = 'Stack';
    const prep = world.prep[cd.id];
    if (prep) prep.stackRequested = true;
    // Tower as left by the ship stack: carriage on the ship lift pins, QD arm on the ship.
    const t = world.entities.byId[prep?.towerId ?? ''];
    if (t?.kind === 'tower') {
      Object.assign(t, {
        carriageM: CARRIAGE_STACK_SHIP_M,
        carriageTargetM: CARRIAGE_STACK_SHIP_M,
        qd: 'ENGAGED',
        qdArmRad: td.qdArm.engagedRad,
      });
    }
    // Past the van departure mark the crews are already at the safe area.
    if ((opts.startTS ?? cdData.scenarioStartTS) >= cdData.crew.vanDepartTS) {
      for (const v of entitiesOfKind(world, 'van')) {
        v.fsm.state = 'PARKED';
        v.pos = { ...lc1Layout.points.crewSafeArea };
      }
    }
  }
  if (opts.phase) cd.phase.state = opts.phase;
  if (opts.pollsPassed) cd.pollsPassed = [...opts.pollsPassed];
  world.outbox.length = 0;
  return { world, cd, ids };
}

/** `mvpSetup` with everything live (seeded weather, derived stations, anomalies + director). */
export function liveSetup(opts: Omit<MvpOptions, 'config'> = {}): MvpSetup {
  return mvpSetup({ ...opts, config: LIVE_CONFIG });
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

/** `events` without the ambient transporters' state changes (SP-42 duty loop, 7.3) — for exact per-tick event lists. */
export function withoutAmbient(world: World, events: readonly SimEvent[]): SimEvent[] {
  return events.filter((e) => {
    if (e.t !== 'EntityStateChanged') return true;
    const ent = world.entities.byId[e.id];
    return !(ent?.kind === 'transporter' && ent.role === 'ambient');
  });
}

export function stateChanges(events: readonly SimEvent[], entityId: Id): string[] {
  return events.flatMap((e) => (e.t === 'EntityStateChanged' && e.id === entityId ? [e.to] : []));
}
