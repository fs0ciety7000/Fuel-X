// `window.__fuelx` (ARCHITECTURE §9): deterministic state control for Playwright visual/e2e/perf runs.
// Installed when import.meta.env.DEV or `?debug=1`. Every method is safe from `page.evaluate`.
import { view } from '@bridge/index';
import type { UiProjection } from '@bridge/index';
import { DT_S, WORLD_SCHEMA, findByCallSign } from '@sim/index';
import type { Phase } from '@sim/types';
import { SITE_VIEWS } from '@render/index';
import type { RendererStats } from '@render/index';
import { lowFxRequested } from './debug/enabled';
import { reactCommitsPerS } from './debug/react-commits';
import type { Game } from './game';
import { parseJumpTarget } from './jump';
import type { SessionFile } from './session/session';
import type { SkipBlockCode } from './time/rules';
import type { TimeScale } from './time/time-control';
import { APP_VERSION } from './version';

export interface FuelxStats extends RendererStats {
  fps: number;
  frameMs: { median: number; p95: number };
  simUsPerTick: { mean: number; p95: number };
  simMsPerFrame: number;
  entities: number;
  tick: number;
  timeScale: number;
  effectiveTimeScale: number;
  reactCommitsPerS: number;
  /** UI projector cost per run (6.1), µs, and age of the published projection, ms. */
  projectorUs: { mean: number; p95: number; max: number; last: number };
  projections: { runs: number; flushes: number; ageMs: number };
}

/** `state()`: a fresh UiProjection (flushed on call) + scene readiness. */
export type FuelxState = UiProjection & { scene: { ready: boolean; frames: number }; frozen: boolean };

export interface FuelxDebug {
  version: string;
  ready(): Promise<void>;
  seed(seed: number, opts?: { scenario?: 'mvp'; autopilot?: boolean }): Promise<void>;
  jumpTo(target: string | { tick: number } | { phase: Phase }): Promise<void>;
  pause(): void;
  resume(): void;
  setTimeScale(s: TimeScale): void;
  /** SKIP TO NEXT MILESTONE (7.2): null when started, else the blocker code (no throw). */
  skip(): SkipBlockCode | null;
  /** EXPORT LOG payload (AC 32), without downloading. */
  exportSession(): SessionFile;
  /** Time-rule state (7.2): requested / effective / cap, skip target, last drop. */
  time(): {
    requested: number;
    paused: boolean;
    effective: number;
    maxAllowed: number;
    skipping: string | null;
    drop: string | null;
    drops: number;
  };
  step(n?: number): void;
  follow(callSign: string | null, opts?: { snap?: boolean }): void;
  site(code: string): void;
  camera(
    preset: 'home' | 'frame' | { yawDeg: number; pitchDeg: number; distM: number },
    opts?: { snap?: boolean },
  ): void;
  freezeVisuals(on: boolean): void;
  /**
   * Queues a `CatchDecision` for the flying booster (or `booster` by call-sign) — e.g. force a divert for the
   * recovery-zone screenshots. The sim validates it like any player command (window, ALREADY_DECIDED).
   */
  catchDecision(choice: 'CATCH' | 'DIVERT', booster?: string): void;
  /** Low-cost visuals for software GL (no dot screen, point cloud or post); also `?lowfx=1`. */
  lowFx(on: boolean): void;
  frames(n: number): Promise<void>;
  state(): FuelxState;
  stats(): FuelxStats;
  save(): string;
  load(json: string): Promise<void>;
}

declare global {
  interface Window {
    __fuelx?: FuelxDebug;
  }
}

const READY_TIMEOUT_MS = 60_000;

function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
}

export function createDebugApi(game: Game): FuelxDebug {
  const { host, time, loop, controls } = game;

  const frames = (n: number): Promise<void> =>
    new Promise((resolve) => {
      let left = Math.max(1, Math.floor(n));
      const off = loop.onAfterFrame(() => {
        if (--left <= 0) {
          off();
          resolve();
        }
      });
    });

  const api: FuelxDebug = {
    version: `${APP_VERSION}+schema.${WORLD_SCHEMA}`,

    ready: () =>
      new Promise((resolve, reject) => {
        const t0 = performance.now();
        const off = loop.onAfterFrame(() => {
          if (game.scene?.isReady()) {
            off();
            // one more frame so the mounted views are drawn with their poses
            void frames(1).then(resolve);
          } else if (performance.now() - t0 > READY_TIMEOUT_MS) {
            off();
            reject(new Error('READY_TIMEOUT'));
          }
        });
      }),

    seed: async (seed, opts) => {
      await game.newRun(seed, { autopilot: opts?.autopilot ?? true, url: false });
      await frames(1);
    },

    jumpTo: async (target) => {
      await host.jump(parseJumpTarget(target));
      time.cancelSkip();
      game.afterTeleport();
      await frames(1);
    },

    pause: () => view.timeScale(0),
    resume: () => view.timeScale(time.requested),
    setTimeScale: (s) => {
      if (![0, 1, 10, 100].includes(s)) throw new Error('BAD_TIME_SCALE');
      view.timeScale(s);
    },

    skip: () => game.skipToNextMilestone(),
    exportSession: () => game.session.exportSession(),
    time: () => {
      const { world, countdown } = host.inspect();
      return {
        requested: time.requested,
        paused: time.isPaused(countdown),
        effective: time.effectiveScale(world, countdown),
        maxAllowed: time.maxAllowed(world, countdown),
        skipping: time.skip?.target.name ?? null,
        drop: time.lastDrop?.code ?? null,
        drops: time.drops,
      };
    },

    step: (n = 1) => {
      host.advance({ maxSteps: Math.max(1, Math.floor(n)), budgetMs: Number.POSITIVE_INFINITY });
      game.bus.dispatch(host.drainEvents());
      loop.resetAccumulator();
    },

    // Camera / selection go through the view store like the HUD (6.1); the game applies them to the controls.
    follow: (callSign, opts) => {
      if (callSign === null) {
        view.follow(null);
      } else {
        const e = findByCallSign(host.inspect().world, callSign);
        if (!e) throw new Error(`UNKNOWN_CALLSIGN ${callSign}`);
        view.follow(e.id);
      }
      controls.snapCamera = opts?.snap ?? false;
    },

    site: (code) => {
      if (!(code in SITE_VIEWS)) throw new Error(`UNKNOWN_SITE ${code}`);
      view.site(code);
    },

    camera: (preset, opts) => {
      view.camera(typeof preset === 'string' ? { kind: preset } : { kind: 'orbit', ...preset }, opts);
    },

    freezeVisuals: (on) => {
      controls.frozen = on;
      controls.frozenTimeS = host.inspect().world.tick * DT_S;
      if (on) controls.snapCamera = true;
    },

    catchDecision: (choice, booster) => {
      const { world, countdown } = host.inspect();
      const b = booster ? findByCallSign(world, booster) : countdown ? world.entities.byId[countdown.boosterId] : null;
      if (b?.kind !== 'booster') throw new Error(`UNKNOWN_BOOSTER ${booster ?? ''}`);
      host.send({ t: 'CatchDecision', boosterId: b.id, choice });
    },

    lowFx: (on) => {
      controls.lowFx = on;
    },

    frames,

    state: () => ({
      ...game.projector.flush(),
      scene: { ready: game.scene?.isReady() ?? false, frames: game.scene?.frames() ?? 0 },
      frozen: controls.frozen,
    }),

    stats: () => {
      const { world, countdown } = host.inspect();
      const ft = Array.from(loop.frameTimes()).sort((a, b) => a - b);
      const mean = ft.length ? ft.reduce((a, b) => a + b, 0) / ft.length : 0;
      const sim = host.timings();
      const r = game.scene?.stats() ?? {
        drawCalls: 0,
        mainDrawCalls: 0,
        shadowDrawCalls: 0,
        triangles: 0,
        points: 0,
        geometries: 0,
        textures: 0,
        programs: 0,
        particles: 0,
        fxPoints: 0,
      };
      const scale = time.effectiveScale(world, countdown);
      const ps = game.projector.stats();
      return {
        fps: mean > 0 ? 1000 / mean : 0,
        frameMs: { median: percentile(ft, 0.5), p95: percentile(ft, 0.95) },
        ...r,
        simUsPerTick: { mean: sim.usPerTickMean, p95: sim.usPerTickP95 },
        simMsPerFrame: sim.lastAdvanceMs,
        entities: world.entities.order.length,
        tick: world.tick,
        timeScale: time.paused ? 0 : time.requested,
        effectiveTimeScale: time.lagging ? time.effectiveRate : scale,
        reactCommitsPerS: reactCommitsPerS(),
        projectorUs: { mean: ps.usMean, p95: ps.usP95, max: ps.usMax, last: ps.usLast },
        projections: { runs: ps.runs, flushes: ps.flushes, ageMs: ps.ageMs },
      };
    },

    save: () => host.saveSync({ game: APP_VERSION, createdAt: new Date().toISOString() }),

    load: async (json) => {
      await host.load(json);
      time.resetRun();
      game.projector.reset();
      view.reset();
      view.camera({ kind: 'home' });
      game.afterTeleport();
      await frames(1);
    },
  };
  return api;
}

export function installDebug(game: Game): FuelxDebug {
  const api = createDebugApi(game);
  if (lowFxRequested()) api.lowFx(true);
  window.__fuelx = api;
  return api;
}
