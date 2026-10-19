// Projector (ARCHITECTURE §3/§8, ADR 0004): runs `projectUi` at ≤ 10 Hz wall clock while the sim runs, plus
// immediately (same frame) on salient events, view-store changes and time-control changes; paused ⇒ only on those.
// Publishes to `projectionStore` (one `setState` per run, skipped when structural sharing returns the same root).
// Sparklines are sampled every frame on sim time (1 Hz), independent of the projection cadence.
import type { UiProjection } from '@bridge/projection-types';
import type { ViewState } from '@bridge/stores';
import type { Countdown, Id, SimEvent, World } from '@sim/types';
import type { StoreApi } from 'zustand/vanilla';
import type { TimeInputs } from './context';
import { UTC_AT_TICK0_S } from './context';
import { EventLog, SALIENT_EVENTS } from './event-log';
import { projectUi } from './project';
import { SparkSampler } from './spark';

/** 10 Hz cadence (ADR 0004); AC 17 freshness ≤ 250 ms holds with one frame of slack. */
export const PROJECTION_INTERVAL_MS = 100;

export interface ProjectorDeps {
  inspect(): { world: Readonly<World>; countdown: Readonly<Countdown> | null };
  time(world: Readonly<World>, cd: Readonly<Countdown> | null): TimeInputs;
  view: StoreApi<ViewState>;
  store: StoreApi<UiProjection>;
  now(): number;
  hidden?: (id: Id) => boolean;
}

export interface ProjectorStats {
  runs: number;
  /** Runs triggered by salient events / view / time changes (not the cadence). */
  flushes: number;
  /** µs per projection: last, mean, max, p95 over the recent window. */
  usLast: number;
  usMean: number;
  usP95: number;
  usMax: number;
  /** Wall ms since the published projection was computed. */
  ageMs: number;
}

const WINDOW = 240;

export class Projector {
  private readonly sampler = new SparkSampler();
  private readonly log = new EventLog();
  private dirty = true;
  private lastRunMs = Number.NEGATIVE_INFINITY;
  private lastTick = -1;
  private timeKey = '';
  private seq = 0;
  private runs = 0;
  private flushes = 0;
  private readonly us = new Float64Array(WINDOW);
  private usMax = 0;
  private readonly unsubscribe: () => void;

  constructor(private readonly deps: ProjectorDeps) {
    this.unsubscribe = deps.view.subscribe(() => this.markDirty());
  }

  dispose(): void {
    this.unsubscribe();
  }

  /** Request a projection on the next `frame` (salient change outside the event stream). */
  markDirty(): void {
    this.dirty = true;
  }

  /** Bus subscriber: log rows, salient → immediate projection. */
  onEvents(batch: readonly SimEvent[]): void {
    const { world } = this.deps.inspect();
    this.log.add(world, batch, UTC_AT_TICK0_S);
    if (!this.dirty)
      for (const e of batch)
        if (SALIENT_EVENTS.has(e.t)) {
          this.dirty = true;
          break;
        }
  }

  /** New game / load: forget sparklines, event log and alert ages. */
  reset(): void {
    this.sampler.reset();
    this.log.clear();
    this.lastTick = -1;
    this.dirty = true;
    this.deps.store.setState(this.deps.store.getInitialState(), true);
  }

  /** Once per rendered frame, after events were dispatched. Returns true when it projected. */
  frame(nowMs: number): boolean {
    const { world, countdown } = this.deps.inspect();
    if (world.tick < this.lastTick) this.resetHistory();
    this.sampler.sample(world, countdown);
    const t = this.deps.time(world, countdown);
    const key = `${t.paused}|${t.requested}|${t.effective}|${t.maxAllowed}|${t.lagging}`;
    if (key !== this.timeKey) this.dirty = true;
    const due = !t.paused && world.tick !== this.lastTick && nowMs - this.lastRunMs >= PROJECTION_INTERVAL_MS;
    if (!this.dirty && !due) return false;
    if (this.dirty) this.flushes++;
    this.run(nowMs, world, countdown, t, key);
    return true;
  }

  /** Project now regardless of cadence (debug `state()`, tests). */
  flush(): UiProjection {
    const { world, countdown } = this.deps.inspect();
    if (world.tick < this.lastTick) this.resetHistory();
    this.sampler.sample(world, countdown);
    const t = this.deps.time(world, countdown);
    this.run(
      this.deps.now(),
      world,
      countdown,
      t,
      `${t.paused}|${t.requested}|${t.effective}|${t.maxAllowed}|${t.lagging}`,
    );
    return this.deps.store.getState();
  }

  stats(): ProjectorStats {
    const n = Math.min(this.runs, WINDOW);
    const xs = Array.from(this.us.subarray(0, n)).sort((a, b) => a - b);
    const mean = n ? xs.reduce((a, b) => a + b, 0) / n : 0;
    return {
      runs: this.runs,
      flushes: this.flushes,
      usLast: n ? (this.us[(this.runs - 1) % WINDOW] ?? 0) : 0,
      usMean: mean,
      usP95: n ? (xs[Math.min(n - 1, Math.floor(n * 0.95))] ?? 0) : 0,
      usMax: this.usMax,
      ageMs: Number.isFinite(this.lastRunMs) ? this.deps.now() - this.lastRunMs : Number.POSITIVE_INFINITY,
    };
  }

  private resetHistory(): void {
    this.sampler.reset();
    this.log.clear();
  }

  private run(
    nowMs: number,
    world: Readonly<World>,
    countdown: Readonly<Countdown> | null,
    time: TimeInputs,
    key: string,
  ): void {
    const t0 = this.deps.now();
    const prev = this.deps.store.getState();
    const next = projectUi(world, (prev.seq ?? 0) === 0 ? null : prev, this.deps.view.getState(), {
      countdown,
      time,
      spark: this.sampler,
      events: this.log.list(),
      seq: ++this.seq,
      ...(this.deps.hidden ? { hidden: this.deps.hidden } : {}),
    });
    const us = (this.deps.now() - t0) * 1000;
    this.us[this.runs % WINDOW] = us;
    this.usMax = Math.max(this.usMax, us);
    this.runs++;
    this.dirty = false;
    this.lastRunMs = nowMs;
    this.lastTick = world.tick;
    this.timeKey = key;
    if (next !== prev) this.deps.store.setState(next, true);
  }
}
