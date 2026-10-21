// 7.1 / AC 27: a full run played from the HUD only — START ROLLOUT, delivery orders and STACK in the Tasks tab, every
// D2 poll, the D3b leak and the D3 catch call in the decision strip. `__fuelx` only reads state and advances time
// (`step`, standing in for the player's rate control); no sim command goes through the console.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

interface Fx {
  ready(): Promise<void>;
  seed(seed: number, opts?: { autopilot?: boolean }): Promise<void>;
  pause(): void;
  step(n?: number): void;
  exportSession(): { autopilot: boolean };
  state(): {
    clock: { tClock: string; phase: string | null };
    decision: { kind: string; options: { id: string; enabled: boolean }[] } | null;
    debrief: { outcome: string; decisions: { code: string | null; detail: string; by: string }[] } | null;
  };
}
type FxWindow = { __fuelx?: Fx };

const state = (page: Page) =>
  page.evaluate(() => {
    const fx = (window as unknown as FxWindow).__fuelx;
    if (!fx) throw new Error('no __fuelx');
    return fx.state();
  });
const step = (page: Page, n: number) => page.evaluate((n) => (window as unknown as FxWindow).__fuelx?.step(n), n);

/** Click, then let two ticks apply the queued command (the run is paused between steps). */
async function press(page: Page, button: Locator): Promise<void> {
  await button.click();
  await step(page, 2);
}

// Player policy for the strip: GO at polls, fix the leak, catch.
const PREFERRED = ['GO', 'HOLD_FIX', 'CATCH'];

test.describe('hud run', () => {
  test.describe.configure({ timeout: 600_000 });

  test('/play starts with the player in control', async ({ page }) => {
    await page.goto('/play.html?debug=1&lowfx=1&seed=42');
    await page.waitForFunction(() => (window as unknown as FxWindow).__fuelx !== undefined);
    const autopilot = await page.evaluate(async () => {
      const fx = (window as unknown as FxWindow).__fuelx;
      if (!fx) throw new Error('no __fuelx');
      await fx.ready();
      return fx.exportSession().autopilot;
    });
    expect(autopilot).toBe(false);
  });

  test('every MVP decision is reachable from the HUD, run ends CAUGHT', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/play.html?debug=1&lowfx=1');
    await page.waitForFunction(() => (window as unknown as FxWindow).__fuelx !== undefined);
    await page.evaluate(async () => {
      const fx = (window as unknown as FxWindow).__fuelx;
      if (!fx) throw new Error('no __fuelx');
      await fx.seed(42, { autopilot: false });
      fx.pause();
      await fx.ready();
    });

    // Prepare (D1 + tasks) from the Tasks tab.
    await page.getByRole('tab', { name: /TASKS/ }).click();
    const tasks = page.getByTestId('tabbed-panel');
    await press(page, tasks.getByRole('button', { name: 'START ROLLOUT' }));
    for (const name of ['LX STANDARD', 'LX STANDARD', 'LX STANDARD', 'MX STANDARD'])
      await press(page, tasks.getByRole('button', { name, exact: true }));

    const answered = new Set<string>();
    let stacked = false;
    for (let i = 0; i < 1000; i++) {
      const s = await state(page);
      if (s.debrief) break;
      if (!stacked && s.clock.phase === 'Stack') {
        await press(page, tasks.getByRole('button', { name: /^STACK/ }).first());
        stacked = true;
        continue;
      }
      const d = s.decision;
      if (d && d.kind !== 'PROP_MARGIN') {
        const pick = d.options.find((o) => o.enabled && PREFERRED.includes(o.id));
        const tag = `${d.kind}:${pick?.id}@${s.clock.tClock}`;
        if (pick && !answered.has(tag)) {
          answered.add(tag);
          await press(page, page.getByTestId(`option-${pick.id}`).getByRole('button'));
          continue;
        }
      }
      await step(page, 1800); // one sim minute
    }

    const s = await state(page);
    expect(stacked).toBe(true);
    expect(s.debrief?.outcome).toBe('CAUGHT');
    const log = s.debrief?.decisions ?? [];
    for (const code of ['D1', 'D2', 'D3B', 'D3']) expect(log.some((d) => d.code === code)).toBe(true);
    expect(log.every((d) => d.by === 'PLAYER')).toBe(true);
    expect(log.find((d) => d.code === 'D3')?.detail).toMatch(/^CATCH CALL · CATCH/);
    expect(errors).toEqual([]);
  });
});
