// World HUD (6.6, AC 24–25): in-world labels positioned by the render loop with declutter (≤ 64), altitude scale and
// compass tape written per frame, map controls nudging the camera. Reached through window.__fuelx with `snap`;
// screenshots to test-results/ always and to docs/screens/phase6-world-*.png when FUELX_SCREENS=1.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const SAVE_SCREENS = process.env.FUELX_SCREENS === '1';

type Orbit = { yawDeg: number; pitchDeg: number; distM: number };
interface Fx {
  ready(): Promise<void>;
  seed(seed: number): Promise<void>;
  jumpTo(target: string): Promise<void>;
  pause(): void;
  follow(callSign: string | null, opts?: { snap?: boolean }): void;
  camera(preset: 'home' | 'frame' | Orbit, opts?: { snap?: boolean }): void;
  freezeVisuals(on: boolean): void;
  frames(n: number): Promise<void>;
  state(): { view?: { follow: string | null; selected: string | null } };
  stats(): { drawCalls: number; mainDrawCalls: number; triangles: number; reactCommitsPerS: number };
}
type FxWindow = { __fuelx?: Fx };

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: SAVE_SCREENS ? `docs/screens/phase6-world-${name}.png` : `test-results/phase6-world-${name}.png`,
  });
}

/** Label modes and the overlay readouts as the render loop wrote them. */
async function overlay(page: Page) {
  return page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll<HTMLElement>('[data-fx-label]'));
    const count = (m: string) => labels.filter((l) => l.getAttribute('data-mode') === m).length;
    const alt = document.querySelector<HTMLElement>('[data-fx-altitude]');
    const cmp = document.querySelector<HTMLElement>('[data-fx-compass]');
    return {
      total: labels.length,
      tag: count('tag'),
      anchor: count('anchor'),
      hidden: count('hidden'),
      altMode: alt?.getAttribute('data-mode') ?? null,
      altReadout: alt?.querySelector('[data-fx-alt-readout]')?.textContent ?? null,
      altTicks: Array.from(alt?.querySelectorAll('[data-fx-alt-tick]') ?? []).map((t) => t.textContent),
      heading: cmp?.querySelector('[data-fx-compass-readout]')?.textContent ?? null,
      headingAria: cmp?.getAttribute('aria-label') ?? null,
    };
  });
}

test.describe('world HUD', () => {
  test.describe.configure({ timeout: 600_000 });

  test('labels, altitude scale, compass and map controls', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto('/play.html?debug=1');
    await page.waitForFunction(() => (window as unknown as FxWindow).__fuelx !== undefined);
    await page.evaluate(async () => {
      const fx = (window as unknown as FxWindow).__fuelx;
      if (!fx) throw new Error('no __fuelx');
      await fx.seed(42);
      fx.pause();
      await fx.ready();
      await fx.jumpTo('T-00:00:04');
      fx.freezeVisuals(true);
      fx.follow(null, { snap: true });
      fx.camera('home', { snap: true });
      await fx.frames(4);
    });

    // Terminal count, home view: labels placed, decluttered, ≤ 64 positioned; nothing followed → no altitude scale.
    const home = await overlay(page);
    console.log('home', JSON.stringify(home));
    expect(home.total).toBeGreaterThan(5);
    expect(home.tag).toBeGreaterThan(3);
    expect(home.tag + home.anchor).toBeLessThanOrEqual(64);
    expect(home.altMode).toBe('hidden');
    expect(home.heading).toBe('065°'); // home yaw 245° → looking along 065°
    expect(home.headingAria).toBe('Heading 65 degrees');
    await shot(page, 'labels-home@T-00-00-04');

    // Click a label tag = select (orange tag); double-click = follow (AC 25).
    const tower = page.locator('[data-fx-label] button[aria-label^="TOWER-1,"]').first();
    if ((await tower.count()) > 0 && (await tower.isVisible())) {
      await tower.click();
      await expect
        .poll(() => page.evaluate(() => (window as unknown as FxWindow).__fuelx?.state().view?.selected ?? null))
        .toBe('TOWER-1');
    }

    // Map controls: rotate right by one step turns the compass by 15° (after the damped glide).
    await page.getByRole('button', { name: 'Rotate right' }).click();
    await page.evaluate(async () => {
      await (window as unknown as FxWindow).__fuelx?.frames(40);
    });
    const rotated = await overlay(page);
    expect(rotated.heading).toBe('080°');
    await expect(page.getByRole('button', { name: 'Recenter on followed' })).toHaveAttribute('aria-disabled', 'true');

    // Ascent following the booster: altitude scale in km, followed label tag on screen.
    await page.evaluate(async () => {
      const fx = (window as unknown as FxWindow).__fuelx;
      if (!fx) throw new Error('no __fuelx');
      await fx.jumpTo('T+00:01:45');
      fx.freezeVisuals(true);
      fx.camera({ yawDeg: 200, pitchDeg: 20, distM: 900 }, { snap: true });
      await fx.frames(1);
      fx.follow('B-09', { snap: true });
      await fx.frames(4);
    });
    const ascent = await overlay(page);
    console.log('ascent', JSON.stringify(ascent));
    expect(ascent.altMode).toBe('shown');
    expect(ascent.altReadout).toMatch(/^\d+\.\d KM$/);
    expect(ascent.altTicks[0]).toBe('00');
    const b09 = await page.locator('[data-fx-label]:has(button[aria-label^="B-09,"])').getAttribute('data-mode');
    expect(b09).toBe('tag');
    await expect(page.getByRole('button', { name: 'Recenter on followed' })).toHaveAttribute('aria-pressed', 'true');
    await shot(page, 'ascent-follow-B09@T+00-01-45');

    const stats = await page.evaluate(() => (window as unknown as FxWindow).__fuelx?.stats());
    console.log('stats', JSON.stringify(stats));
    expect(errors).toEqual([]);
  });
});
