// Shared sim types (ARCHITECTURE §6). Render/UI import these with `import type` only.
import type {
  AnomalyId,
  AssetKey,
  EntityKind,
  FlightEvent,
  Fluid,
  Lc1PathId,
  MilestoneName,
  PollId,
  Propellant,
  SiteId,
  SiteStatus,
  Station,
} from '@data/index';

export type { AnomalyId, AssetKey, Fluid, Lc1PathId, MilestoneName, PollId, Propellant, SiteId, SiteStatus, Station };
export type {
  World,
  Site,
  EntityTable,
  Economy,
  LogisticsState,
  PrepState,
  PropLedger,
  WeatherReadings,
  WeatherState,
  SimConfig,
  RangeState,
  AnomalyRecord,
  AnomalySource,
  AnomalyState,
  DirectorPlan,
  LeakState,
  PendingEngineOut,
  LedgerItem,
  LedgerEntry,
  AttemptStart,
  ContractStatus,
  ContractState,
  DecisionBy,
  DecisionEntry,
  DebriefOutcome,
  Debrief,
} from './core/world';
export type { SimEvent, SimEventInput, SimEventType } from './core/events';
export type { Command, CommandType, CommandOf, StampedCommand } from './core/commands';
export type { RngState, RngStream } from './core/rng';

/** Stable entity id, e.g. 'e000123'; never the call-sign. */
export type Id = string;
/** Integer tick count at SIM_TICK_HZ. */
export type Tick = number;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** Stored FSM state: timers compare `enteredTick + durationTicks`, never callbacks. */
export interface FsmState<S extends string> {
  state: S;
  enteredTick: Tick;
}

// --- Entities -----------------------------------------------------------------------------------

export type Kind = EntityKind;

export interface EntityBase<K extends Kind> {
  id: Id;
  kind: K;
  callSign: string;
  siteId: SiteId;
  /**
   * Asset origin in site-local world metres (X east, Y up, Z south; 5.0b): render places the GLB here as-is, e.g. a
   * stacked booster at y 20 (PAD `SOCKET_VehicleMount`), a stage on a transporter at its y + 4.6 (`SOCKET_Cargo`).
   */
  pos: Vec3;
  /** Asset orientation (glTF frame); flying stages carry their attitude here. */
  rot: Quat;
  /** Index into RenderSnapshot arrays, stable while alive. */
  slot: number;
  asset: AssetKey;
}

/** Propellant on board a stage, kg. */
export interface PropTanks {
  loxKg: number;
  ch4Kg: number;
  loxCapKg: number;
  ch4CapKg: number;
}

/** Path following along a named site path (src/data/site-lc1.ts). */
export interface RouteState {
  pathId: Lc1PathId;
  /** Ticks moved along the path (distance = movedTicks × speed × DT, capped at the path length). */
  movedTicks: number;
  speedMPerS: number;
}

/** ARCHITECTURE §7.2. Prep (3.5) → load (3.4) → flight (3.6). */
export type BoosterState =
  | 'IN_YARD'
  | 'ON_TRANSPORTER'
  | 'STACKING'
  | 'STACKED'
  | 'LOADING'
  | 'LOADED'
  | 'DETANKING'
  | 'ASCENT'
  | 'BOOSTBACK'
  | 'DESCENT'
  | 'DIVERTED'
  | 'CAUGHT_SAFING'
  | 'LOST';
export type ShipState =
  | 'IN_YARD'
  | 'ON_TRANSPORTER'
  | 'STACKING'
  | 'STACKED'
  | 'LOADING'
  | 'LOADED'
  | 'DETANKING'
  | 'ASCENT'
  | 'SEPARATED'
  | 'SECO'
  | 'OFF_SCENE'
  | 'LOST';
export type TankerState = 'OFFMAP' | 'INBOUND' | 'GATE_WAIT' | 'OFFLOADING' | 'OUTBOUND';
export type TowerState = 'IDLE' | 'STACKING' | 'WIND_HOLD' | 'CATCH_READY' | 'CATCHING' | 'DAMAGED';
export type ArmsState = 'OPEN' | 'CLOSED';
/** Ship quick-disconnect arm on TOWER-1 (5.0). Anything but STOWED keeps the carriage out of the keep-out band. */
export type QdArmState = 'STOWED' | 'ENGAGING' | 'ENGAGED' | 'RETRACTING';
/** Which side of the carriage ⇄ QD interlock is waiting (5.0). */
export type TowerInterlock = 'NONE' | 'CARRIAGE_HELD' | 'QD_HELD';
export type TransporterState = 'IDLE' | 'LOADING' | 'MOVING' | 'WIND_HOLD' | 'AT_PAD' | 'RETURNING';
export type CraneState = 'IDLE' | 'LIFTING';
/** Picket: PATROL → INTERCEPT → ESCORT → RETURNING → PATROL (DOCKED unused in the MVP). Recovery: ON_STATION.
 *  Intruder: IN_AREA → INTERCEPTED → LEAVING (→ despawn). */
export type BoatState =
  'DOCKED' | 'PATROL' | 'INTERCEPT' | 'ESCORT' | 'RETURNING' | 'ON_STATION' | 'IN_AREA' | 'INTERCEPTED' | 'LEAVING';
export type BoatRole = 'picket' | 'recovery' | 'intruder';
export type VanState = 'PARKED' | 'TO_PAD' | 'AT_PAD' | 'TO_SAFE';

/** Straight-line move at constant speed; arrival exactly `totalTicks` after the start. */
export interface Leg {
  from: Vec3;
  to: Vec3;
  speedMPerS: number;
  movedTicks: number;
  totalTicks: number;
}

/** A timed prep task; `elapsedTicks` only advances while the task is not paused (wind). */
export interface TaskProgress {
  /** Stage being lifted / stacked. */
  stageId: Id;
  elapsedTicks: number;
  durationTicks: number;
}

export interface Engines {
  total: number;
  lit: number;
  /** Engines out (A4), cumulative for this flight. */
  failed: number;
}

/** Flight events in the event log: the booster keyframes plus ship SECO and the divert splashdown. */
export type FlightEventName = FlightEvent | 'SECO' | 'SPLASHDOWN';

/** Live flight telemetry, SI (3.6). Heading = compass heading of the ground track, rad. */
export interface FlightTelemetry {
  /** Vehicle origin above site ground (= `pos.y`), m: 20 on the mount at liftoff, 60 at the tower catch. */
  altitudeM: number;
  downrangeM: number;
  speedMPerS: number;
  verticalSpeedMPerS: number;
  /** Ground-track compass heading, rad (flips during boostback). */
  headingRad: number;
  /**
   * Attitude (5.0b): long axis tilted from vertical in the launch plane, rad (+ toward downrange, − back toward the
   * site; 0 = upright). `rot` is the on-pad yaw composed with this tilt, so render only reads `rot`.
   */
  tiltRad: number;
}
export interface BoosterFlight extends FlightTelemetry {
  /** Time along the nominal profile, s (equals mission time unless an ascent engine-out stretched the burn). */
  profileTimeS: number;
  /** dProfileTime / dMissionTime; < 1 between an ascent engine-out and MECO. */
  profileRate: number;
  /** Index of the next keyframe whose event has not fired yet. */
  nextKeyframe: number;
  failedAscent: number;
  failedBoostback: number;
  /** Landing-propellant penalty from engine-outs, kg. */
  landingPropPenaltyKg: number;
  /** Ground-track offset toward the offshore divert point, m. */
  aimOffsetM: number;
  /** CATCH committed at this profile time with this offset; the aim then converges on the tower. */
  aimDecision: { profileTimeS: number; offsetM: number } | null;
  done: boolean;
}
export interface ShipFlight extends FlightTelemetry {
  /** Profile time; after separation it runs from the hot-staging keyframe to SECO. */
  profileTimeS: number;
  /** Ship origin altitude / downrange at separation (on top of the tilted booster), m; SECO is lerped from here. */
  sepAltitudeM: number;
  sepDownrangeM: number;
  done: boolean;
}

export type RecoveryDecidedBy = 'PLAYER' | 'AUTO' | 'FORCED';
export type ForcedDivertReason = 'LOW_PROPELLANT' | 'TOWER_WIND';
export type RecoveryResult = 'CAUGHT' | 'CATCH_FAILED' | 'DIVERTED';

/** Catch decision and outcome (GDD §4.8). `p`/`sigmaM` are live until the outcome, then frozen. */
export interface RecoveryState {
  p: number;
  sigmaM: number;
  /** Predicted propellant at landing-burn ignition, kg. */
  landingPropKg: number;
  towerWindMPerS: number;
  forcedDivert: ForcedDivertReason | null;
  decisionRequiredTick: Tick | null;
  /** Landing-burn ignition. */
  deadlineTick: Tick | null;
  mode: RecoveryMode | null;
  decidedBy: RecoveryDecidedBy | null;
  result: RecoveryResult | null;
  /** The single seeded roll (uniform [0, 1)); success when roll < p. */
  roll: number | null;
}

export interface BoosterFields {
  fsm: FsmState<BoosterState>;
  prop: PropTanks;
  engines: Engines;
  flight: BoosterFlight | null;
  recovery: RecoveryState | null;
  /** Unitless 0–1. */
  wear: number;
  flights: number;
}
export interface ShipFields {
  fsm: FsmState<ShipState>;
  prop: PropTanks;
  engines: Engines;
  flight: ShipFlight | null;
}
/**
 * Tower mechanisms (5.0): render drives `TOWER_Carriage` (trans, m), `TOWER_ArmL/R` (rot, rad) and `TOWER_QDArm`
 * (rot, rad) directly from these. Heights are above the tower base; angles use the asset signs (ASSETS_GUIDE).
 */
export interface TowerFields {
  fsm: FsmState<TowerState>;
  /** Arms target (OPEN ⇄ CLOSED, `ArmsChanged`); the angles below follow at `tower.arms.rateRadPerS`. */
  arms: ArmsState;
  task: TaskProgress | null;
  /** `TOWER_Carriage` height, m (25–135). */
  carriageM: number;
  /** Where the carriage is going, m; reached at `tower.carriage.speedMPerS` unless the interlock holds it. */
  carriageTargetM: number;
  /** `TOWER_ArmL` angle, rad: 0 closed → +openRad open. */
  armLRad: number;
  /** `TOWER_ArmR` angle, rad: 0 closed → −openRad open. */
  armRRad: number;
  /** QD arm state; engaged while a ship is stacked on this tower's pad, retracted at liftoff. */
  qd: QdArmState;
  /** `TOWER_QDArm` angle, rad: 0 stowed → engagedRad (π/2) on the ship. */
  qdArmRad: number;
  interlock: TowerInterlock;
}
export interface PadFields {
  /** Booster standing on the mount. */
  boosterId: Id | null;
}
export interface TransporterFields {
  fsm: FsmState<TransporterState>;
  cargo: Id | null;
  route: RouteState | null;
}
export interface CraneFields {
  fsm: FsmState<CraneState>;
  task: TaskProgress | null;
}
export interface TankFields {
  fluid: Fluid;
  massKg: number;
  capKg: number;
  /** Cumulative boil-off of this tank, kg (bookkeeping for mass-conservation checks and the HUD). */
  boiledOffKg: number;
}
export interface DeliveryOrder {
  id: string;
  rush: boolean;
  placedTick: Tick;
  /** Tick the tanker leaves the off-map entry so that it reaches the gate at `gateEtaTick`. */
  departTick: Tick;
  /** Ordered arrival at the road gate = placed + lead time. */
  gateEtaTick: Tick;
  deliveredKg: number;
}
export interface BoatFields {
  role: BoatRole;
  fsm: FsmState<BoatState>;
  /** Patrol loop (closed path; `movedTicks` wraps) for pickets on station. */
  route: RouteState | null;
  /** Straight-line transit (intercept, escort, return to the loop). */
  leg: Leg | null;
  /** Picket: the intruder it intercepts / escorts. Intruder: the picket dispatched to it. */
  targetId: Id | null;
  /** Escort ends (intruder despawns, RANGE clears) at this tick. */
  escortEndTick: Tick | null;
}
export interface VanFields {
  fsm: FsmState<VanState>;
  route: RouteState | null;
}
export interface TankerFields {
  fluid: Propellant;
  fsm: FsmState<TankerState>;
  capKg: number;
  cargoKg: number;
  /** Rush deliveries are chartered trucks spawned for the order and despawned when they leave. */
  chartered: boolean;
  order: DeliveryOrder | null;
  route: RouteState | null;
}

/**
 * Kind-specific fields, merged into `EntityBase`; keep them JSON-plain.
 */
export interface EntityFields {
  booster: BoosterFields;
  ship: ShipFields;
  tower: TowerFields;
  pad: PadFields;
  tank: TankFields;
  tanker: TankerFields;
  transporter: TransporterFields;
  crane: CraneFields;
  van: VanFields;
  boat: BoatFields;
  wxStation: object;
  building: object;
}
export type EntityOf<K extends Kind> = EntityBase<K> & EntityFields[K];
export type Entity = { [K in Kind]: EntityOf<K> }[Kind];

// --- Countdown (ARCHITECTURE §7.1) --------------------------------------------------------------

/** Phase bar segments (Standby … Safing) plus the Divert / Scrubbed / Debrief overlays and end. */
export type Phase =
  | 'Standby'
  | 'Rollout'
  | 'Stack'
  | 'PropellantLoad'
  | 'TerminalCount'
  | 'Liftoff'
  | 'Boostback'
  | 'TowerCatch'
  | 'Divert'
  | 'Safing'
  | 'Scrubbed'
  | 'Debrief';

/** Orthogonal clock FSM: the T-clock only advances while `Counting`. */
export type ClockState = 'Counting' | 'Holding' | 'Stopped';

export type HoldReason = 'MANUAL' | 'POLL' | 'NO_GO' | 'LOAD_INCOMPLETE' | 'LEAK_FIX';
export type HoldReleasedBy = 'GO' | 'AUTO' | 'RECYCLE';
export type ScrubReason = 'COMMAND' | 'WINDOW_CLOSED';

export type GoStatus = 'GO' | 'MARGINAL' | 'NO_GO';
export type RecoveryMode = 'CATCH' | 'DIVERT';
export type DecisionKind = 'POLL' | 'CATCH' | 'LEAK';
export type LeakChoice = 'DEGRADED' | 'HOLD_FIX';

/** Machine code of the value driving a station's status (the UI maps it to a label; SI value alongside). */
export type StationDriver =
  | 'NOMINAL'
  | 'GROUND_WIND'
  | 'UPPER_WIND'
  | 'FORECAST_UPPER_WIND'
  | 'INTRUDER'
  | 'PICKET_REPOSITIONING'
  | 'FARM_RESERVE_LOX'
  | 'FARM_RESERVE_CH4'
  | 'GSE_LEAK'
  | 'VEHICLE_HEALTH'
  | 'CREW_IN_HAZARD'
  | 'CREW_SHIFT';

/**
 * One station reading (GDD §4.5, AC 10). `value`/`limit` are SI in the driver's unit: m/s (wind), s (farm
 * reserve in hold-seconds, crew shift time, intercept ETA), m (crew van distance to OLM-1), unitless (health).
 */
export interface StationReading {
  status: GoStatus;
  driver: StationDriver;
  value: number;
  limit: number;
}

/**
 * Inputs the countdown reads but does not own. Written by other systems before the countdown runs
 * on the next tick (3.5 prep, 3.4 propellant, 3.6 flight, 3.7 range); tests set them directly.
 */
export interface CountdownInputs {
  /** Per-station status (3.7 range & weather). */
  stations: Record<Station, GoStatus>;
  /** Booster arrived on OLM-1 → Rollout ends, Stack begins (3.5). */
  rolloutComplete: boolean;
  /** Booster + ship stacked (3.5): precondition of the load poll. */
  stackComplete: boolean;
  /** Vehicle load at 100 % (3.4): else auto-hold at T-00:03:00. */
  loadComplete: boolean;
  /** MECO + separation done (3.6). */
  stageSeparated: boolean;
  /** Catch/divert committed (3.6: CatchDecision or auto policy). */
  recoveryMode: RecoveryMode | null;
  /** Booster caught / lost (3.6). */
  recoveryComplete: boolean;
  /** Scrub detank finished (3.4; true at once when nothing was loaded). */
  detankComplete: boolean;
  /** A3 GSE leak being fixed under a LEAK_FIX hold (3.7); the hold auto-releases when this clears. */
  leakFixActive: boolean;
}

export interface CountdownHold {
  reason: HoldReason;
  /** Poll awaiting GO when reason = POLL. */
  poll: PollId | null;
}

/** One flight attempt. */
export interface Countdown {
  id: Id;
  flightName: string;
  siteId: SiteId;
  contractId: string;
  boosterId: Id;
  shipId: Id;
  padId: Id;
  /** Sim tick the attempt was created (crew shift clock, ops cost). */
  createdTick: Tick;
  phase: FsmState<Phase>;
  clock: FsmState<ClockState>;
  /** T-clock in ticks: negative before T-0, mission time after. Stops while holding. */
  tClockTicks: Tick;
  hold: CountdownHold | null;
  pollsPassed: PollId[];
  /** Stations that were MARGINAL when a poll was passed by GO (risk multiplier input, 3.7). */
  goWithMarginal: Station[];
  /** Launch window in absolute sim ticks (keeps closing during holds). */
  windowOpenTick: Tick;
  windowCloseTick: Tick;
  autoGoWhenAllGreen: boolean;
  liftoffTick: Tick | null;
  scrubReason: ScrubReason | null;
  inputs: CountdownInputs;
}
