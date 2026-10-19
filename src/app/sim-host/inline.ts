// Main-thread SimHost (ADR 0003 §7). Owns the world, the command queue/log and the snapshot writer; the wall clock
// is injected (src/sim never sees it). Autopilot = the golden-test director (STANDARD_AUTOPILOT), stateless.
import {
  STANDARD_AUTOPILOT,
  autopilotCommands,
  countdownIds,
  createCommandQueue,
  createMvpScenario,
  createSave,
  enqueueCommand,
  loadSave,
  step,
  takeCommands,
} from '@sim/index';
import type { CommandQueue } from '@sim/index';
import type { Command, Countdown, SimEvent, StampedCommand, World } from '@sim/types';
import { createRenderSnapshot } from '@render/snapshot';
import type { RenderSnapshot } from '@render/snapshot';
import { SnapshotWriter } from './snapshot-writer';
import type { AdvanceReport, AdvanceRequest, JumpTarget, NewGameOptions, SimHost, SimTimings } from './types';

/** jumpTo guard: 30 h of sim time (same as the golden harness). */
export const MAX_JUMP_TICKS = 30 * 3_600 * 30;
const TIMING_WINDOW = 120;

export function reached(world: World, cd: Countdown | null, target: JumpTarget): boolean {
  if ('tick' in target) return world.tick >= target.tick;
  if (!cd) return false;
  if ('phase' in target) return cd.phase.state === target.phase;
  return cd.tClockTicks >= target.tClockTicks;
}

export class InlineSimHost implements SimHost {
  readonly snapshot: RenderSnapshot = createRenderSnapshot();
  private readonly writer = new SnapshotWriter(this.snapshot);
  private world!: World;
  private cdId: string | null = null;
  private seed = 0;
  private autopilot = true;
  private queue: CommandQueue = createCommandQueue();
  private log: StampedCommand[] = [];
  private events: SimEvent[] = [];
  private readonly usPerTick = new Float64Array(TIMING_WINDOW);
  private timingN = 0;
  private lastMs = 0;
  private lastJump = { ticks: 0, ms: 0 };

  constructor(private readonly now: () => number) {
    this.reset(createMvpScenario({ seed: 0 }).world, 0, true);
  }

  private reset(world: World, seed: number, autopilot: boolean, log: StampedCommand[] = []): void {
    this.world = world;
    this.world.outbox.length = 0;
    this.cdId = countdownIds(world)[0] ?? null;
    this.seed = seed;
    this.autopilot = autopilot;
    this.queue = createCommandQueue();
    this.log = log;
    this.events = [];
    this.writer.invalidate();
    this.writer.write(world);
  }

  newGame(opts: NewGameOptions): Promise<void> {
    const sc = createMvpScenario({ seed: opts.seed >>> 0 });
    this.reset(sc.world, opts.seed >>> 0, opts.autopilot ?? true);
    return Promise.resolve();
  }

  send(cmd: Command): void {
    enqueueCommand(this.queue, this.world.tick, cmd);
  }

  /** One tick: queued commands, then the autopilot's (logged as inputs so the session replays). */
  private tick(): SimEvent[] {
    const w = this.world;
    const cmds = takeCommands(this.queue, w.tick);
    if (this.autopilot && this.cdId) cmds.push(...autopilotCommands(w, this.cdId, STANDARD_AUTOPILOT));
    for (const cmd of cmds) this.log.push({ tick: w.tick, seq: this.log.length, cmd });
    return step(w, cmds);
  }

  advance(req: AdvanceRequest): AdvanceReport {
    const t0 = this.now();
    let steps = 0;
    let stopped = false;
    while (steps < req.maxSteps && (steps === 0 || this.now() - t0 < req.budgetMs)) {
      const evs = this.tick();
      // The outbox is drained into the host buffer every tick (never grows inside the world).
      this.world.outbox.length = 0;
      for (const e of evs) this.events.push(e);
      this.writer.write(this.world);
      steps++;
      if (req.stopOn && evs.some((e) => req.stopOn?.includes(e.t))) {
        stopped = true;
        break;
      }
    }
    const ms = this.now() - t0;
    if (steps > 0) {
      this.usPerTick[this.timingN++ % TIMING_WINDOW] = (ms * 1000) / steps;
      this.lastMs = ms;
    }
    return { steps, stopped, ms };
  }

  jump(target: JumpTarget, maxTicks: number = MAX_JUMP_TICKS): Promise<{ ticks: number }> {
    const w = this.world;
    const cd = (): Countdown | null => (this.cdId ? (w.countdowns[this.cdId] ?? null) : null);
    let ticks = 0;
    const t0 = this.now();
    while (!reached(w, cd(), target)) {
      if (ticks >= maxTicks) return Promise.reject(new Error('JUMP_TARGET_NOT_REACHED'));
      if (cd()?.phase.state === 'Debrief' && !('phase' in target && target.phase === 'Debrief')) {
        return Promise.reject(new Error('JUMP_TARGET_NOT_REACHED'));
      }
      this.tick();
      w.outbox.length = 0;
      ticks++;
    }
    this.lastJump = { ticks, ms: this.now() - t0 };
    this.events = [];
    this.writer.invalidate();
    this.writer.write(w);
    return Promise.resolve({ ticks });
  }

  drainEvents(): SimEvent[] {
    if (this.events.length === 0) return [];
    const out = this.events;
    this.events = [];
    return out;
  }

  save(meta: { game: string; createdAt: string }): Promise<string> {
    return Promise.resolve(this.saveSync(meta));
  }

  /** Synchronous save for the inline host only (debug hooks: `__fuelx.save(): string`). */
  saveSync(meta: { game: string; createdAt: string }): string {
    return createSave(this.world, { ...meta, commandLog: this.log });
  }

  load(json: string): Promise<void> {
    const loaded = loadSave(json);
    this.reset(loaded.world, loaded.world.seed, this.autopilot, loaded.commandLog);
    return Promise.resolve();
  }

  timings(): SimTimings {
    const n = Math.min(this.timingN, TIMING_WINDOW);
    if (n === 0) return { usPerTickMean: 0, usPerTickP95: 0, lastAdvanceMs: 0, lastJump: this.lastJump };
    const xs = Array.from(this.usPerTick.subarray(0, n)).sort((a, b) => a - b);
    const mean = xs.reduce((a, b) => a + b, 0) / n;
    return {
      usPerTickMean: mean,
      usPerTickP95: xs[Math.min(n - 1, Math.floor(n * 0.95))] ?? 0,
      lastAdvanceMs: this.lastMs,
      lastJump: this.lastJump,
    };
  }

  inspect(): { world: Readonly<World>; countdown: Readonly<Countdown> | null; seed: number; autopilot: boolean } {
    const countdown = this.cdId ? (this.world.countdowns[this.cdId] ?? null) : null;
    return { world: this.world, countdown, seed: this.seed, autopilot: this.autopilot };
  }
}
