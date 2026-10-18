// The world: plain JSON-serializable data (ARCHITECTURE §6, ADR 0003). No classes, functions,
// Map/Set, undefined or NaN anywhere inside.
import { economy, sites as siteDefs } from '@data/index';
import type { Countdown, Entity, Id, SiteId, SiteStatus, Tick } from '../types';
import type { SimEvent } from './events';
import { seedAllStreams } from './rng';
import type { RngState, RngStream } from './rng';

/** Bumped on any World shape change; migrations live in src/sim/save (3.10). */
export const WORLD_SCHEMA = 1;

export interface Site {
  id: SiteId;
  name: string;
  status: SiteStatus;
}

export interface EntityTable {
  byId: Record<Id, Entity>;
  /** Insertion order: the only iteration order systems use. */
  order: Id[];
  /** Next entity serial (ids are never reused). */
  nextSerial: number;
  /** RenderSnapshot slot high-water mark. */
  nextSlot: number;
  /** Released slots, reused LIFO. */
  freeSlots: number[];
}

export interface Economy {
  moneyCr: number;
  reputation: number;
}

export interface World {
  schema: number;
  /** Index of the next tick to execute (= ticks executed so far). Sim time = tick × DT_S. */
  tick: Tick;
  seed: number;
  rng: Record<RngStream, RngState>;
  sites: Record<SiteId, Site>;
  entities: EntityTable;
  /** One per flight attempt; iterate with `countdownIds()` (sorted), never raw key order. */
  countdowns: Record<Id, Countdown>;
  economy: Economy;
  /** Events not yet drained by the host. */
  outbox: SimEvent[];
}

export interface CreateWorldOptions {
  /** Unsigned 32-bit integer seed. */
  seed: number;
}

export function createWorld({ seed }: CreateWorldOptions): World {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error(`createWorld: seed must be a uint32, got ${seed}`);
  }
  const sites = {} as Record<SiteId, Site>;
  for (const s of siteDefs) sites[s.id] = { id: s.id, name: s.name, status: s.status };
  return {
    schema: WORLD_SCHEMA,
    tick: 0,
    seed,
    rng: seedAllStreams(seed),
    sites,
    entities: { byId: {}, order: [], nextSerial: 1, nextSlot: 0, freeSlots: [] },
    countdowns: {},
    economy: { moneyCr: economy.startMoneyCr, reputation: economy.startReputation },
    outbox: [],
  };
}

/** Countdown ids in a stable order (sorted, so identical before and after a save round-trip). */
export function countdownIds(world: World): Id[] {
  return Object.keys(world.countdowns).sort();
}
