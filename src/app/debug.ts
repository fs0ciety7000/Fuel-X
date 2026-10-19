// `window.__fuelx` (ARCHITECTURE §9): deterministic state control for Playwright visual/e2e/perf runs.
// Installed when import.meta.env.DEV or `?debug=1`. Every method is safe from `page.evaluate`.
import { DT_S, WORLD_SCHEMA, findByCallSign } from '@sim/index';
import type { Phase } from '@sim/types';
import { SITE_VIEWS } from '@render/index';
import type { RendererStats } from '@render/index';
import { reactCommitsPerS } from './debug/react-commits';
import type { Game } from './game';
import { parseJumpTarget } from './jump';
import { projectStub } from './projection/stub';
import type { UiProjectionStub } from './projection/stub';
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
}

export interface FuelxDebug {
  version: string;
  ready(): Promise<void>;
  seed(seed: number, opts?: { scenario?: 'mvp'; autopilot?: boolean }): Promise<void>;
  jumpTo(target: string | { tick: number } | { phase: Phase }): Promise<void>;
  pause(): void;
  resume(): void;
  setTimeScale(s: TimeScale): void;
  step(n?: number): void;
  follow(callSign: string | null, opts?: { snap?: boolean }): void;
  site(code: string): void;
  camera(preset: 'home' | 'frame' | { yawDeg: number; pitchDeg: number; distM: number }): void;
  freezeVisuals(on: boolean): void;
  frames(n: number): Promise<void>;
  state(): UiProjectionStub;
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
      await host.newGame({ seed, scenario: opts?.scenario ?? 'mvp', autopilot: opts?.autopilot ?? true });
      controls.followId = null;
      controls.cameraRequest = { kind: 'home' };
      game.afterTeleport();
      await frames(1);
    },

    jumpTo: async (target) => {
      await host.jump(parseJumpTarget(target));
      game.afterTeleport();
      await frames(1);
    },

    pause: () => time.setScale(0),
    resume: () => time.setScale(time.requested),
    setTimeScale: (s) => {
      if (![0, 1, 10, 100].includes(s)) throw new Error('BAD_TIME_SCALE');
      time.setScale(s);
    },

    step: (n = 1) => {
      host.advance({ maxSteps: Math.max(1, Math.floor(n)), budgetMs: Number.POSITIVE_INFINITY });
      game.bus.dispatch(host.drainEvents());
      loop.resetAccumulator();
    },

    follow: (callSign, opts) => {
      if (callSign === null) {
        controls.followId = null;
        controls.cameraRequest = { kind: 'home' };
      } else {
        const e = findByCallSign(host.inspect().world, callSign);
        if (!e) throw new Error(`UNKNOWN_CALLSIGN ${callSign}`);
        controls.followId = e.id;
        controls.cameraRequest = { kind: 'frame' };
      }
      controls.snapCamera = opts?.snap ?? false;
    },

    site: (code) => {
      if (!(code in SITE_VIEWS)) throw new Error(`UNKNOWN_SITE ${code}`);
      controls.siteId = code;
      controls.followId = null;
      controls.cameraRequest = { kind: 'home' };
    },

    camera: (preset) => {
      controls.cameraRequest = typeof preset === 'string' ? { kind: preset } : { kind: 'orbit', ...preset };
    },

    freezeVisuals: (on) => {
      controls.frozen = on;
      controls.frozenTimeS = host.inspect().world.tick * DT_S;
      if (on) controls.snapCamera = true;
    },

    frames,

    state: () => {
      const { world, countdown } = host.inspect();
      const follow = controls.followId ? (world.entities.byId[controls.followId]?.callSign ?? null) : null;
      return projectStub({
        world,
        countdown,
        timeScale: {
          requested: time.requested,
          effective: time.effectiveScale(world, countdown),
          maxAllowed: time.maxAllowed(world, countdown),
          lagging: time.lagging,
          paused: time.paused,
        },
        view: { site: controls.siteId, follow, frozen: controls.frozen },
        scene: { ready: game.scene?.isReady() ?? false, frames: game.scene?.frames() ?? 0 },
        hidden: (id) => game.isHidden(id),
      });
    },

    stats: () => {
      const { world, countdown } = host.inspect();
      const ft = Array.from(loop.frameTimes()).sort((a, b) => a - b);
      const mean = ft.length ? ft.reduce((a, b) => a + b, 0) / ft.length : 0;
      const sim = host.timings();
      const r = game.scene?.stats() ?? {
        drawCalls: 0,
        triangles: 0,
        points: 0,
        geometries: 0,
        textures: 0,
        programs: 0,
      };
      const scale = time.effectiveScale(world, countdown);
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
      };
    },

    save: () => host.saveSync({ game: APP_VERSION, createdAt: new Date().toISOString() }),

    load: async (json) => {
      await host.load(json);
      controls.followId = null;
      controls.cameraRequest = { kind: 'home' };
      game.afterTeleport();
      await frames(1);
    },
  };
  return api;
}

export function installDebug(game: Game): FuelxDebug {
  const api = createDebugApi(game);
  window.__fuelx = api;
  return api;
}
