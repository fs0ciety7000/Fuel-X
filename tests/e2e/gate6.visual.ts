// Gate 6 (docs/TASKS.md): full-HUD screenshots at the visual-check standard states + /design, written to
// docs/screens/gate6-*.png with FUELX_SCREENS=1 (else test-results/, so `npm run e2e` leaves docs untouched):
// `FUELX_SCREENS=1 npx playwright test --project=visual gate6`.
// Not a baseline — the run only asserts that every state is reached without page errors.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

interface Fx {
  ready(): Promise<void>;
  seed(seed: number, opts?: { autopilot?: boolean }): Promise<void>;
  jumpTo(target: string | { phase: string }): Promise<void>;
  pause(): void;
  follow(callSign: string | null, opts?: { snap?: boolean }): void;
  camera(preset: 'home' | 'frame', opts?: { snap?: boolean }): void;
  catchDecision(choice: 'CATCH' | 'DIVERT', booster?: string): void;
  freezeVisuals(on: boolean): void;
  frames(n: number): Promise<void>;
  state(): { clock: { tClock: string; phase: string | null } };
}
type FxWindow = { __fuelx?: Fx };
const SCREENS_DIR = process.env.FUELX_SCREENS === '1' ? 'docs/screens' : 'test-results';

// One scripted step per state: [file name, autopilot, script run against window.__fuelx].
const STATES: [string, boolean, string][] = [
  ['terminal-count@T-00-00-04', true, `await fx.jumpTo('T-00:00:04'); fx.follow(null, { snap: true });`],
  ['ascent-follow-B09@T+00-01-45', true, `await fx.jumpTo('T+00:01:45'); fx.follow('B-09', { snap: true });`],
  ['catch-decision@T+00-03-00', true, `await fx.jumpTo('T+00:03:00'); fx.follow('B-09', { snap: true });`],
  ['tower-catch@T+00-06-55', true, `await fx.jumpTo('T+00:06:55'); fx.follow('B-09', { snap: true });`],
  [
    'recovery-RV1@T+00-06-45',
    true,
    `await fx.jumpTo('T+00:02:50'); fx.catchDecision('DIVERT'); await fx.jumpTo('T+00:06:45');
     fx.follow('RV-1', { snap: true });`,
  ],
  ['debrief', true, `await fx.jumpTo({ phase: 'Debrief' }); fx.follow(null, { snap: true });`],
];

async function boot(page: Page, errors: string[], autopilot: boolean): Promise<void> {
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/play.html?debug=1');
  await page.waitForFunction(() => (window as unknown as FxWindow).__fuelx !== undefined);
  await page.evaluate(async (autopilot) => {
    const fx = (window as unknown as FxWindow).__fuelx;
    if (!fx) throw new Error('no __fuelx');
    await fx.seed(42, { autopilot });
    fx.pause();
    await fx.ready();
  }, autopilot);
}

test.describe('gate 6', () => {
  test.describe.configure({ timeout: 300_000 });

  // Full page is ~19 k px tall: kept in test-results/; the committed /design screens are docs/screens/phase6-design-*.
  test('/design gallery', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/design.html');
    await page.screenshot({ path: 'test-results/gate6-design.png', fullPage: true });
    expect(errors).toEqual([]);
  });

  for (const [name, autopilot, script] of STATES) {
    for (const vp of [
      { w: 1920, h: 1080, tag: '' },
      { w: 1280, h: 720, tag: '-1280' },
    ]) {
      test(`${name}${vp.tag}`, async ({ page }) => {
        const errors: string[] = [];
        await page.setViewportSize({ width: vp.w, height: vp.h });
        await boot(page, errors, autopilot);
        const clock = await page.evaluate(async (script) => {
          const fx = (window as unknown as FxWindow).__fuelx;
          if (!fx) throw new Error('no __fuelx');
          await (new Function('fx', `return (async () => { ${script} })()`) as (f: Fx) => Promise<void>)(fx);
          fx.freezeVisuals(true);
          await fx.frames(4);
          return fx.state().clock;
        }, script);
        // Let the 10 Hz projection and React settle on the paused state.
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${SCREENS_DIR}/gate6-${name}${vp.tag}.png` });
        console.log(name, vp.tag || '1920', clock.tClock, clock.phase);
        expect(errors).toEqual([]);
      });
    }
  }
});
