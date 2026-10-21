// 8.2 accessibility & keyboard audit, game HUD (/play) — DESIGN_SYSTEM §8. Repeatable form of the audit in
// docs/QA.md "Phase 8 accessibility & keyboard audit (8.2)":
// - axe-core (WCAG 2.0/2.1 A/AA + best practices) finds nothing at 1920×1080 and 1280×720;
// - skip link first, `Enter` on it lands in the panels; Tab order = top bar → flight → poll → inspector → tabs →
//   strip → countdown → map controls → world labels; every focus stop shows the 2 px ink ring;
// - every key of the keyboard map acts on the game (Space , . N Shift+H H F G O B Alt+1…5 + − Q E Z C Esc / Enter);
// - live regions present and written; reduced motion zeroes durations;
// - SP-42 WIND HOLD (seed 42, T-02:19:27) prints its full status in the row and the inspector at 1280×720.
// Screenshots go to test-results/ (docs/screens/phase8-a11y-*.png when FUELX_SCREENS=1).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const SAVE_SCREENS = process.env.FUELX_SCREENS === '1';
const NUDGE = 'fuelx:camera-nudge';

interface Fx {
  ready(): Promise<void>;
  seed(seed: number, opts?: { autopilot?: boolean }): Promise<void>;
  jumpTo(target: string | { phase: string }): Promise<void>;
  pause(): void;
  step(n?: number): void;
  follow(callSign: string | null, opts?: { snap?: boolean }): void;
  freezeVisuals(on: boolean): void;
  frames(n: number): Promise<void>;
  time(): { requested: number; paused: boolean; skipping: string | null };
  state(): {
    clock: { tClock: string; holding: boolean };
    view?: { selected: string | null; follow: string | null; tab: string };
    decision: { kind: string } | null;
    debrief: unknown;
    labels: { id: string; callSign: string; statusLabel?: string }[];
    lists: { vehicles: { id: string; name: string }[] };
  };
}
type FxWindow = { __fuelx?: Fx; __nudges?: number };

/** Run `fn(window.__fuelx)` in the page (the function is sent as source, so it must be self-contained). */
const fxEval = <T>(page: Page, fn: (fx: Fx) => T | Promise<T>): Promise<T> =>
  page.evaluate(`(${fn.toString()})(window.__fuelx)`) as Promise<T>;

const view = (page: Page) => fxEval(page, (fx) => fx.state().view ?? null);
const time = (page: Page) => fxEval(page, (fx) => fx.time());
/**
 * Rate keys read the throttled (10 Hz) projection, so wait until it reflects the last request before the next
 * key — a player never presses twice inside 100 ms (finding F9 in QA 8.2).
 */
const settled = (page: Page) =>
  expect
    .poll(() =>
      fxEval(page, (fx) => {
        const t = fx.time();
        const p = fx.state() as unknown as { timeScale: { paused: boolean; requested: number } };
        return p.timeScale.paused === t.paused && (t.paused || p.timeScale.requested === t.requested);
      }),
    )
    .toBe(true);

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: SAVE_SCREENS ? `docs/screens/phase8-a11y-${name}.png` : `test-results/phase8-a11y-${name}.png`,
  });
}

/** Seed 42 (autopilot), paused at the SP-42 wind hold: D1 strip open, count running, labels on screen. */
async function boot(page: Page): Promise<void> {
  await page.goto('/play.html?debug=1&lowfx=1');
  await page.waitForFunction(() => (window as unknown as FxWindow).__fuelx !== undefined);
  await fxEval(page, async (fx) => {
    await fx.seed(42);
    fx.pause();
    await fx.ready();
    await fx.jumpTo('T-02:19:40');
    for (let i = 0; i < 200; i++) {
      const l = fx.state().labels.find((x) => x.callSign === 'SP-42');
      if (l && /WIND HOLD/.test(l.statusLabel ?? '')) break;
      fx.step(30);
    }
    fx.freezeVisuals(true);
    await fx.frames(3);
  });
}

/** Focus nothing (keys go to the window, not a control). */
const blur = (page: Page) =>
  page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });

async function axe(page: Page) {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    .analyze();
  return r.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0]?.target.join(' ')}`);
}

/** Tab from the top of the page; returns, per stop, the HUD region and whether a ≥ 2 px outline is drawn. */
async function tabWalk(page: Page, stops: number) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.getSelection()?.removeAllRanges();
  });
  const out: { region: string; name: string; ring: boolean }[] = [];
  for (let i = 0; i < stops; i++) {
    await page.keyboard.press('Tab');
    out.push(
      await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        if (!a || a === document.body) return { region: 'body', name: '', ring: false };
        const region =
          a.closest('[data-slot]')?.getAttribute('data-slot') ??
          (a.closest('[data-fx-label]') ? 'label' : a.tagName === 'A' ? 'skip' : 'other');
        // The search form draws the ring for its field (:focus-within).
        const ringEl = a.tagName === 'INPUT' ? (a.closest('form') ?? a) : a;
        const cs = getComputedStyle(ringEl);
        const ring = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2;
        return { region, name: (a.getAttribute('aria-label') ?? a.textContent ?? '').trim().slice(0, 40), ring };
      }),
    );
  }
  return out;
}

const SPEC_ORDER = ['skip', 'top', 'toasts', 'flight', 'poll', 'inspect', 'tabs', 'strip', 'time', 'ctrl', 'label'];

test.describe('a11y · /play', () => {
  test.describe.configure({ timeout: 600_000 });

  test('1920×1080: axe clean, skip link, focus order + rings, live regions, every key of the map', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await boot(page);

    // --- landmarks / names (axe) --------------------------------------------------------------------
    expect(await axe(page)).toEqual([]);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('search')).toHaveCount(1);
    await expect(page.locator('#fx-live-polite')).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('#fx-live-assertive')).toHaveAttribute('aria-live', 'assertive');

    // --- skip link + Tab order ------------------------------------------------------------------------
    const walk = await tabWalk(page, 45);
    expect(walk[0]?.region).toBe('skip');
    const firstSeen = SPEC_ORDER.map((r) => walk.findIndex((w) => w.region === r)).filter((i) => i >= 0);
    expect(firstSeen).toEqual([...firstSeen].sort((a, b) => a - b));
    for (const r of ['top', 'flight', 'tabs', 'time', 'ctrl', 'label'])
      expect(walk.some((w) => w.region === r)).toBe(true);
    expect(walk.filter((w) => w.region !== 'body' && !w.ring)).toEqual([]);
    // (walk[0] proved the link is the first stop; focus it again directly — after a blur Chrome keeps its
    // sequential-navigation start point, so a fresh Tab would not restart at the top.)
    await page.getByRole('link', { name: 'SKIP TO PANELS' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#hud-panels')).toBeFocused();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.closest('#hud-panels') !== null)).toBe(true);

    // --- Space , . (rate) + polite announcement -----------------------------------------------------------
    await blur(page);
    expect((await time(page)).paused).toBe(true);
    await page.keyboard.press('Space');
    await settled(page);
    const running = await time(page);
    expect(running.paused).toBe(false);
    await expect(page.locator('#fx-live-polite')).toHaveText(/RATE|×/);
    await page.keyboard.press('.');
    await settled(page);
    const faster = (await time(page)).requested;
    expect(faster).toBeGreaterThan(running.requested);
    await page.keyboard.press(',');
    await settled(page);
    expect((await time(page)).requested).toBe(running.requested);
    await page.keyboard.press('Space');
    expect((await time(page)).paused).toBe(true);

    // --- N: skip to the next milestone, N again cancels -----------------------------------------------------
    const skipActive = () =>
      fxEval(
        page,
        (fx) => (fx.state() as unknown as { timeScale: { skip: { active: boolean } } }).timeScale.skip.active,
      );
    await page.keyboard.press('n');
    expect((await time(page)).skipping).not.toBeNull();
    await expect.poll(skipActive).toBe(true);
    await page.keyboard.press('n');
    expect((await time(page)).skipping).toBeNull();
    await expect.poll(skipActive).toBe(false);

    // --- Alt+1…5 -------------------------------------------------------------------------------------
    const panel = page.getByTestId('tabbed-panel');
    for (const [k, tab] of [
      ['2', 'tanks'],
      ['3', 'tasks'],
      ['4', 'range'],
      ['5', 'events'],
      ['1', 'vehicles'],
    ] as const) {
      await page.keyboard.press(`Alt+${k}`);
      await expect(panel).toHaveAttribute('data-tab', tab);
    }

    // --- / search: filters the open tab, Esc clears, Esc again leaves ------------------------------------
    await page.keyboard.press('/');
    const field = page.getByRole('searchbox', { name: 'Filter the open tab' });
    await expect(field).toBeFocused();
    await page.keyboard.type('SP-4');
    const rows = panel.getByRole('option');
    await expect(rows).toHaveCount(2);
    await expect(panel).toContainText(/2 OF \d+ ITEMS/);
    await page.keyboard.type('9');
    await expect(page.getByTestId('search-no-match')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(field).toHaveValue('');
    await expect(field).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(field).not.toBeFocused();
    expect((await rows.count()) > 2).toBe(true);

    // --- list row: Space selects (no camera), F follows, global F unfollows, Z frames, H home, Esc deselects -
    const sp42 = rows.filter({ hasText: 'SP-42' });
    await sp42.focus();
    await page.keyboard.press('Space');
    await expect.poll(async () => (await view(page))?.selected).toBe('SP-42');
    expect((await view(page))?.follow).toBeNull();
    await page.keyboard.press('f');
    await expect.poll(async () => (await view(page))?.follow).toBe('SP-42');
    await blur(page);
    await page.keyboard.press('f');
    await expect.poll(async () => (await view(page))?.follow).toBeNull();
    await page.keyboard.press('z');
    await expect.poll(async () => (await view(page))?.follow).toBe('SP-42');
    await page.keyboard.press('h');
    await expect.poll(async () => (await view(page))?.follow).toBeNull();
    expect((await view(page))?.selected).toBe('SP-42');
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await view(page))?.selected).toBeNull();

    // --- + − Q E nudge the camera; C recenters on the followed entity ---------------------------------------
    await page.evaluate((ev) => {
      const w = window as unknown as FxWindow;
      w.__nudges = 0;
      window.addEventListener(ev, () => {
        w.__nudges = (w.__nudges ?? 0) + 1;
      });
    }, NUDGE);
    for (const k of ['+', '-', 'q', 'e']) await page.keyboard.press(k);
    expect(await page.evaluate(() => (window as unknown as FxWindow).__nudges)).toBe(4);
    // While following, the compass reads the vehicle's heading, so C is checked on the rendered world: after an
    // zoom nudge has settled, C re-frames the followed entity (the frozen scene only changes with the camera).
    const world = () => page.screenshot({ clip: { x: 400, y: 120, width: 1000, height: 700 } });
    await fxEval(page, async (fx) => {
      fx.follow('SP-42', { snap: true });
      await fx.frames(8);
    });
    const framed = await world();
    // Zoom in three steps (rotation alone would not show: C re-fits the distance, it keeps the yaw).
    for (let i = 0; i < 3; i++) await page.keyboard.press('+');
    await fxEval(page, (fx) => fx.frames(40));
    const nudged = await world();
    expect(nudged.equals(framed)).toBe(false);
    await page.keyboard.press('c');
    await fxEval(page, (fx) => fx.frames(60));
    expect((await world()).equals(nudged)).toBe(false);

    // --- Enter on a world label tag follows it (select + camera) ------------------------------------------
    const tag = page.locator('[data-fx-label][data-mode="tag"] button').first();
    const tagName = ((await tag.getAttribute('aria-label')) ?? '').split(',')[0] ?? '';
    await tag.focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await view(page))?.follow).toBe(tagName);
    await page.keyboard.press('h');
    await expect.poll(async () => (await view(page))?.follow).toBeNull();

    // --- O expands / collapses the D1 strip; G focuses it ---------------------------------------------------
    await blur(page);
    const strip = page.getByTestId('decision-strip');
    expect((await fxEval(page, (fx) => fx.state().decision?.kind)) ?? '').toBe('PROP_MARGIN');
    const collapsed = async () => (await strip.getAttribute('data-collapsed')) === 'true';
    const before = await collapsed();
    await page.keyboard.press('o');
    await expect.poll(collapsed).toBe(!before);
    await page.keyboard.press('o');
    await expect.poll(collapsed).toBe(before);
    await page.keyboard.press('g');
    expect(await page.evaluate(() => document.activeElement?.closest('[data-testid="decision-strip"]') !== null)).toBe(
      true,
    );
    await expect.poll(collapsed).toBe(false);
    await shot(page, 'keys-d1-focused@1920');

    // --- Shift+H holds the count ------------------------------------------------------------------------
    await blur(page);
    const before0 = await fxEval(
      page,
      (fx) =>
        (fx.state() as unknown as { lists: { events: { code?: string }[] } }).lists.events.filter(
          (e) => e.code === 'HoldStarted',
        ).length,
    );
    expect(before0).toBe(0);
    await page.keyboard.press('Shift+H');
    await fxEval(page, (fx) => fx.step(2));
    // The demo autopilot (seed 42 default) may release a manual hold at once, so read the log, not the clock.
    const holds = await fxEval(
      page,
      (fx) =>
        (fx.state() as unknown as { lists: { events: { code?: string; message: string }[] } }).lists.events.filter(
          (e) => e.code === 'HoldStarted',
        ).length,
    );
    expect(holds).toBeGreaterThan(0);
    // A modal dialog owns Esc: the global chain never runs under it (checked by the debrief test below).
    expect(errors).toEqual([]);
  });

  test('1280×720: axe clean, compact focus order, SP-42 wind hold prints its full status', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await boot(page);
    expect(await axe(page)).toEqual([]);
    const walk = await tabWalk(page, 40);
    expect(walk[0]?.region).toBe('skip');
    const firstSeen = SPEC_ORDER.map((r) => walk.findIndex((w) => w.region === r)).filter((i) => i >= 0);
    expect(firstSeen).toEqual([...firstSeen].sort((a, b) => a - b));
    expect(walk.filter((w) => w.region !== 'body' && !w.ring)).toEqual([]);

    // Ambient SP-42 held by the gust (AC 26): status text is long; nothing may clip it at the compact size.
    await fxEval(page, async (fx) => {
      fx.follow('SP-42', { snap: true });
      await fx.frames(6);
    });
    const status =
      (await fxEval(page, (fx) => fx.state().labels.find((l) => l.callSign === 'SP-42')?.statusLabel)) ?? '';
    expect(status).toMatch(/WIND HOLD · GUST \d+\.\d M\/S/);
    const inspector = page.getByTestId('inspector');
    await expect(inspector).toContainText(status);
    const fits = await page.evaluate(() => {
      const out: string[] = [];
      const insp = document.querySelector<HTMLElement>('[data-testid="inspector"]');
      if (insp && insp.scrollWidth > insp.clientWidth + 1)
        out.push(`inspector ${insp.scrollWidth}/${insp.clientWidth}`);
      const row = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((r) =>
        r.textContent?.includes('SP-42'),
      );
      const sub = row?.querySelector<HTMLElement>('span > span:last-child');
      if (!sub) out.push('no SP-42 row');
      else if (sub.scrollWidth > sub.clientWidth + 1) out.push(`row sub ${sub.scrollWidth}/${sub.clientWidth}`);
      const tabs = document.querySelector<HTMLElement>('[role="tablist"]');
      if (tabs && tabs.scrollWidth > tabs.clientWidth + 1) out.push(`tablist ${tabs.scrollWidth}/${tabs.clientWidth}`);
      const tag = document.querySelector<HTMLElement>('[data-fx-label] button[aria-label^="SP-42"]');
      if (tag && tag.scrollWidth > tag.clientWidth + 1) out.push(`tag ${tag.scrollWidth}/${tag.clientWidth}`);
      return out;
    });
    expect(fits).toEqual([]);
    await expect(page.locator('[data-fx-label] button[aria-label^="SP-42"]')).toHaveAccessibleName(/WIND HOLD/i);
    await shot(page, 'wind-hold-SP42@1280');
  });

  test('reduced motion: durations are zero; the debrief dialog owns Esc and B reopens it', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('/play.html?debug=1&lowfx=1');
    await page.waitForFunction(() => (window as unknown as FxWindow).__fuelx !== undefined);
    await fxEval(page, async (fx) => {
      await fx.seed(42);
      fx.pause();
      await fx.ready();
      await fx.jumpTo({ phase: 'Debrief' });
      fx.freezeVisuals(true);
      await fx.frames(2);
    });
    const durations = await page.evaluate(
      () =>
        [...document.querySelectorAll<HTMLElement>('[data-testid="hud-root"] *')]
          .map((el) => getComputedStyle(el))
          .filter((cs) => parseFloat(cs.transitionDuration) > 0 || parseFloat(cs.animationDuration) > 0).length,
    );
    expect(durations).toBe(0);

    const sheet = page.getByTestId('debrief');
    await expect(sheet).toBeVisible();
    // Centred modal (8.2: the shared dialog used to open top-left).
    const box = await sheet.boundingBox();
    expect(Math.abs((box?.x ?? 0) + (box?.width ?? 0) / 2 - 960)).toBeLessThan(4);
    expect(await axe(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId('debrief-ready')).toBeVisible();
    await page.keyboard.press('b');
    await expect(sheet).toBeVisible();
    await ctx.close();
  });
});
