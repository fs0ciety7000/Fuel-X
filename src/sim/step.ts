// The ordered system pipeline (ARCHITECTURE §4). Changing the order is a golden-log change.
import type { Command } from './core/commands';
import { takeCommands } from './core/commands';
import type { CommandQueue } from './core/commands';
import { emit } from './core/events';
import type { SimEvent } from './core/events';
import type { World } from './core/world';
import {
  commandGo,
  commandHold,
  commandRecycle,
  commandScrub,
  commandStartRollout,
  countdownSystem,
} from './systems/countdown';

export interface StepContext {
  /** Commands stamped for this tick, in send order. */
  readonly commands: readonly Command[];
}

export interface SimSystem {
  readonly name: string;
  readonly run: (world: World, ctx: StepContext) => void;
}

/** Returns a rejection reason code, or null when the command was applied. */
function applyCommand(world: World, cmd: Command): string | null {
  switch (cmd.t) {
    case 'StartRollout':
      return commandStartRollout(world, cmd);
    case 'Go':
      return commandGo(world, cmd);
    case 'Hold':
      return commandHold(world, cmd);
    case 'Recycle':
      return commandRecycle(world, cmd);
    case 'Scrub':
      return commandScrub(world, cmd);
    case 'Stack': // 3.5
    case 'OrderDelivery': // 3.4
    case 'CatchDecision': // 3.6
    case 'LeakResponse': // 3.7
      return 'NOT_IMPLEMENTED';
  }
}

function applyCommandsSystem(world: World, ctx: StepContext): void {
  for (const cmd of ctx.commands) {
    const reason = applyCommand(world, cmd);
    if (reason !== null) emit(world, { t: 'CommandRejected', cmd: cmd.t, reason });
  }
}

function bookkeepingSystem(world: World): void {
  world.tick++;
}

/**
 * System order. Slots reserved for later tasks: environment (3.7), contracts/economy + scheduler (3.8),
 * vehicle FSMs (3.5/3.6), logistics/motion (3.4/3.5), propellant (3.4), flight dynamics (3.6),
 * anomalies (3.7); bookkeeping will also write the RenderSnapshot (5.2).
 */
export const SYSTEMS: readonly SimSystem[] = [
  { name: 'applyCommands', run: applyCommandsSystem },
  { name: 'countdown', run: countdownSystem },
  { name: 'bookkeeping', run: bookkeepingSystem },
];

/** Executes tick `world.tick` with the given commands; returns the events emitted during it. */
export function step(world: World, commands: readonly Command[] = []): SimEvent[] {
  const start = world.outbox.length;
  const ctx: StepContext = { commands };
  for (const system of SYSTEMS) system.run(world, ctx);
  return world.outbox.slice(start);
}

/** Runs `ticks` steps, feeding each tick the queued commands stamped for it. */
export function advance(world: World, ticks: number, queue?: CommandQueue): void {
  for (let i = 0; i < ticks; i++) step(world, queue ? takeCommands(queue, world.tick) : []);
}
