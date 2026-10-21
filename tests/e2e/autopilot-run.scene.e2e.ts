// 7.4 / AC 23, 27, 32, 33: the autopilot path — `/play?autopilot=1` boots with the scripted director (session.ts
// `autopilotFromSearch`), which issues every decision itself (D1 orders, D2 GO at each poll, D3b HOLD_FIX, D3 catch
// call). The player only drives time, through the HUD's own rate control and SKIP button; `__fuelx.step` stands in
// for long stretches of 100× (SwiftShader draws ~1 frame/s) and only reads state otherwise.
// Seed 42 (same run as the golden log): A3 leak during load, CATCH at p 0.997, Debrief CAUGHT.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

interface FxTime {
  requested: number;
  paused: boolean;
  effective: number;
  maxAllowed: number;
  skipping: string | null;
  drop: string | null;
  drops: number;
}
interface Fx {
  ready(): Promise<void>;
  step(n?: number): void;
  time(): FxTime;
  stats(): { tick: number };
  exportSession(): { seed: number; autopilot: boolean };
  state(): {
    clock: { tClock: string; tClockS?: number | null; phase: string | null; holding: boolean };
    debrief: { outcome: string; decisions: { code?: string; detail: string; by: string }[] } | null;
  };
}
type FxWindow = { __fuelx?: Fx };

/** `countdown.safingDurationS` (src/data/countdown.ts) — e2e specs do not import app modules. */
const SAFING_S = 1_800;
/** `time.force1xAfterRecoveryS` (src/data/time.ts). */
const SETTLE_S = 30;
const TICK_HZ = 30;

const state = (page: Page) =>
  page.evaluate(() => {
    const fx = (window as unknown as FxWindow).__fuelx;
    if (!fx) throw new Error('no __fuelx');
    return fx.state();
  });
const time = (page: Page) =>
  page.evaluate(() => {
    const fx = (window as unknown as FxWindow).__fuelx;
    if (!fx) throw new Error('no __fuelx');
    return fx.time();
  });
const tick = (page: Page) => page.evaluate(() => (window as unknown as FxWindow).__fuelx?.stats().tick ?? -1);
const step = (page: Page, n: number) => page.evaluate((n) => (window as unknown as FxWindow).__fuelx?.step(n), n);

/** Paused stepping until the T-clock reaches `tS` (holds stop the clock; the autopilot releases them). */
async function stepToT(page: Page, tS: number): Promise<void> {
  for (let i = 0; i < 400; i++) {
    const s = await state(page);
    const now = s.clock.tClockS ?? -Infinity;
    if (now >= tS || s.debrief) return;
    await step(page, Math.min(60_000, Math.max(30, Math.round((tS - now) * TICK_HZ))));
  }
  throw new Error(`T-clock never reached ${tS} s`);
}

/** Paused stepping until the countdown phase is `phase`. */
async function stepToPhase(page: Page, phase: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if ((await state(page)).clock.phase === phase) return;
    await step(page, 30);
  }
  throw new Error(`phase ${phase} never reached`);
}

async function poll<T>(page: Page, read: () => Promise<T>, ok: (v: T) => boolean, timeoutMs = 120_000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = await read();
    if (ok(v)) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`poll timed out, last ${JSON.stringify(v)}`);
    await page.waitForTimeout(250);
  }
}

const rateRadio = (rate: Locator, name: 'Pause' | '1 times' | '10 times' | '100 times') =>
  rate.getByRole('radio', { name, exact: true });

test.describe('autopilot run', () => {
  test.describe.configure({ timeout: 600_000 });

  test('?autopilot=1 plays seed 42 to CATCH under the HUD time controls and the time rules', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/play.html?debug=1&lowfx=1&seed=42&autopilot=1');
    await page.waitForFunction(() => (window as unknown as FxWindow).__fuelx !== undefined);
    await page.evaluate(() => (window as unknown as FxWindow).__fuelx?.ready());
    const session = await page.evaluate(() => (window as unknown as FxWindow).__fuelx?.exportSession());
    expect(session?.autopilot).toBe(true);
    expect(session?.seed).toBe(42);

    // AC 27 widget inventory (GDD §10 keep / add), live on /play: top bar, flight card, tabbed panel (5 tabs),
    // countdown timeline with window markers, decision strip (D1 open at T-06:00:00), rate control + SKIP, map
    // controls, compass; the cut avatar is absent (role label only).
    const top = page.getByTestId('topbar');
    for (const id of ['site-switcher', 'topbar-utc', 'topbar-sim']) await expect(top.getByTestId(id)).toBeVisible();
    // Badges by their <output> text: the buttons have no content-derived accessible name (QA.md 7.4 defect list).
    await expect(top.getByRole('status').filter({ hasText: /^RANGE (GO|MARGINAL|NO-GO)/ })).toBeVisible();
    await expect(top.getByRole('status').filter({ hasText: /^\s*\d+ ALERTS?/ })).toBeVisible();
    await expect(top).toContainText('LAUNCH DIRECTOR');
    await expect(page.locator('[class*="avatar" i], img[alt*="avatar" i]')).toHaveCount(0);
    await expect(page.locator('[data-slot="flight"]')).toContainText('STATIONS GO');
    await expect(page.getByTestId('tabbed-panel').first().getByRole('tab')).toHaveCount(5);
    for (const id of ['countdown', 'phase-bar', 'playhead', 'window-marks', 'decision-strip'])
      await expect(page.getByTestId(id).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rotate right' })).toBeVisible();
    await expect(page.getByRole('img', { name: /^Heading/ })).toBeVisible();

    const rate = page.getByTestId('rate-control').first();
    const skip = rate.getByRole('button', { name: /^(Skip to|Cancel skip)/ });

    // Pause from the HUD; the director has already rolled out + ordered (tick 0).
    await rateRadio(rate, 'Pause').click();
    await poll(
      page,
      () => time(page),
      (t) => t.paused && t.effective === 0,
      10_000,
    );

    // Rate control outside any cap (Rollout, max 100×): 100× runs the sim, pause stops it.
    await rateRadio(rate, '100 times').click();
    let t = await time(page);
    expect([t.requested, t.maxAllowed, t.effective]).toEqual([100, 100, 100]);
    const t0 = await tick(page);
    await poll(
      page,
      () => tick(page),
      (n) => n > t0 + 300,
      60_000,
    );
    await rateRadio(rate, 'Pause').click();
    await poll(
      page,
      () => time(page),
      (x) => x.paused,
      10_000,
    );
    const tp = await tick(page);
    await page.waitForTimeout(1_500);
    expect(await tick(page)).toBe(tp);

    // SKIP (HUD button) to the load poll, 20 s of T-clock away, from paused: it stops on the mark, still paused.
    await stepToT(page, -4_820);
    await expect(skip).toHaveAccessibleName(/^Skip to .*LOAD POLL$/);
    await skip.click();
    t = await poll(
      page,
      () => time(page),
      (x) => x.skipping === null,
      120_000,
    );
    expect(t.paused).toBe(true);
    let s = await state(page);
    expect(s.clock.tClock).toBe('T−01:20:00');
    await step(page, 3); // poll opens, the director's GO lands
    s = await state(page);
    expect([s.clock.phase, s.clock.holding]).toEqual(['PropellantLoad', false]);

    // Terminal poll from 10× (PropellantLoad cap): the D2 hold drops the requested rate to 1× once (AC 23).
    await stepToT(page, -610);
    const drops = t.drops;
    await rateRadio(rate, '10 times').click();
    t = await poll(
      page,
      () => time(page),
      (x) => x.drops > drops,
      120_000,
    );
    expect([t.drop, t.requested]).toEqual(['DECISION_OPEN', 1]);
    // After a drop the player may raise the rate again, up to the cap.
    await rateRadio(rate, '10 times').click();
    t = await time(page);
    expect([t.requested, t.maxAllowed, t.drop]).toEqual([10, 10, null]);
    await rateRadio(rate, 'Pause').click();
    await step(page, 2);
    s = await state(page);
    expect(s.clock.tClockS).toBeGreaterThanOrEqual(-600); // GO given, counting again at 1×
    expect(s.clock.phase).toBe('TerminalCount');

    // Forced 1× window from T-00:03:00: 100× requested from the HUD is remembered but capped; SKIP / N refused.
    await stepToT(page, -185);
    await rateRadio(rate, '100 times').click();
    t = await poll(
      page,
      () => time(page),
      (x) => x.maxAllowed === 1,
      120_000,
    );
    expect([t.requested, t.effective]).toEqual([100, 1]);
    await expect(rate.getByTestId('rate-reason')).toContainText('1×');
    const w0 = Date.now();
    const k0 = await tick(page);
    await page.waitForTimeout(5_000);
    const k1 = await tick(page);
    const wallS = (Date.now() - w0) / 1000;
    expect(k1 - k0).toBeGreaterThan(0);
    expect(k1 - k0).toBeLessThanOrEqual(Math.ceil(wallS * TICK_HZ * 1.1) + TICK_HZ); // never above 1×
    await page.keyboard.press('n');
    await expect(skip).toHaveAttribute('aria-disabled', 'true');
    expect((await time(page)).skipping).toBeNull();
    await rateRadio(rate, 'Pause').click();
    await poll(
      page,
      () => time(page),
      (x) => x.paused,
      10_000,
    );

    // Final poll, liftoff, flight, catch: still 1× all the way (stepped, paused, for speed).
    for (const tS of [-30, 1, 300]) {
      await stepToT(page, tS);
      expect((await time(page)).maxAllowed).toBe(1);
    }
    await stepToPhase(page, 'Safing');
    expect((await time(page)).maxAllowed).toBe(1);
    await step(page, (SETTLE_S - 2) * TICK_HZ);
    expect((await time(page)).maxAllowed).toBe(1);
    await step(page, 3 * TICK_HZ);
    t = await time(page);
    expect(t.maxAllowed).toBe(100);
    expect(t.requested).toBe(100); // the player's last request, never raised by the game

    // SKIP to the Debrief for the last 20 s of safing.
    await step(page, (SAFING_S - SETTLE_S - 1 - 20) * TICK_HZ);
    await expect(skip).toHaveAccessibleName(/^Skip to .*DEBRIEF$/);
    await skip.click();
    await poll(
      page,
      () => state(page),
      (x) => x.debrief !== null,
      120_000,
    );
    t = await time(page);
    expect([t.skipping, t.effective, t.maxAllowed]).toEqual([null, 0, 0]); // RUN ENDED

    s = await state(page);
    expect(s.debrief?.outcome).toBe('CAUGHT');
    const log = s.debrief?.decisions ?? [];
    for (const code of ['D1', 'D2', 'D3B', 'D3']) expect(log.some((d) => d.code === code)).toBe(true);
    expect(log.filter((d) => d.code === 'D1')).toHaveLength(4);
    expect(log.filter((d) => d.code === 'D2')).toHaveLength(3);
    expect(log.find((d) => d.code === 'D3B')?.detail).toMatch(/HOLD/);
    expect(log.find((d) => d.code === 'D3')?.detail).toMatch(/^CATCH CALL · CATCH/);
    // AC 33: the director's calls read DIRECTOR, never PLAYER (only AUTO defaults besides).
    expect(log.some((d) => d.by === 'PLAYER')).toBe(false);
    expect(log.filter((d) => d.code === 'D1').every((d) => d.by === 'DIRECTOR')).toBe(true);
    const sheet = page.getByTestId('debrief');
    await expect(sheet).toHaveAttribute('data-outcome', 'CAUGHT');

    // AC 32 VIEW SITE: the sheet closes, the sim stays paused, the rate control reads RUN ENDED.
    await sheet.getByRole('button', { name: /VIEW SITE/ }).click();
    await expect(sheet).toBeHidden();
    t = await time(page);
    expect([t.paused, t.effective]).toEqual([true, 0]);
    await expect(rate).toContainText('RUN ENDED');
    await expect(rateRadio(rate, '1 times')).toHaveAttribute('aria-disabled', 'true');
    expect(errors).toEqual([]);
  });
});
