// Shared sim types (ARCHITECTURE §6). Render/UI import these with `import type` only.
import type {
  AnomalyId,
  AssetKey,
  EntityKind,
  MilestoneName,
  PollId,
  Propellant,
  SiteId,
  SiteStatus,
} from '@data/index';

export type { AnomalyId, AssetKey, MilestoneName, PollId, Propellant, SiteId, SiteStatus };
export type { World, Site, EntityTable, Economy } from './core/world';
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

/**
 * Kind-specific fields, merged into `EntityBase`. Systems added in 3.4–3.8 fill these in
 * (booster prop/engines/flight, tank mass, tanker route, …); keep them JSON-plain.
 */
export interface EntityFields {
  booster: object;
  ship: object;
  tower: object;
  pad: object;
  tank: object;
  tanker: object;
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
