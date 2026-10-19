// Phase 5 scene smoke (5.1/5.2/5.8): boot with debug hooks, reach the standard states deterministically through
// window.__fuelx, assert the renderer draws and nothing throws. Screenshots are written to test-results/ always and
// to docs/screens/phase5-*.png when FUELX_SCREENS=1 (not baselines yet — those come with 5.7 freezeVisuals).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const SAVE_SCREENS = process.env.FUELX_SCREENS === '1';

// Minimal view of src/app/debug.ts `FuelxDebug` (tests/e2e is type-checked without the app's Vite/JSX config).
interface Fx {
  version: string;
  ready(): Promise<void>;
  seed(seed: number): Promise<void>;
  jumpTo(target: string): Promise<void>;
  pause(): void;
  setTimeScale(s: 0 | 1 | 10 | 100): void;
  step(n?: number): void;
  follow(callSign: string | null, opts?: { snap?: boolean }): void;
  camera(preset: 'home' | 'frame' | { yawDeg: number; pitchDeg: number; distM: number }): void;
  freezeVisuals(on: boolean): void;
  frames(n: number): Promise<void>;
  state(): {
    tick: number;
    clock: { tClock: string; phase: string | null };
    timeScale: { requested: number };
    view: { follow: string | null };
    scene: { ready: boolean };
  };
  stats(): { drawCalls: number; triangles: number } & Record<string, unknown>;
  save(): string;
  load(json: string): Promise<void>;
}
declare global {
  interface Window {
    __fuelx?: Fx;
  }
}

async function boot(page: Page, errors: string[]): Promise<void> {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?debug=1');
  await page.waitForFunction(() => window.__fuelx !== undefined);
  await page.evaluate(async () => {
    const fx = window.__fuelx;
    if (!fx) throw new Error('no __fuelx');
    await fx.seed(42);
    fx.pause();
    await fx.ready();
  });
}

async function shoot(page: Page, name: string): Promise<void> {
  const path = SAVE_SCREENS ? `docs/screens/${name}.png` : `test-results/${name}.png`;
  await page.screenshot({ path });
}

test.describe('scene', () => {
  test.describe.configure({ timeout: 180_000 });

  test('terminal count at LC-1 renders the site', async ({ page }) => {
    const errors: string[] = [];
    await boot(page, errors);
    const stats = await page.evaluate(async () => {
      const fx = window.__fuelx;
      if (!fx) throw new Error('no __fuelx');
      const t0 = fx.state().tick;
      const w0 = performance.now();
      await fx.jumpTo('T-00:00:04');
      const jumpUsPerTick = ((performance.now() - w0) * 1000) / (fx.state().tick - t0);
      fx.freezeVisuals(true);
      fx.camera('home');
      await fx.frames(3);
      return { stats: fx.stats(), state: fx.state(), jumpUsPerTick };
    });
    console.log(`jumpTo T-00:00:04: ${stats.jumpUsPerTick.toFixed(2)} µs/tick (headless, incl. autopilot)`);
    expect(stats.state.clock.tClock).toBe('T-00:00:04');
    expect(stats.state.clock.phase).toBe('TerminalCount');
    expect(stats.state.scene.ready).toBe(true);
    expect(stats.stats.drawCalls).toBeGreaterThan(0);
    expect(stats.stats.triangles).toBeGreaterThan(0);
    console.log('T-00:00:04 home', JSON.stringify(stats.stats));
    await shoot(page, 'phase5-terminal-count@T-00-00-04');
    // Close-up of the stack for the material/lighting check against docs/assets/_stack.png.
    await page.evaluate(async () => {
      const fx = window.__fuelx;
      if (!fx) throw new Error('no __fuelx');
      fx.follow('TOWER-1', { snap: true });
      fx.camera({ yawDeg: 135, pitchDeg: 24, distM: 430 });
      await fx.frames(3);
    });
    await shoot(page, 'phase5-pad-close@T-00-00-04');
    expect(errors).toEqual([]);
  });

  test('ascent following B-09 at T+00:01:45', async ({ page }) => {
    const errors: string[] = [];
    await boot(page, errors);
    const out = await page.evaluate(async () => {
      const fx = window.__fuelx;
      if (!fx) throw new Error('no __fuelx');
      await fx.jumpTo('T+00:01:45');
      fx.freezeVisuals(true);
      fx.follow('B-09', { snap: true });
      await fx.frames(3);
      return { stats: fx.stats(), state: fx.state() };
    });
    expect(out.state.clock.tClock).toBe('T+00:01:45');
    expect(out.state.view.follow).toBe('B-09');
    expect(out.stats.drawCalls).toBeGreaterThan(0);
    console.log('T+00:01:45 follow B-09', JSON.stringify(out.stats));
    await shoot(page, 'phase5-ascent-follow-B09@T+00-01-45');
    expect(errors).toEqual([]);
  });

  test('debug hooks: step, time scale, save/load round trip', async ({ page }) => {
    const errors: string[] = [];
    await boot(page, errors);
    const r = await page.evaluate(async () => {
      const fx = window.__fuelx;
      if (!fx) throw new Error('no __fuelx');
      const t0 = fx.state().tick;
      fx.step(30);
      const t1 = fx.state().tick;
      fx.setTimeScale(10);
      const scale = fx.state().timeScale;
      fx.setTimeScale(100);
      await fx.frames(90);
      const at100 = fx.stats();
      fx.pause();
      const json = fx.save();
      fx.step(90);
      await fx.load(json);
      const t2 = fx.state().tick;
      return { t0, t1, t2, scale, version: fx.version, at100 };
    });
    console.log('100x live', JSON.stringify(r.at100));
    expect(r.t1 - r.t0).toBe(30);
    expect(r.scale.requested).toBe(10);
    expect(r.t2).toBe(r.t1);
    expect(r.version).toMatch(/^\d+\.\d+\.\d+\+schema\.\d+$/);
    expect(errors).toEqual([]);
  });
});
