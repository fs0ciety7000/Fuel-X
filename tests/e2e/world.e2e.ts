// Phase 5 world (5.3 sea + ground, 5.7 post + freezeVisuals): the point cloud stays in budget, frozen visuals are
// pixel-static (same state → same image) and live visuals animate the sea. Screenshots go to test-results/ always and
// to docs/screens/phase5-world-*.png when FUELX_SCREENS=1.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const SAVE_SCREENS = process.env.FUELX_SCREENS === '1';
/** Below the debug overlay (live fps counter) so frame-to-frame comparisons only see the world. */
const WORLD_CLIP = { x: 0, y: 64, width: 1920, height: 1016 };
/** Software GL renders a frame in seconds: give screenshots room. */
const SHOT_TIMEOUT = 150_000;

// Shape of src/app/debug.ts `FuelxDebug` used here (documentation; calls go through `fx()` as source strings).
export interface Fx {
  ready(): Promise<void>;
  seed(seed: number): Promise<void>;
  jumpTo(target: string): Promise<void>;
  pause(): void;
  follow(callSign: string | null, opts?: { snap?: boolean }): void;
  camera(preset: 'home' | 'frame' | { yawDeg: number; pitchDeg: number; distM: number }): void;
  freezeVisuals(on: boolean): void;
  frames(n: number): Promise<void>;
  state(): { clock: { tClock: string } };
  stats(): { drawCalls: number; triangles: number; points: number } & Record<string, unknown>;
}

async function fx<T>(page: Page, body: string): Promise<T> {
  return page.evaluate(
    (src) =>
      new Function('fx', `return (async () => { ${src} })();`)(
        (window as unknown as { __fuelx?: Fx }).__fuelx,
      ) as Promise<T>,
    body,
  );
}

async function shot(page: Page, name: string): Promise<Buffer> {
  const path = SAVE_SCREENS ? `docs/screens/${name}.png` : `test-results/${name}.png`;
  return page.screenshot({ path, timeout: SHOT_TIMEOUT });
}

test.describe('world', () => {
  test.describe.configure({ timeout: 600_000 });

  test('sea + ground in budget, frozen visuals static, live sea animated', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto('/play.html?debug=1');
    await page.waitForFunction(() => '__fuelx' in window);
    const home = await fx<{ points: number; fxPoints: number; drawCalls: number; t: string }>(
      page,
      `await fx.seed(42); fx.pause(); await fx.ready();
       await fx.jumpTo('T-00:00:04'); fx.freezeVisuals(true); fx.camera('home'); await fx.frames(3);
       const s = fx.stats();
       return { points: s.points, fxPoints: s.fxPoints, drawCalls: s.drawCalls, t: fx.state().clock.tClock };`,
    );
    console.log('world home', JSON.stringify(home));
    expect(home.t).toBe('T-00:00:04');
    // renderer.info counts every point vertex: the FX sprites (5.6, own ≤ 20 k budget) are not part of the cloud
    const cloud = home.points - home.fxPoints;
    expect(cloud).toBeGreaterThan(0);
    expect(cloud).toBeLessThanOrEqual(300_000); // ARCHITECTURE §13.1
    await shot(page, 'phase5-world-home@T-00-00-04');

    // Sea-facing view from behind the pad: shoreline foam, crest streaks, scrub dots.
    await fx(
      page,
      `fx.follow('TOWER-1', { snap: true }); fx.camera({ yawDeg: 250, pitchDeg: 22, distM: 900 }); await fx.frames(3);`,
    );
    const a = await shot(page, 'phase5-world-sea@T-00-00-04');
    await fx(page, 'await fx.frames(4);');
    const b = await page.screenshot({ clip: WORLD_CLIP, timeout: SHOT_TIMEOUT });
    const a2 = await page.screenshot({ clip: WORLD_CLIP, timeout: SHOT_TIMEOUT });
    expect(a.length).toBeGreaterThan(0);
    expect(b.equals(a2)).toBe(true); // frozen: identical frames

    // Unfrozen (sim still paused): the visual clock resumes from the frozen time and the sea moves.
    await fx(page, 'fx.freezeVisuals(false); await fx.frames(3);');
    const c = await page.screenshot({ clip: WORLD_CLIP, timeout: SHOT_TIMEOUT });
    await fx(page, 'fx.freezeVisuals(true);');
    expect(c.equals(b)).toBe(false);
    expect(errors).toEqual([]);
  });
});
