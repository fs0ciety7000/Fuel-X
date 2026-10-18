// Typed event bus inside the sim (ARCHITECTURE §5): no callbacks. Systems append events to
// `world.outbox`, stamped with the tick being executed; the host drains them after stepping.
import type {
  AnomalyId,
  ClockState,
  DecisionKind,
  GoStatus,
  HoldReason,
  HoldReleasedBy,
  Id,
  Kind,
  MilestoneName,
  Phase,
  PollId,
  Station,
  Tick,
} from '../types';
import type { CommandType } from './commands';
import type { World } from './world';

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
  | { t: 'AnomalyFired'; tick: Tick; anomaly: AnomalyId; entityId: Id }
  | { t: 'EntityStateChanged'; tick: Tick; id: Id; kind: Kind; from: string; to: string }
  | { t: 'Spawned'; tick: Tick; id: Id; kind: Kind; callSign: string }
  | { t: 'Despawned'; tick: Tick; id: Id; kind: Kind; callSign: string }
  | { t: 'Milestone'; tick: Tick; countdownId: Id; name: MilestoneName }
  | { t: 'CommandRejected'; tick: Tick; cmd: CommandType; reason: string };

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
