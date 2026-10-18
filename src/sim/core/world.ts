// The world: plain JSON-serializable data (ARCHITECTURE §6, ADR 0003). No classes, functions,
// Map/Set, undefined or NaN anywhere inside.
import { economy, logistics, sites as siteDefs } from '@data/index';
import type { Countdown, Entity, Fluid, Id, Propellant, SiteId, SiteStatus, Tick } from '../types';
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

/** Cumulative propellant accounting per fluid, kg (mass-conservation checks, debrief). */
export interface PropLedger {
  deliveredKg: number;
  farmBoilOffKg: number;
  /** Net farm → vehicle transfer (load + topping). */
  farmToVehicleKg: number;
  vehicleBoilOffKg: number;
  detankReturnedKg: number;
  detankLostKg: number;
}

export interface LogisticsState {
  /** Farm tank ids per fluid, in spawn order (filled by the site factory). */
  farm: Record<Fluid, Id[]>;
  /** Road into the pad hazard radius closed (T-00:40:00 → end of Safing). */
  roadClosed: boolean;
  nextOrderSerial: number;
  /** Next call-sign serial for chartered (rush) tankers, per propellant. */
  charterSerial: Record<Propellant, number>;
  /** Vehicle load-rate multiplier (unitless). Hook for the A3 GSE leak (3.7): 1 nominal, 0 = paused. */
  loadRateFactor: number;
  ledger: Record<Propellant, PropLedger>;
}

/**
 * Current weather readings at LC-1, SI. Calm (0) until the environment system (3.7) writes them each
 * tick; tests force series by writing them between steps. Prep compares the gust-inclusive ground wind to
 * the stack / transporter limits; the catch model reads the tower wind.
 */
export interface WeatherReadings {
  groundWindMPerS: number;
  groundGustMPerS: number;
  towerWindMPerS: number;
  upperWindMPerS: number;
}

/** Prep assets and the player's stack request, per countdown (3.5). */
export interface PrepState {
  towerId: Id;
  transporterId: Id;
  craneId: Id;
  /** `Stack` accepted: the tower stacks the booster, then the ship as soon as it is on the pad. */
  stackRequested: boolean;
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
  logistics: LogisticsState;
  weather: WeatherReadings;
  /** Keyed by countdown id. */
  prep: Record<Id, PrepState>;
  /** Events not yet drained by the host. */
  outbox: SimEvent[];
}

export interface CreateWorldOptions {
  /** Unsigned 32-bit integer seed. */
  seed: number;
}

function emptyLedger(): PropLedger {
  return {
    deliveredKg: 0,
    farmBoilOffKg: 0,
    farmToVehicleKg: 0,
    vehicleBoilOffKg: 0,
    detankReturnedKg: 0,
    detankLostKg: 0,
  };
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
    logistics: {
      farm: { LOX: [], CH4: [], LN2: [] },
      roadClosed: false,
      nextOrderSerial: 1,
      charterSerial: { LOX: logistics.fleet.lx + 1, CH4: logistics.fleet.mx + 1 },
      loadRateFactor: 1,
      ledger: { LOX: emptyLedger(), CH4: emptyLedger() },
    },
    weather: { groundWindMPerS: 0, groundGustMPerS: 0, towerWindMPerS: 0, upperWindMPerS: 0 },
    prep: {},
    outbox: [],
  };
}

/** Countdown ids in a stable order (sorted, so identical before and after a save round-trip). */
export function countdownIds(world: World): Id[] {
  return Object.keys(world.countdowns).sort();
}
