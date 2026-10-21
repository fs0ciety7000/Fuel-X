// The world: plain JSON-serializable data (ARCHITECTURE §6, ADR 0003). No classes, functions,
// Map/Set, undefined or NaN anywhere inside.
import { economy, logistics, sites as siteDefs, weather as wx } from '@data/index';
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
export const WORLD_SCHEMA = 6;

/** Mean ground wind direction (meteorological, from), rad. */
export const WIND_FROM_MEAN_RAD = (wx.groundWind.fromDeg * Math.PI) / 180;

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

export type LedgerItem =
  | 'HAULAGE_FEE'
  | 'PROPELLANT_PURCHASE'
  | 'PROPELLANT_LOST'
  | 'CONTRACT_PRICE'
  | 'SHIP_EXPENDED'
  | 'BOOSTER_REFURB'
  | 'BOOSTER_LOST'
  | 'TOWER_REPAIR'
  | 'TOWER_DOWNTIME'
  | 'WINDOW_MISSED'
  | 'OPS_COST';

/** One money / reputation posting (3.8). `countdownId` = the attempt it is charged to (null: none active). */
export interface LedgerEntry {
  tick: Tick;
  countdownId: Id | null;
  item: LedgerItem;
  /** Signed, cr (negative = cost). */
  amountCr: number;
  /** Signed reputation points. */
  reputationDelta: number;
  /** Order id / call-sign the posting refers to ('' when none). */
  ref: string;
}

/** Money, reputation and booster state when an attempt started, and where its count ended (debrief). */
export interface AttemptStart {
  tick: Tick;
  moneyCr: number;
  reputation: number;
  boosterWear: number;
  boosterFlights: number;
  /** T-clock when the attempt was first seen, ticks. */
  tClockTicks: Tick;
  /** Liftoff or scrub: tick and T-clock (hold time = sim time − T-clock time between start and end). */
  endTick: Tick | null;
  endTClockTicks: Tick | null;
  /** Cumulative detank loss already priced (ledger kg at the attempt start). */
  lostKgAtStart: Record<Propellant, number>;
  deliveredKgAtStart: Record<Propellant, number>;
}

export interface Economy {
  moneyCr: number;
  /** 0–100. */
  reputation: number;
  ledger: LedgerEntry[];
  /** Keyed by countdown id. */
  attempts: Record<Id, AttemptStart>;
}

export type ContractStatus = 'ACTIVE' | 'FULFILLED' | 'WINDOW_MISSED';

export interface ContractState {
  id: string;
  status: ContractStatus;
  countdownId: Id;
  /** Tick of fulfilment (ship SECO) or of the miss. */
  closedTick: Tick | null;
}

/**
 * Decision-log tag (GDD §13.2.1): `PLAYER` / `DIRECTOR` = the command's source, `AUTO` = the sim's documented
 * default when nobody answered, `FORCED` = no choice existed.
 */
export type DecisionBy = 'PLAYER' | 'AUTO' | 'FORCED' | 'DIRECTOR';

/** One entry of the timestamped decision log (AC 22). `detail` is a compact machine string for the UI. */
export interface DecisionEntry {
  tick: Tick;
  /** T-clock at the decision (negative before liftoff), ticks. */
  tClockTicks: Tick;
  kind: string;
  detail: string;
  by: DecisionBy;
}

export type DebriefOutcome = 'CAUGHT' | 'DIVERTED' | 'CATCH_FAILED' | 'SCRUBBED';

/** Debrief data, built when the attempt enters Debrief (GDD §4.9, §9, AC 22). SI / cr. */
export interface Debrief {
  countdownId: Id;
  flightName: string;
  contractId: string;
  outcome: DebriefOutcome;
  contractStatus: ContractStatus;
  readyTick: Tick;
  liftoffTick: Tick | null;
  /** Sim time spent with the T-clock stopped before liftoff (holds), s. */
  holdS: number;
  moneyStartCr: number;
  moneyEndCr: number;
  moneyDeltaCr: number;
  reputationStart: number;
  reputationEnd: number;
  reputationDelta: number;
  /** Postings charged to this attempt, summed per item, in first-posting order. */
  lines: { item: LedgerItem; amountCr: number; reputationDelta: number }[];
  booster: {
    id: Id;
    callSign: string;
    state: string;
    enginesOut: number;
    wearBefore: number;
    wearAfter: number;
    flightsBefore: number;
    flightsAfter: number;
  };
  towerState: string;
  recovery: { mode: string; result: string; p: number; roll: number | null; decidedBy: string } | null;
  propellant: { deliveredKg: Record<Propellant, number>; lostKg: Record<Propellant, number> };
  anomalies: AnomalyRecord[];
  decisions: DecisionEntry[];
  /** Until the pad and booster can fly again: refurb (caught), tower repair (damaged), 0 otherwise, s. */
  turnaroundS: number;
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
  /**
   * Ground wind direction (5.10), meteorological convention: compass bearing the wind blows FROM, clockwise from
   * north, rad in [0, 2π) (0 = from north, π/2 = from east). Site axes (ARCHITECTURE §6: +x east, −z north): the air
   * (steam, smoke) drifts TOWARD (x, z) = (−sin windFromRad, +cos windFromRad). Mean `weather.groundWind.fromDeg`.
   */
  windFromRad: number;
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
  /** Ornstein–Uhlenbeck deviation of the wind direction from its mean, rad (rng stream 'wind'). */
  windDirDevRad: number;
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
  /**
   * D3b deadline (6.8): min(onset + A3.decisionTimeoutS, window close). Unanswered at this tick → DEGRADED by AUTO.
   * Null when no leak has started.
   */
  deadlineTick: Tick | null;
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
  /** Contract states by contract id (3.8). */
  contracts: Record<string, ContractState>;
  /** Timestamped decision log per countdown id (3.8). */
  decisions: Record<Id, DecisionEntry[]>;
  /** Debrief per countdown id, set on entering Debrief (3.8). */
  debriefs: Record<Id, Debrief>;
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
    economy: { moneyCr: economy.startMoneyCr, reputation: economy.startReputation, ledger: [], attempts: {} },
    contracts: {},
    decisions: {},
    debriefs: {},
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
      windFromRad: WIND_FROM_MEAN_RAD,
      initialized: false,
      groundDevMPerS: 0,
      upperDevMPerS: 0,
      windDirDevRad: 0,
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

// Sorted-id cache per countdowns record (hot path: every system iterates it each tick). Countdowns are only ever
// added (by `createCountdown`, which calls `invalidateCountdownIds`); the key count is re-verified once per tick as
// a backstop for direct writes. A loaded world has a new record and a new entry.
interface IdCache {
  ids: Id[];
  /** `world.tick` of the last key-count check. */
  checkedTick: number;
}
const ID_CACHE = new WeakMap<object, IdCache>();

/** Own enumerable key count without allocating a key array. */
function ownKeyCount(rec: object): number {
  let n = 0;
  for (const k in rec) if (Object.hasOwn(rec, k)) n++;
  return n;
}

/** Drops the cached id list of `world.countdowns` (call after adding a countdown). */
export function invalidateCountdownIds(world: World): void {
  ID_CACHE.delete(world.countdowns);
}

/** Countdown ids in a stable order (sorted, so identical before and after a save round-trip). Do not mutate. */
export function countdownIds(world: World): readonly Id[] {
  const rec = world.countdowns;
  let c = ID_CACHE.get(rec);
  if (c && c.checkedTick !== world.tick) {
    if (c.ids.length !== ownKeyCount(rec)) c = undefined;
    else c.checkedTick = world.tick;
  }
  if (!c) {
    c = { ids: Object.keys(rec).sort(), checkedTick: world.tick };
    ID_CACHE.set(rec, c);
  }
  return c.ids;
}
