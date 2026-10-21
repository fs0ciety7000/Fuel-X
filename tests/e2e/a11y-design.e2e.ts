// 8.2 accessibility audit, /design gallery (DESIGN_SYSTEM §8, §9): axe-core finds nothing at both viewport sizes,
// the keyboard map section lists the game's keymap, every focusable shows the square ink ring, the more-contrast
// preference remaps the tertiary ink. Game-side audit: a11y-play.scene.e2e.ts.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// The gallery prints many specimens of the same landmark (top bars, countdown bands, inspectors) side by side,
// so landmark names repeat by design there; the game page (one of each) keeps the rule on.
const GALLERY_ONLY_DISABLED = ['landmark-unique'];

for (const vp of [
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
]) {
  test(`axe: no WCAG A/AA or best-practice violations on /design at ${vp.width}×${vp.height}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/design.html');
    await expect(page.getByTestId('gallery-keys')).toBeVisible();
    const r = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
      .disableRules(GALLERY_ONLY_DISABLED)
      .analyze();
    expect(r.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
  });
}

test('keyboard map section is generated from the game keymap', async ({ page }) => {
  await page.goto('/design.html');
  const table = page.getByTestId('gallery-keys').getByRole('table');
  for (const key of ['/', 'Esc', 'Enter', 'Space', ', / .', 'N', 'Shift+H', 'H', 'F', 'G', 'O', 'B', 'Alt+1…5'])
    await expect(table.getByRole('rowheader', { name: key, exact: true })).toBeVisible();
});

test('every focusable on the gallery draws the 2 px square focus ring', async ({ page }) => {
  await page.goto('/design.html');
  const missing: string[] = [];
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      if (!a || a === document.body) return null;
      const el = a.tagName === 'INPUT' ? (a.closest('form') ?? a) : a;
      const cs = getComputedStyle(el);
      return {
        ok: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 && cs.borderRadius === '0px',
        what: `${a.tagName} ${(a.getAttribute('aria-label') ?? a.textContent ?? '').trim().slice(0, 30)}`,
      };
    });
    if (r && !r.ok) missing.push(r.what);
  }
  expect(missing).toEqual([]);
});

test('prefers-contrast: more darkens tertiary ink and interior rules', async ({ browser }) => {
  const ctx = await browser.newContext({ contrast: 'more' });
  const page = await ctx.newPage();
  await page.goto('/design.html');
  const vars = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return [cs.getPropertyValue('--fx-color-ink-3').trim(), cs.getPropertyValue('--fx-color-ink-5').trim()];
  });
  expect(vars[0]?.toUpperCase()).toBe('#3D3D3A');
  expect(vars[1]?.toUpperCase()).toBe('#0A0A0A');
  await ctx.close();
});
