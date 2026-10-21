// Gate 7 (docs/TASKS.md): the playable MVP as a frame sequence — seed 42 played from the HUD only (Tasks tab, decision
// strip; `step` stands in for the rate control), one 1280×720 frame per beat, with the loop rendering FX between
// steps. Frames go to test-results/gate7/; the committed GIF is assembled from them:
//   npx playwright test --project=visual gate7 && ffmpeg -framerate 0.5 -pattern_type glob -i 'test-results/gate7/*.png' \
//     -vf "scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=none" \
//     -loop 0 docs/screens/gate7-run.gif
// Asserts only that the run reaches a CAUGHT debrief without page errors.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

interface Fx {
  ready(): Promise<void>;
  seed(seed: number, opts?: { autopilot?: boolean }): Promise<void>;
  pause(): void;
  step(n?: number): void;
  follow(callSign: string | null, opts?: { snap?: boolean }): void;
  frames(n: number): Promise<void>;
  state(): {
    clock: { tClock: string; tClockS: number; phase: string | null };
    decision: { kind: string; options: { id: string; enabled: boolean }[] } | null;
    debrief: { outcome: string } | null;
  };
}
type FxWindow = { __fuelx?: Fx };

const DIR = 'test-results/gate7';
const PREFERRED = ['GO', 'HOLD_FIX', 'CATCH'];

const fx = <T>(page: Page, fn: (f: Fx, arg: unknown) => T | Promise<T>, arg?: unknown): Promise<T> =>
  page.evaluate(
    ([src, a]) => {
      const f = (window as unknown as FxWindow).__fuelx;
      if (!f) throw new Error('no __fuelx');
      return (new Function('fx', 'arg', `return (${src})(fx, arg)`) as (f: Fx, a: unknown) => T)(f, a);
    },
    [fn.toString(), arg] as const,
  );

test('gate 7 · seed 42 played from the HUD, one frame per beat', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/play.html?debug=1');
  await page.waitForFunction(() => (window as unknown as FxWindow).__fuelx !== undefined);
  // The dev readout is not part of the HUD a player sees.
  await page.addStyleTag({ content: '[data-testid="debug-readout"] { display: none !important; }' });
  await fx(page, async (f) => {
    await f.seed(42, { autopilot: false });
    f.pause();
    await f.ready();
  });

  let n = 0;
  const shot = async (name: string, follow?: string | null): Promise<void> => {
    if (follow !== undefined) await fx(page, (f, id) => f.follow(id as string | null, { snap: true }), follow);
    await fx(page, (f) => f.frames(4));
    await page.waitForTimeout(400);
    n++;
    await page.screenshot({ path: `${DIR}/${String(n).padStart(2, '0')}-${name}.png` });
  };
  const press = async (button: Locator): Promise<void> => {
    await button.click();
    await fx(page, (f) => f.step(2));
  };
  const state = () => fx(page, (f) => f.state());

  await page.getByRole('tab', { name: /TASKS/ }).click();
  const tasks = page.getByTestId('tabbed-panel');
  await shot('standby-d1');
  await press(tasks.getByRole('button', { name: 'START ROLLOUT' }));
  for (const name of ['LX STANDARD', 'LX STANDARD', 'LX STANDARD', 'MX STANDARD'])
    await press(tasks.getByRole('button', { name, exact: true }));
  await fx(page, (f) => f.step(30 * 60 * 20));
  await shot('rollout-SP41', 'SP-41');

  // Beats keyed by the first time a condition holds; each fires once.
  const beats: { name: string; when: (s: Awaited<ReturnType<typeof state>>) => boolean; follow?: string | null }[] = [
    { name: 'stack', when: (s) => s.clock.phase === 'Stack' && s.clock.tClockS > -4 * 3600, follow: 'TOWER-1' },
    { name: 'tankers-at-farm', when: (s) => s.clock.tClockS > -6600 && s.clock.tClockS < -6000, follow: 'LX-01' },
    { name: 'd2-load-poll', when: (s) => s.decision?.kind === 'POLL', follow: null },
    { name: 'd3b-leak', when: (s) => s.decision?.kind === 'LEAK', follow: 'OLM-1' },
    { name: 'final-poll', when: (s) => s.decision?.kind === 'POLL' && s.clock.tClockS > -60, follow: null },
    { name: 'liftoff', when: (s) => s.clock.tClockS >= 5 },
    { name: 'ascent', when: (s) => s.clock.tClockS >= 100, follow: 'B-09' },
    { name: 'd3-catch-call', when: (s) => s.decision?.kind === 'CATCH', follow: 'B-09' },
    { name: 'tower-catch', when: (s) => s.clock.phase === 'Safing', follow: 'B-09' },
  ];
  const fired = new Set<string>();
  const answered = new Set<string>();
  let stacked = false;
  for (let i = 0; i < 4000; i++) {
    const s = await state();
    if (s.debrief) break;
    for (const b of beats)
      if (!fired.has(b.name) && b.when(s)) {
        fired.add(b.name);
        await shot(b.name, b.follow);
      }
    if (!stacked && s.clock.phase === 'Stack') {
      await press(tasks.getByRole('button', { name: /^STACK/ }).first());
      stacked = true;
      continue;
    }
    const d = s.decision;
    if (d && d.kind !== 'PROP_MARGIN') {
      const pick = d.options.find((o) => o.enabled && PREFERRED.includes(o.id));
      const tag = `${d.kind}:${pick?.id}@${s.clock.tClock}`;
      if (pick && !answered.has(tag)) {
        answered.add(tag);
        await press(page.getByTestId(`option-${pick.id}`).getByRole('button'));
        continue;
      }
    }
    // Fine steps around liftoff and in flight so the beats land on their moment.
    const t = s.clock.tClockS;
    await fx(page, (f, k) => f.step(k as number), t > -120 && t < 900 ? 150 : 1800);
  }
  await shot('debrief', null);
  expect((await state()).debrief?.outcome).toBe('CAUGHT');
  expect(errors).toEqual([]);
});
