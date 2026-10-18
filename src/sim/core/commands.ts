// Player/host inputs (ADR 0003 §5). The UI sends untimed commands; the host stamps them with the next
// tick to execute and they are applied at the start of that tick, in send order. The command log +
// seed reproduces a game.
import type { Id, Propellant, RecoveryMode, Tick } from '../types';

export type Command =
  | { t: 'StartRollout'; boosterId: Id }
  | { t: 'Stack'; padId: Id }
  | { t: 'OrderDelivery'; fluid: Propellant; rush: boolean }
  | { t: 'Go'; countdownId: Id }
  | { t: 'Hold'; countdownId: Id }
  | { t: 'Recycle'; countdownId: Id }
  | { t: 'Scrub'; countdownId: Id }
  | { t: 'CatchDecision'; boosterId: Id; choice: RecoveryMode }
  | { t: 'LeakResponse'; choice: 'DEGRADED' | 'HOLD_FIX' };

export type CommandType = Command['t'];
export type CommandOf<T extends CommandType> = Extract<Command, { t: T }>;

export interface StampedCommand {
  /** Tick at whose start the command is applied. */
  tick: Tick;
  /** Global send order (tie-break within a tick). */
  seq: number;
  cmd: Command;
}

/** Host-side queue (not part of the world: commands are inputs, the world is state). */
export interface CommandQueue {
  pending: StampedCommand[];
  nextSeq: number;
}

export function createCommandQueue(): CommandQueue {
  return { pending: [], nextSeq: 0 };
}

/** Stamps `cmd` for `tick` (normally `world.tick`, the next tick to execute). */
export function enqueueCommand(queue: CommandQueue, tick: Tick, cmd: Command): StampedCommand {
  const stamped: StampedCommand = { tick, seq: queue.nextSeq++, cmd };
  queue.pending.push(stamped);
  return stamped;
}

/** Removes and returns the commands due at or before `tick`, in (tick, seq) order. */
export function takeCommands(queue: CommandQueue, tick: Tick): Command[] {
  const due = queue.pending.filter((c) => c.tick <= tick);
  if (due.length === 0) return [];
  queue.pending = queue.pending.filter((c) => c.tick > tick);
  return due.sort((a, b) => a.tick - b.tick || a.seq - b.seq).map((c) => c.cmd);
}
