// perf-audit reference scenes (5.9, ARCHITECTURE §13.1): production build + `?debug=1`, full visuals (no lowfx).
// Per scene: renderer counts on a frozen frame (draw calls main / shadow, triangles, points, FX sprites, programs,
// textures), then ~10 s live at 1× for rAF frame times and sim µs/tick. Counts are asserted against the budget;
// frame times are SwiftShader numbers (indicative, compared run to run in docs/QA.md), never asserted. The loop's
// own `simUsPerTick` is a mean of per-advance ratios at performance.now()'s 100 µs clamp under SwiftShader CPU
// contention (not meaningful here), so sim cost is also timed as one 900-tick batch (`stepUsPerTick`).
// Run: `npm run perf -- --browser` (or `FUELX_PERF=1 npx playwright test --project perf`). Writes
// test-results/perf-scenes.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

interface Scene {
  name: string;
  /** Body run with `fx` = window.__fuelx after seed(42) + pause + ready. */
  setup: string;
}

// The three ARCHITECTURE §13 reference scenes; the terminal count is taken twice (T-4 s before ignition, T+3 s with
// the full plume and deluge on screen) because "everything on screen + exhaust" straddles T-0.
const SCENES: Scene[] = [
  { name: 'terminal-count-LC1@T-00-00-04', setup: `await fx.jumpTo('T-00:00:04'); fx.camera('home', { snap: true });` },
  { name: 'liftoff-LC1@T+00-00-03', setup: `await fx.jumpTo('T+00:00:03'); fx.camera('home', { snap: true });` },
  {
    name: 'ascent-follow-B09@T+00-01-45',
    setup: `await fx.jumpTo('T+00:01:45'); fx.follow('B-09', { snap: true }); await fx.frames(1);
      fx.camera({ yawDeg: 200, pitchDeg: 14, distM: 900 }, { snap: true });`,
  },
  {
    name: 'rollout-SP41-B09@T-05-15-00',
    setup: `await fx.jumpTo('T-05:15:00'); fx.camera({ yawDeg: 125, pitchDeg: 20, distM: 300 }, { snap: true });
      await fx.frames(1); fx.follow('SP-41', { snap: true });`,
  },
];

const LIVE_MS = 10_000;
const BUDGET = (
  JSON.parse(readFileSync('scripts/perf/budget.json', 'utf8')) as {
    scene: {
      mainDrawCalls: number;
      shadowDrawCalls: number;
      triangles: number;
      pointCloud: number;
      fxSprites: number;
      programs: number;
    };
  }
).scene;

interface Sample {
  drawCalls: number;
  mainDrawCalls: number;
  shadowDrawCalls: number;
  triangles: number;
  points: number;
  fxPoints: number;
  particles: number;
  geometries: number;
  textures: number;
  programs: number;
  entities: number;
}
interface Live {
  frames: number;
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  simUsPerTick: { mean: number; p95: number };
  simMsPerFrame: number;
  reactCommitsPerS: number;
  /** 900 ticks stepped in one paused batch, timed page-side: sim + snapshot/anim writers per tick. */
  stepUsPerTick: number;
}

async function fx<T>(page: Page, body: string): Promise<T> {
  return page.evaluate(
    (src) =>
      new Function('fx', `return (async () => { ${src} })();`)(
        (window as unknown as { __fuelx?: unknown }).__fuelx,
      ) as Promise<T>,
    body,
  );
}

test.describe('perf reference scenes', () => {
  test.describe.configure({ timeout: 1_200_000 });

  test('counts within ARCHITECTURE §13.1; frame times recorded', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/play.html?debug=1');
    await page.waitForFunction(() => '__fuelx' in window);
    const out: Record<string, { counts: Sample; live: Live }> = {};
    for (const s of SCENES) {
      const counts = await fx<Sample>(
        page,
        `await fx.seed(42); fx.pause(); await fx.ready();
         ${s.setup}
         fx.freezeVisuals(true); await fx.frames(4);
         const r = fx.stats();
         return { drawCalls: r.drawCalls, mainDrawCalls: r.mainDrawCalls, shadowDrawCalls: r.shadowDrawCalls,
           triangles: r.triangles, points: r.points, fxPoints: r.fxPoints, particles: r.particles,
           geometries: r.geometries, textures: r.textures, programs: r.programs, entities: r.entities };`,
      );
      const live = await fx<Live>(
        page,
        `fx.freezeVisuals(false); fx.setTimeScale(1);
         const d = []; let last = performance.now();
         const t0 = last;
         await new Promise((done) => {
           const tick = (now) => { d.push(now - last); last = now; if (now - t0 < ${LIVE_MS}) requestAnimationFrame(tick); else done(); };
           requestAnimationFrame(tick);
         });
         fx.pause();
         const w0 = performance.now();
         fx.step(900);
         const stepUsPerTick = ((performance.now() - w0) * 1000) / 900;
         d.shift();
         d.sort((a, b) => a - b);
         const q = (p) => d.length ? d[Math.min(d.length - 1, Math.floor(d.length * p))] : 0;
         const r = fx.stats();
         return { frames: d.length, medianMs: q(0.5), p95Ms: q(0.95), p99Ms: q(0.99), simUsPerTick: r.simUsPerTick,
           simMsPerFrame: r.simMsPerFrame, reactCommitsPerS: r.reactCommitsPerS, stepUsPerTick };`,
      );
      out[s.name] = { counts, live };
      console.log(`${s.name}: ${JSON.stringify(counts)} live ${JSON.stringify(live)}`);
      expect(counts.mainDrawCalls, `${s.name} main draw calls`).toBeLessThanOrEqual(BUDGET.mainDrawCalls);
      expect(counts.shadowDrawCalls, `${s.name} shadow draw calls`).toBeLessThanOrEqual(BUDGET.shadowDrawCalls);
      expect(counts.triangles, `${s.name} triangles`).toBeLessThanOrEqual(BUDGET.triangles);
      expect(counts.points - counts.fxPoints, `${s.name} point cloud`).toBeLessThanOrEqual(BUDGET.pointCloud);
      expect(counts.particles, `${s.name} FX sprites`).toBeLessThanOrEqual(BUDGET.fxSprites);
      expect(counts.programs, `${s.name} programs`).toBeLessThanOrEqual(BUDGET.programs);
    }
    writeFileSync('test-results/perf-scenes.json', `${JSON.stringify(out, null, 2)}\n`);
    expect(errors).toEqual([]);
  });
});
