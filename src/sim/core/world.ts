// The world: plain JSON-serializable data (ARCHITECTURE §6, ADR 0003). No classes, functions,
// Map/Set, undefined or NaN anywhere inside.
import { economy, logistics, sites as siteDefs } from '@data/index';
import type {
  AnomalyId,
  Countdown,
  Entity,
  Fluid,
  Id,
  LeakChoice,
  Propellant,
  SiteId,
  SiteStatus,
  Station,
  StationReading,
  Tick,
} from '../types';
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

/**
 * Weather state (3.7): the readings above plus the seeded series behind them. In `config.weather = 'MANUAL'`
 * the environment system leaves everything untouched (tests force readings between steps).
 */
export interface WeatherState extends WeatherReadings {
  /** Series initialised (first environment tick draws the start deviations and the front). */
  initialized: boolean;
  /** Ornstein–Uhlenbeck deviations from the mean, m/s. */
  groundDevMPerS: number;
  upperDevMPerS: number;
  /** Weather front (drives A2): ramps up from `arrivalTick`, holds `durationTicks`, ramps down. */
  front: { arrivalTick: Tick; durationTicks: Tick } | null;
  /** Current front contribution to the upper wind, m/s. */
  frontBoostMPerS: number;
}

/** Which subsystems run live (scenario) or stay under test control (`createWorld` default). */
export interface SimConfig {
  /** 'SERIES': seeded weather each tick; 'MANUAL': readings stay as written. */
  weather: 'SERIES' | 'MANUAL';
  /** 'LIVE': the range system derives the five stations each tick; 'MANUAL': `cd.inputs.stations` stay as set. */
  stations: 'LIVE' | 'MANUAL';
  /** Anomaly rolls (A1–A4) and the director. */
  anomalies: boolean;
}

/** Station readings per countdown (3.7), with the driving value for the Range tab. */
export interface RangeState {
  stations: Record<Station, StationReading>;
}

export type AnomalySource = 'NATURAL' | 'DIRECTOR';

export interface AnomalyRecord {
  anomaly: AnomalyId;
  tick: Tick;
  source: AnomalySource;
  entityId: Id;
}

/** The director's guaranteed anomaly (drawn at scenario start). */
export interface DirectorPlan {
  anomaly: AnomalyId;
  /** A1 / A2: T-clock tick at which it triggers. */
  atTClockTicks: Tick | null;
  /** A3: booster LOX load fraction at which the leak starts. */
  atLoadFraction: number | null;
  /** A4: mission tick (T+) and flight phase of the engine-out. */
  atMissionTicks: Tick | null;
  done: boolean;
}

export interface LeakState {
  active: boolean;
  response: LeakChoice | null;
  /** HOLD_FIX: load paused until this tick, then full rate. */
  fixEndTick: Tick | null;
}

export interface PendingEngineOut {
  missionTicks: Tick;
  source: AnomalySource;
}

/** Anomaly bookkeeping per countdown (3.7). */
export interface AnomalyState {
  fired: AnomalyRecord[];
  director: { plan: DirectorPlan | null; fallbackUsed: boolean };
  /** A1: the intruder spawned for this attempt (one per run). */
  intruderId: Id | null;
  /** A2 counted (front arrival inside load → T-0). */
  frontCounted: boolean;
  /** A3: natural roll done at load start; onset fraction when it hit. */
  leakRolled: boolean;
  leakOnsetFraction: number | null;
  leakOnsetSource: AnomalySource | null;
  leak: LeakState;
  /** A4: rolls per flight phase and the scheduled engine-outs. */
  ascentRolled: boolean;
  boostbackRolled: boolean;
  pendingEngineOuts: PendingEngineOut[];
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
  weather: WeatherState;
  config: SimConfig;
  /** Keyed by countdown id. */
  prep: Record<Id, PrepState>;
  /** Station readings, keyed by countdown id (3.7, `config.stations = 'LIVE'`). */
  range: Record<Id, RangeState>;
  /** Anomaly state, keyed by countdown id (3.7, `config.anomalies`). */
  anomalies: Record<Id, AnomalyState>;
  /** Events not yet drained by the host. */
  outbox: SimEvent[];
}

export interface CreateWorldOptions {
  /** Unsigned 32-bit integer seed. */
  seed: number;
  /** Default: everything under test control (MANUAL weather and stations, no anomalies). Scenarios go live. */
  config?: Partial<SimConfig>;
}

export const MANUAL_CONFIG: Readonly<SimConfig> = { weather: 'MANUAL', stations: 'MANUAL', anomalies: false };
export const LIVE_CONFIG: Readonly<SimConfig> = { weather: 'SERIES', stations: 'LIVE', anomalies: true };

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

export function createWorld({ seed, config }: CreateWorldOptions): World {
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
    weather: {
      groundWindMPerS: 0,
      groundGustMPerS: 0,
      towerWindMPerS: 0,
      upperWindMPerS: 0,
      initialized: false,
      groundDevMPerS: 0,
      upperDevMPerS: 0,
      front: null,
      frontBoostMPerS: 0,
    },
    config: { ...MANUAL_CONFIG, ...config },
    prep: {},
    range: {},
    anomalies: {},
    outbox: [],
  };
}

// Sorted-id cache per countdowns record (hot path: every system iterates it each tick). Countdowns are only
// ever added, so the key count detects staleness; a loaded world has a new record and a new entry.
const ID_CACHE = new WeakMap<object, Id[]>();

/** Countdown ids in a stable order (sorted, so identical before and after a save round-trip). Do not mutate. */
export function countdownIds(world: World): readonly Id[] {
  const rec = world.countdowns;
  let ids = ID_CACHE.get(rec);
  if (!ids || ids.length !== Object.keys(rec).length) {
    ids = Object.keys(rec).sort();
    ID_CACHE.set(rec, ids);
  }
  return ids;
}
