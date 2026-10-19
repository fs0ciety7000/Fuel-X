import { expect, test } from '@playwright/test';

// /design gallery (DESIGN_SYSTEM §9, task 6.2): every primitive section renders from fixtures, keyboard paths work,
// and the computed colors respect the AA pairs of §2.2.
const SECTIONS = [
  'states',
  'glyphs',
  'value',
  'panel',
  'metric',
  'progress',
  'chip',
  'badge',
  'list',
  'tabs',
  'button',
  'rate',
  'tag',
  'deadline',
  'band',
  'overlay',
  'toast',
  'dialog',
];

test('design gallery shows every component section without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/design.html');
  await expect(page.getByRole('heading', { name: 'COMPONENTS' })).toBeVisible();
  for (const id of SECTIONS) await expect(page.getByTestId(`gallery-${id}`)).toBeVisible();
  expect(errors).toEqual([]);
});

test('tabs and rate control follow the arrow-key contract', async ({ page }) => {
  await page.goto('/design.html');
  const tabs = page.getByRole('tablist', { name: 'Panels' });
  await tabs.getByRole('tab', { name: 'VEHICLES' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: /TANKS/ })).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.getByRole('tab', { name: /TANKS/ })).toBeFocused();

  const rate = page.getByTestId('gallery-rate').getByRole('radiogroup').first();
  await rate.getByRole('radio', { name: '1 times' }).click();
  await expect(rate.getByRole('radio', { name: '1 times' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowRight');
  // 10× is the cap in this fixture: selectable (request remembered), running rate shown.
  await expect(rate.getByRole('radio', { name: '10 times' })).toHaveAttribute('aria-checked', 'true');
});

test('modal dialog opens, focuses CANCEL and closes on Escape', async ({ page }) => {
  await page.goto('/design.html');
  await page.getByRole('button', { name: /SCRUB…/ }).click();
  const dialog = page.getByRole('dialog', { name: /SCRUB LC-1 FLIGHT 7/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'CANCEL' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('no radius, shadow or translucency on rendered primitives; orange text only as accent-text', async ({ page }) => {
  await page.goto('/design.html');
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    const accent = 'rgb(255, 90, 31)';
    for (const el of document.querySelectorAll<HTMLElement>('[data-testid^="gallery-"] *')) {
      const cs = getComputedStyle(el);
      if (cs.borderRadius !== '0px' && cs.borderRadius !== '') out.push(`radius ${el.className}`);
      if (cs.boxShadow !== 'none') out.push(`shadow ${el.className}`);
      if (cs.opacity !== '1') out.push(`opacity ${el.className}`);
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim());
      if (own && cs.color === accent) out.push(`accent text ${el.className}: ${el.textContent}`);
    }
    return out;
  });
  expect(bad).toEqual([]);
});

test('every text on the gallery meets WCAG AA against its opaque background (disabled exempt)', async ({ page }) => {
  await page.goto('/design.html');
  const failures = await page.evaluate(() => {
    const parse = (c: string): [number, number, number] | null => {
      const m = c.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/);
      if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return null;
      return [Number(m[1]), Number(m[2]), Number(m[3])];
    };
    const lum = ([r, g, b]: [number, number, number]): number => {
      const f = (v: number): number => {
        const x = v / 255;
        return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const bgOf = (el: Element | null): [number, number, number] => {
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c) return c;
      }
      return [244, 244, 240];
    };
    const out: string[] = [];
    const root = document.querySelectorAll<HTMLElement>('[data-testid^="gallery-"] *');
    for (const el of root) {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim());
      if (!own || el.closest('[aria-disabled="true"], [data-state="disabled"], [hidden]')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || el.getClientRects().length === 0) continue;
      const fg = parse(cs.color);
      if (!fg) continue;
      const l1 = lum(fg);
      const l2 = lum(bgOf(el));
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) out.push(`${ratio.toFixed(2)} ${cs.color} "${el.textContent?.slice(0, 30)}"`);
    }
    return out;
  });
  expect(failures).toEqual([]);
});
