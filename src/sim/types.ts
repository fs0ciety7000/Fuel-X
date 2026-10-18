// Shared sim types (ARCHITECTURE §6). Render/UI import these with `import type` only.
import type {
  AnomalyId,
  AssetKey,
  EntityKind,
  Fluid,
  Lc1PathId,
  MilestoneName,
  PollId,
  Propellant,
  SiteId,
  SiteStatus,
} from '@data/index';

export type { AnomalyId, AssetKey, Fluid, Lc1PathId, MilestoneName, PollId, Propellant, SiteId, SiteStatus };
export type { World, Site, EntityTable, Economy, LogisticsState, PropLedger } from './core/world';
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
  /** Site-local position, m (X east, Y up, Z south). */
  pos: Vec3;
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

export interface BoosterFields {
  fsm: FsmState<BoosterState>;
  prop: PropTanks;
  /** Unitless 0–1. */
  wear: number;
  flights: number;
}
export interface ShipFields {
  fsm: FsmState<ShipState>;
  prop: PropTanks;
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
 * Kind-specific fields, merged into `EntityBase`. Systems added in 3.5–3.8 fill in the rest
 * (tower arms, transporter route, …); keep them JSON-plain.
 */
export interface EntityFields {
  booster: BoosterFields;
  ship: ShipFields;
  tower: object;
  pad: object;
  tank: TankFields;
  tanker: TankerFields;
  transporter: object;
  crane: object;
  van: object;
  boat: object;
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

export type HoldReason = 'MANUAL' | 'POLL' | 'NO_GO' | 'LOAD_INCOMPLETE';
export type HoldReleasedBy = 'GO' | 'AUTO' | 'RECYCLE';
export type ScrubReason = 'COMMAND' | 'WINDOW_CLOSED';

export type Station = 'WEATHER' | 'RANGE' | 'PROPELLANT' | 'VEHICLE' | 'PAD_CREW';
export type GoStatus = 'GO' | 'MARGINAL' | 'NO_GO';
export type RecoveryMode = 'CATCH' | 'DIVERT';
export type DecisionKind = 'POLL' | 'CATCH' | 'LEAK';

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
