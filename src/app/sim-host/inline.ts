// Main-thread SimHost (ADR 0003 §7). Owns the world, the command queue/log and the snapshot writer; the wall clock
// is injected (src/sim never sees it). Autopilot = the golden-test director (STANDARD_AUTOPILOT), stateless.
import {
  STANDARD_AUTOPILOT,
  asDirector,
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
import type {
  AdvanceReport,
  AdvanceRequest,
  JumpTarget,
  NewGameOptions,
  SessionLog,
  SimHost,
  SimTimings,
} from './types';

/** jumpTo guard: 30 h of sim time (same as the golden harness). */
export const MAX_JUMP_TICKS = 30 * 3_600 * 30;
const TIMING_WINDOW = 120;
/** Session event log cap (a full MVP run is ~1e4 events; the cap only guards pathological sessions). */
export const MAX_SESSION_EVENTS = 500_000;

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
  /** Every event since the run started / was loaded (EXPORT LOG). */
  private sessionEvents: SimEvent[] = [];
  private sessionFromTick = 0;
  private sessionTruncated = false;
  /** Last TIMING_WINDOW advance calls: wall ms and steps (ring, `timingN` = calls so far). */
  private readonly advMs = new Float64Array(TIMING_WINDOW);
  private readonly advSteps = new Float64Array(TIMING_WINDOW);
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
    this.sessionEvents = [];
    this.sessionFromTick = world.tick;
    this.sessionTruncated = false;
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

  pendingCommands(): number {
    return this.queue.pending.length;
  }

  /**
   * One tick: queued commands, then the autopilot's (logged as inputs so the session replays). Autopilot commands
   * carry `source: 'DIRECTOR'` so the decision log never credits the player with them (GDD §13.2.1, AC 33).
   */
  private tick(): SimEvent[] {
    const w = this.world;
    const cmds = takeCommands(this.queue, w.tick);
    if (this.autopilot && this.cdId) cmds.push(...asDirector(autopilotCommands(w, this.cdId, STANDARD_AUTOPILOT)));
    for (const cmd of cmds) this.log.push({ tick: w.tick, seq: this.log.length, cmd });
    const evs = step(w, cmds);
    if (this.sessionEvents.length + evs.length <= MAX_SESSION_EVENTS) for (const e of evs) this.sessionEvents.push(e);
    else this.sessionTruncated = true;
    return evs;
  }

  /** Inputs and outputs of the current run (EXPORT LOG, GDD §13.2.3). Arrays are copies. */
  sessionLog(): SessionLog {
    return {
      seed: this.seed,
      scenario: 'mvp',
      autopilot: this.autopilot,
      fromTick: this.sessionFromTick,
      tick: this.world.tick,
      commandLog: this.log.slice(),
      events: this.sessionEvents.slice(),
      eventsTruncated: this.sessionTruncated,
    };
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
      if (req.stopWhen?.(evs)) {
        stopped = true;
        break;
      }
    }
    const ms = this.now() - t0;
    if (steps > 0) {
      const i = this.timingN++ % TIMING_WINDOW;
      this.advMs[i] = ms;
      this.advSteps[i] = steps;
      this.lastMs = ms;
    }
    return { steps, stopped, ms };
  }

  jump(target: JumpTarget, maxTicks: number = MAX_JUMP_TICKS, onTick?: () => void): Promise<{ ticks: number }> {
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
      onTick?.();
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

  /**
   * Mean = Σ ms / Σ steps over the window (8.1 F5): a mean of per-advance ratios over-weights the many 1-step
   * advances at 1×, whose wall time is mostly `performance.now()` clamp (100 µs in a page) and scheduling noise.
   * p95 stays per advance (µs/tick of the slowest calls), over the same window.
   */
  timings(): SimTimings {
    const n = Math.min(this.timingN, TIMING_WINDOW);
    if (n === 0) return { usPerTickMean: 0, usPerTickP95: 0, lastAdvanceMs: 0, lastJump: this.lastJump };
    let ms = 0;
    let steps = 0;
    const ratios: number[] = [];
    for (let i = 0; i < n; i++) {
      const s = this.advSteps[i] ?? 0;
      const m = this.advMs[i] ?? 0;
      ms += m;
      steps += s;
      ratios.push((m * 1000) / s);
    }
    ratios.sort((a, b) => a - b);
    return {
      usPerTickMean: (ms * 1000) / steps,
      usPerTickP95: ratios[Math.min(n - 1, Math.floor(n * 0.95))] ?? 0,
      lastAdvanceMs: this.lastMs,
      lastJump: this.lastJump,
    };
  }

  inspect(): { world: Readonly<World>; countdown: Readonly<Countdown> | null; seed: number; autopilot: boolean } {
    const countdown = this.cdId ? (this.world.countdowns[this.cdId] ?? null) : null;
    return { world: this.world, countdown, seed: this.seed, autopilot: this.autopilot };
  }
}
