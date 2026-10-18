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
import { anomaliesSystem, commandLeakResponse } from './systems/anomalies';
import { environmentSystem } from './systems/environment';
import { commandCatchDecision, flightSystem } from './systems/flight';
import { commandOrderDelivery, logisticsSystem } from './systems/logistics';
import { commandStack, prepSystem } from './systems/prep';
import { propellantSystem } from './systems/propellant';
import { rangeSystem } from './systems/range';

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
    case 'OrderDelivery':
      return commandOrderDelivery(world, cmd);
    case 'Stack':
      return commandStack(world, cmd);
    case 'CatchDecision':
      return commandCatchDecision(world, cmd);
    case 'LeakResponse':
      return commandLeakResponse(world, cmd);
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
 * System order (ARCHITECTURE §4) — changing it is a golden-log change:
 *  1 applyCommands — player/host commands stamped for this tick
 *  2 environment   — seeded weather series (ground/gust/tower/upper wind, front) — rng 'weather'
 *  3 range         — PICKET patrols/intercepts, UNK-01 escort, crew vans, the five stations → `inputs.stations`
 *  4 countdown     — T-clock, polls, holds, phase transitions (reads `countdown.inputs`)
 *  5 prep          — CR-77 / SP-41 / TOWER-1 rollout + stacking, wind pauses (writes rollout/stackComplete)
 *  6 logistics     — road closure, tanker orders/routes/gate/offload (fills the farm)
 *  7 propellant    — farm boil-off, vehicle load + topping, scrub detank (writes loadComplete/detankComplete)
 *  8 flight        — scripted ascent/boostback/landing, S-21 to SECO, catch model, decision, outcome
 *                    (writes stageSeparated / recoveryMode / recoveryComplete)
 *  9 anomalies     — director plan + natural rolls A1–A4 (rng 'director' / 'anomaly'), leak timers, engine-outs
 * 10 bookkeeping   — tick++ (RenderSnapshot write in 5.2)
 */
export const SYSTEMS: readonly SimSystem[] = [
  { name: 'applyCommands', run: applyCommandsSystem },
  { name: 'environment', run: environmentSystem },
  { name: 'range', run: rangeSystem },
  { name: 'countdown', run: countdownSystem },
  { name: 'prep', run: prepSystem },
  { name: 'logistics', run: logisticsSystem },
  { name: 'propellant', run: propellantSystem },
  { name: 'flight', run: flightSystem },
  { name: 'anomalies', run: anomaliesSystem },
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
