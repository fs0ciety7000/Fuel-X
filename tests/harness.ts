// Shared headless runner for golden / equivalence / property tests and the anomaly sweep script.
import { STANDARD_AUTOPILOT, asDirector, autopilotCommands, createMvpScenario, step } from '../src/sim/index';
import type { AutopilotOptions, Command, MvpScenario, SimEvent, StampedCommand, World } from '../src/sim/index';

export interface RunOptions {
  seed: number;
  autopilot?: Readonly<AutopilotOptions>;
  /** Stop after this many ticks (default: at Debrief). */
  maxTicks?: number;
  /** Stop as soon as this returns true (checked before each tick). */
  until?: (world: World) => boolean;
  /** Called after every tick with that tick's events and the commands that were sent. */
  each?: (world: World, events: readonly SimEvent[], commands: readonly Command[]) => void;
}

export interface RunResult extends MvpScenario {
  /** Every command sent, stamped with its tick (replay input). */
  commands: StampedCommand[];
  ticks: number;
}

/** Hard stop for a run that never reaches Debrief: 30 h of sim time. */
export const MAX_RUN_TICKS = 30 * 3_600 * 30;

/** Drives an existing scenario with the autopilot until Debrief / `until` / `maxTicks`. */
export function drive(sc: MvpScenario, opts: Omit<RunOptions, 'seed'> = {}): RunResult {
  const { world, countdown: cd } = sc;
  const commands: StampedCommand[] = [];
  const max = opts.maxTicks ?? MAX_RUN_TICKS;
  let n = 0;
  while (n < max && cd.phase.state !== 'Debrief' && !(opts.until?.(world) ?? false)) {
    // The autopilot is the demo director: its commands are tagged DIRECTOR exactly as the inline host does
    // (AC 33), so the golden / equivalence runs and a `?autopilot=1` session log the same decision tags.
    const cmds = asDirector(autopilotCommands(world, cd.id, opts.autopilot ?? STANDARD_AUTOPILOT));
    for (const cmd of cmds) commands.push({ tick: world.tick, seq: commands.length, cmd });
    const events = step(world, cmds);
    world.outbox.length = 0; // the host drains every frame
    opts.each?.(world, events, cmds);
    n++;
  }
  return { ...sc, commands, ticks: n };
}

export function runMvp(opts: RunOptions): RunResult {
  const sc = createMvpScenario({ seed: opts.seed });
  sc.world.outbox.length = 0;
  return drive(sc, opts);
}
