// GameLoop (ARCHITECTURE §3): the only wall clock in the game. One rAF frame = step the sim with a fixed-dt
// accumulator (time scale = more steps), drain events to the bus, then render once with the interpolation alpha.
import { DT_S } from '@sim/index';
import type { SimEvent } from '@sim/types';
import type { SimHost } from './sim-host/types';
import type { TimeControl } from './time/time-control';
import { SKIP_BUDGET_MS, SKIP_MAX_STEPS_PER_FRAME } from './time/time-control';

export const MAX_FRAME_DT_S = 0.25;
export const MAX_STEPS_PER_FRAME = 200;
export const SIM_BUDGET_MS = 4;
const FRAME_WINDOW = 240;

export interface LoopDeps {
  host: SimHost;
  time: TimeControl;
  /** Called once per frame with the drained events (bus dispatch). */
  onEvents: (events: SimEvent[]) => void;
  /** Draws one frame. */
  render: (now: number, alpha: number, wallDtMs: number) => void;
  now: () => number;
  raf: (cb: (now: number) => void) => number;
  caf: (id: number) => void;
}

export class GameLoop {
  private acc = 0;
  private last = -1;
  private rafId: number | null = null;
  private readonly frameMs = new Float64Array(FRAME_WINDOW);
  private frameN = 0;
  private readonly afterFrame = new Set<() => void>();
  /** Steps executed in the last frame. */
  lastSteps = 0;
  /** Frames drawn since start. */
  frames = 0;

  constructor(private readonly deps: LoopDeps) {}

  start(): void {
    if (this.rafId !== null) return;
    const frame = (now: number): void => {
      this.rafId = this.deps.raf(frame);
      this.tick(now);
    };
    this.rafId = this.deps.raf(frame);
  }

  stop(): void {
    if (this.rafId !== null) this.deps.caf(this.rafId);
    this.rafId = null;
    this.last = -1;
  }

  get running(): boolean {
    return this.rafId !== null;
  }

  /** Interpolation factor the next render will use. */
  get alpha(): number {
    return Math.min(0.999, this.acc / DT_S);
  }

  /** Drop the accumulator (after jumps / loads: the next frame starts exactly on the new tick). */
  resetAccumulator(): void {
    this.acc = 0;
  }

  onAfterFrame(fn: () => void): () => void {
    this.afterFrame.add(fn);
    return () => this.afterFrame.delete(fn);
  }

  /** One frame of the loop (public for tests and for rendering while the rAF is stopped). */
  tick(now: number): void {
    const { host, time } = this.deps;
    const wallDtMs = this.last < 0 ? 1000 / 60 : now - this.last;
    const wallDt = Math.min(wallDtMs / 1000, MAX_FRAME_DT_S);
    this.last = now;
    this.frameMs[this.frameN++ % FRAME_WINDOW] = wallDtMs;

    const { world, countdown } = host.inspect();
    // Time rules after every tick (drops, skip arrival): stop this frame's stepping when the rate changed.
    const stopWhen = (evs: readonly SimEvent[]): boolean => {
      const s = host.inspect();
      return time.afterTick(evs, s.world, s.countdown);
    };
    let steps = 0;
    if (time.skip) {
      // Skip to next milestone: same fixed dt, as many steps as the wall budget allows (ARCHITECTURE §3).
      const report = host.advance({ maxSteps: SKIP_MAX_STEPS_PER_FRAME, budgetMs: SKIP_BUDGET_MS, stopWhen });
      steps = report.steps;
      this.acc = 0;
      time.lagging = false;
    } else {
      const scale = time.effectiveScale(world, countdown);
      this.acc += wallDt * scale;
      if (this.acc >= DT_S) {
        const want = Math.min(Math.floor(this.acc / DT_S), MAX_STEPS_PER_FRAME);
        const report = host.advance({ maxSteps: want, budgetMs: SIM_BUDGET_MS, stopWhen });
        steps = report.steps;
        this.acc -= steps * DT_S;
        // A rule stopped stepping (rate dropped / skip arrived / run ended): the backlog belonged to the old rate.
        if (report.stopped) this.acc = Math.min(this.acc, DT_S * 0.999);
        time.lagging = !report.stopped && this.acc >= DT_S;
        // Drop the backlog rather than ever taking a bigger dt; the HUD shows the effective rate.
        if (time.lagging) this.acc = 0;
      } else {
        time.lagging = false;
      }
    }
    time.effectiveRate = wallDt > 0 ? (steps * DT_S) / wallDt : 0;
    this.lastSteps = steps;

    const events = host.drainEvents();
    if (events.length > 0) this.deps.onEvents(events);
    this.deps.render(now, this.alpha, wallDtMs);
    this.frames++;
    for (const fn of this.afterFrame) fn();
  }

  /** Recent wall frame times, ms (oldest first is not guaranteed). */
  frameTimes(): Float64Array {
    return this.frameMs.subarray(0, Math.min(this.frameN, FRAME_WINDOW));
  }
}
