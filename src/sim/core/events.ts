// Typed event bus inside the sim (ARCHITECTURE §5): no callbacks. Systems append events to
// `world.outbox`, stamped with the tick being executed; the host drains them after stepping.
import type {
  AnomalyId,
  ArmsState,
  ClockState,
  DecisionKind,
  FlightEventName,
  RecoveryDecidedBy,
  RecoveryMode,
  RecoveryResult,
  GoStatus,
  HoldReason,
  HoldReleasedBy,
  Id,
  Kind,
  LeakChoice,
  MilestoneName,
  Phase,
  PollId,
  Propellant,
  SiteId,
  Station,
  Tick,
} from '../types';
import type { CommandType } from './commands';
import type { AnomalySource, World } from './world';

export type SimEvent =
  | { t: 'PhaseChanged'; tick: Tick; countdownId: Id; from: Phase; to: Phase; trigger: string }
  | { t: 'ClockChanged'; tick: Tick; countdownId: Id; from: ClockState; to: ClockState; trigger: string }
  | { t: 'HoldStarted'; tick: Tick; countdownId: Id; reason: HoldReason; poll: PollId | null; tClockTicks: Tick }
  | { t: 'HoldReleased'; tick: Tick; countdownId: Id; reason: HoldReason; by: HoldReleasedBy; tClockTicks: Tick }
  | { t: 'PollOpened'; tick: Tick; countdownId: Id; poll: PollId }
  | { t: 'PollPassed'; tick: Tick; countdownId: Id; poll: PollId; auto: boolean; marginal: Station[] }
  | { t: 'Recycled'; tick: Tick; countdownId: Id; fromTClockTicks: Tick; toTClockTicks: Tick }
  | { t: 'WindowMissed'; tick: Tick; countdownId: Id; contractId: string; penaltyCr: number }
  | { t: 'StationChanged'; tick: Tick; countdownId: Id; station: Station; status: GoStatus; driver: string }
  | {
      t: 'DecisionRequired';
      tick: Tick;
      countdownId: Id;
      decision: DecisionKind;
      poll: PollId | null;
      deadlineTick: Tick;
    }
  | {
      t: 'AnomalyFired';
      tick: Tick;
      countdownId: Id;
      anomaly: AnomalyId;
      /** Entity at the source: UNK-01 (A1), WX-1 (A2), OLM-1 quick-disconnect (A3), the booster (A4). */
      entityId: Id;
      source: AnomalySource;
    }
  | { t: 'LeakResponded'; tick: Tick; countdownId: Id; choice: LeakChoice }
  | { t: 'LeakCleared'; tick: Tick; countdownId: Id; by: 'FIXED' | 'LIFTOFF' }
  | { t: 'EntityStateChanged'; tick: Tick; id: Id; kind: Kind; from: string; to: string }
  | { t: 'Spawned'; tick: Tick; id: Id; kind: Kind; callSign: string }
  | { t: 'Despawned'; tick: Tick; id: Id; kind: Kind; callSign: string }
  | { t: 'Milestone'; tick: Tick; countdownId: Id; name: MilestoneName }
  | { t: 'CommandRejected'; tick: Tick; cmd: CommandType; reason: string }
  // Logistics & propellant (3.4). Money fields are charges for the economy (3.8) to apply.
  | {
      t: 'DeliveryOrdered';
      tick: Tick;
      orderId: string;
      tankerId: Id;
      callSign: string;
      fluid: Propellant;
      rush: boolean;
      cargoKg: number;
      feeCr: number;
      gateEtaTick: Tick;
    }
  | {
      t: 'DeliveryCompleted';
      tick: Tick;
      orderId: string;
      tankerId: Id;
      fluid: Propellant;
      deliveredKg: number;
      /** Propellant price of the delivered mass. */
      costCr: number;
      /** Offload cut short (road closure or farm full); the rest of the cargo leaves with the truck. */
      aborted: boolean;
    }
  | { t: 'RoadClosureChanged'; tick: Tick; siteId: SiteId; closed: boolean }
  // Prep (3.5) and recovery (3.6)
  | { t: 'ArmsChanged'; tick: Tick; id: Id; from: ArmsState; to: ArmsState }
  // Flight (3.6)
  | {
      t: 'FlightEvent';
      tick: Tick;
      countdownId: Id;
      id: Id;
      kind: 'booster' | 'ship';
      event: FlightEventName;
      altitudeM: number;
      speedMPerS: number;
    }
  | { t: 'EnginesChanged'; tick: Tick; id: Id; lit: number; failed: number }
  | {
      t: 'RecoveryCommitted';
      tick: Tick;
      countdownId: Id;
      boosterId: Id;
      mode: RecoveryMode;
      by: RecoveryDecidedBy;
      p: number;
    }
  | {
      t: 'RecoveryOutcome';
      tick: Tick;
      countdownId: Id;
      boosterId: Id;
      mode: RecoveryMode;
      result: RecoveryResult;
      p: number;
      roll: number | null;
    }
  | {
      t: 'DetankCompleted';
      tick: Tick;
      countdownId: Id;
      returnedKg: Record<Propellant, number>;
      lostKg: Record<Propellant, number>;
    };

export type SimEventType = SimEvent['t'];

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** An event before the bus stamps its tick. */
export type SimEventInput = DistributiveOmit<SimEvent, 'tick'>;

/** Appends an event stamped with the tick being executed. */
export function emit(world: World, event: SimEventInput): void {
  world.outbox.push({ ...event, tick: world.tick } as SimEvent);
}

/** Removes and returns every pending event (host side, once per frame). */
export function drainEvents(world: World): SimEvent[] {
  return world.outbox.splice(0, world.outbox.length);
}

/** Events emitted so far during the tick being executed (later systems may react to them). */
export function eventsThisTick(world: World): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = world.outbox.length - 1; i >= 0; i--) {
    const e = world.outbox[i];
    if (!e || e.tick !== world.tick) break;
    out.push(e);
  }
  return out.reverse();
}
