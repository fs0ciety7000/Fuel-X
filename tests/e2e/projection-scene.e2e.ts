// UI projection end to end (6.1): `__fuelx.state()` is the real UiProjection, the placeholder React subscriber
// renders it, React commits stay ≤ 12/s (ARCHITECTURE §13.1) at 1× and 100×, and the published projection is
// ≤ 250 ms old while running (AC 17). Runs in the serial `scene` project (name matches SCENE_SPECS); low-cost visuals.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

interface Fx {
  seed(seed: number, opts?: { autopilot?: boolean }): Promise<void>;
  ready(): Promise<void>;
  jumpTo(t: string): Promise<void>;
  pause(): void;
  setTimeScale(s: 0 | 1 | 10 | 100): void;
  frames(n: number): Promise<void>;
  state(): {
    tick: number;
    clock: { tClock: string; phase: string | null };
    timeScale: { requested: number; effective: number; readout: string };
    range: { label: string; stations: unknown[] };
    lists: { vehicles: unknown[]; tanks: unknown[]; tasks: unknown[]; events: unknown[] };
    labels: unknown[];
  };
  stats(): {
    fps: number;
    tick: number;
    reactCommitsPerS: number;
    projectorUs: { mean: number; p95: number; max: number };
    projections: { runs: number; flushes: number; ageMs: number };
  };
}
// No `declare global` here: other specs augment Window.__fuelx with their own subset type.

async function boot(page: Page, errors: string[]): Promise<void> {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/play.html?debug=1&lowfx=1');
  await page.waitForFunction(() => (window as unknown as { __fuelx?: unknown }).__fuelx !== undefined);
  await page.evaluate(async () => {
    const fx = (window as unknown as { __fuelx?: Fx }).__fuelx;
    if (!fx) throw new Error('no __fuelx');
    await fx.seed(42);
    fx.pause();
    await fx.ready();
  });
}

/** Run `ms` of wall time, then sample commits/s and the projection stats. */
async function measure(page: Page, ms: number) {
  await page.waitForTimeout(ms);
  return page.evaluate(() => {
    const fx = (window as unknown as { __fuelx?: Fx }).__fuelx;
    if (!fx) throw new Error('no __fuelx');
    return fx.stats();
  });
}

test.describe('projection', () => {
  test.describe.configure({ timeout: 180_000 });

  test('state(), readout, commits ≤ 12/s, freshness', async ({ page }) => {
    const errors: string[] = [];
    await boot(page, errors);
    const s0 = await page.evaluate(() => {
      const fx = (window as unknown as { __fuelx?: Fx }).__fuelx;
      if (!fx) throw new Error('no __fuelx');
      return fx.state();
    });
    expect(s0.clock.tClock).toBe('T−06:00:00');
    expect(s0.range.stations).toHaveLength(5);
    expect(s0.lists.vehicles.length).toBeGreaterThan(5);
    expect(s0.lists.tanks.length).toBe(6);
    expect(s0.labels.length).toBeGreaterThan(10);

    // 100× in Rollout (allowed), placeholder subscriber re-renders on every clock change.
    await page.evaluate(() => (window as unknown as { __fuelx?: Fx }).__fuelx?.setTimeScale(100));
    const fast = await measure(page, 4_000);
    console.log('100x', JSON.stringify(fast));
    expect(fast.reactCommitsPerS).toBeLessThanOrEqual(12);
    expect(fast.projections.ageMs).toBeLessThanOrEqual(250 + 1000 / Math.max(1, fast.fps));
    await expect(page.getByTestId('projection-readout')).toContainText('100×'); // `SIM 100×` or, lagging under SwiftShader, `SIM 22.0× OF 100×`

    // 1× at the terminal count (forced 1×).
    await page.evaluate(async () => {
      const fx = (window as unknown as { __fuelx?: Fx }).__fuelx;
      if (!fx) throw new Error('no __fuelx');
      fx.pause();
      await fx.jumpTo('T-00:00:40');
      fx.setTimeScale(1);
    });
    const slow = await measure(page, 4_000);
    console.log('1x', JSON.stringify(slow));
    expect(slow.reactCommitsPerS).toBeLessThanOrEqual(12);
    await expect(page.getByTestId('projection-readout')).toContainText('TERMINAL COUNT');
    expect(errors).toEqual([]);
  });
});
