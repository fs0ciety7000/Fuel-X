// Phase 5 FX (5.6): exhaust plumes, deluge steam, landing burn, recovery-zone rings, plus the new home framing.
// Reaches each moment through window.__fuelx with frozen visuals, asserts the FX run inside the ARCHITECTURE §13.1
// budgets (≤ 20 k live sprites, draw calls) and that a frozen FX frame is pixel-static. Screenshots go to
// test-results/ always and to docs/screens/phase5-*.png when FUELX_SCREENS=1.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const SAVE_SCREENS = process.env.FUELX_SCREENS === '1';
const WORLD_CLIP = { x: 0, y: 64, width: 1920, height: 1016 };
const SHOT_TIMEOUT = 150_000;

interface Stats {
  drawCalls: number;
  triangles: number;
  particles: number;
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

async function shot(page: Page, name: string): Promise<Buffer> {
  const path = SAVE_SCREENS ? `docs/screens/${name}.png` : `test-results/${name}.png`;
  return page.screenshot({ path, timeout: SHOT_TIMEOUT });
}

const STATS = `const s = fx.stats(); return { drawCalls: s.drawCalls, triangles: s.triangles, particles: s.particles,
  t: fx.state().clock.tClock };`;

function inBudget(name: string, s: Stats): void {
  console.log(`${name}: ${s.drawCalls} draw calls, ${s.triangles} triangles, ${s.particles} fx sprites`);
  expect(s.drawCalls).toBeLessThanOrEqual(260); // main ≤ 200 + shadow ≤ 60
  expect(s.particles).toBeLessThanOrEqual(20_000);
}

test.describe('fx', () => {
  test.describe.configure({ timeout: 900_000 });

  test('plumes, deluge, rings in budget; frozen fx static', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto('/play.html?debug=1');
    await page.waitForFunction(() => '__fuelx' in window);

    // Home framing (pad + tank farm with the sea behind).
    const home = await fx<Stats & { t: string }>(
      page,
      `await fx.seed(42); fx.pause(); await fx.ready();
       await fx.jumpTo('T-00:00:04'); fx.freezeVisuals(true); fx.camera('home', { snap: true }); await fx.frames(3);
       ${STATS}`,
    );
    inBudget('home', home);
    await shot(page, 'phase5-home');

    // Liftoff: plume off the mount, deluge water + steam billows rolling out of the mount and the flame trench.
    const lift = await fx<Stats & { t: string }>(
      page,
      `await fx.jumpTo('T+00:00:03'); fx.freezeVisuals(true);
       fx.follow('OLM-1', { snap: true }); await fx.frames(1);
       fx.camera({ yawDeg: 185, pitchDeg: 8, distM: 2800 }, { snap: true }); await fx.frames(3);
       ${STATS}`,
    );
    expect(lift.t).toBe('T+00:00:03');
    expect(lift.particles).toBeGreaterThan(1_000);
    inBudget('liftoff', lift);
    const a = await page.screenshot({ clip: WORLD_CLIP, timeout: SHOT_TIMEOUT });
    await fx(page, `await fx.frames(3);`);
    const b = await page.screenshot({ clip: WORLD_CLIP, timeout: SHOT_TIMEOUT });
    expect(a.equals(b)).toBe(true); // frozen: particles seeded by tick, wall clock fixed
    await shot(page, 'phase5-fx-liftoff@T+00-00-03');

    // Ascent, following the booster: full 33-engine plume, expanded at altitude.
    const ascent = await fx<Stats & { t: string }>(
      page,
      `await fx.jumpTo('T+00:01:45'); fx.freezeVisuals(true);
       fx.camera({ yawDeg: 200, pitchDeg: 20, distM: 300 }, { snap: true }); await fx.frames(1);
       fx.follow('B-09', { snap: true }); await fx.frames(1);
       fx.camera({ yawDeg: 200, pitchDeg: 14, distM: 900 }, { snap: true }); await fx.frames(3);
       ${STATS}`,
    );
    inBudget('ascent', ascent);
    expect(ascent.particles).toBeGreaterThan(5_000);
    await shot(page, 'phase5-fx-ascent-follow-B09@T+00-01-45');

    // Landing burn (3 centre engines) on the way to the catch.
    const landing = await fx<Stats & { t: string }>(
      page,
      `await fx.jumpTo('T+00:06:40'); fx.freezeVisuals(true);
       fx.follow('B-09', { snap: true }); await fx.frames(1);
       fx.camera({ yawDeg: 225, pitchDeg: 12, distM: 420 }, { snap: true }); await fx.frames(3);
       ${STATS}`,
    );
    inBudget('landing', landing);
    expect(landing.particles).toBeGreaterThan(500);
    await shot(page, 'phase5-fx-landing-burn');

    // Recovery rings: new game, force a divert once the decision opens (boostback), follow RV-1.
    const rings = await fx<Stats & { t: string }>(
      page,
      `await fx.seed(42); fx.pause(); await fx.ready();
       await fx.jumpTo('T+00:02:50'); fx.catchDecision('DIVERT'); await fx.jumpTo('T+00:06:45');
       fx.freezeVisuals(true);
       fx.follow('RV-1', { snap: true }); await fx.frames(1);
       fx.camera({ yawDeg: 230, pitchDeg: 38, distM: 2100 }, { snap: true }); await fx.frames(3);
       ${STATS}`,
    );
    inBudget('recovery rings', rings);
    await shot(page, 'phase5-fx-recovery-rings');

    expect(errors).toEqual([]);
  });
});
