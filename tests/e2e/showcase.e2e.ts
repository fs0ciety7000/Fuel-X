import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Showcase site (docs/SHOWCASE.md, ADR 0009): prerendered structure, links, SEO, story driver, phone, reduced motion.

async function scrollStory(page: Page, p: number): Promise<void> {
  await page.evaluate((target) => {
    const el = document.getElementById('dossier');
    if (!el) throw new Error('#dossier missing');
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + target * el.offsetHeight - window.innerHeight / 2, behavior: 'instant' });
  }, p);
}

test('serves prerendered HTML with SEO and social tags', async ({ request }) => {
  const res = await request.get('/');
  expect(res.status()).toBe(200);
  const html = await res.text();
  // The hero, the dossier and the credit are in the HTML before any script runs.
  expect(html).toContain('You never fly the rocket.');
  expect(html).toContain('Developed by CM Interactive. A division of Cardor Media.');
  expect(html).toMatch(/<h1[^>]*>Fuel-X<\/h1>/);
  expect(html).toContain('<link rel="canonical" href="https://fuelx.fs0ciety.org/"');
  expect(html).toContain('property="og:image" content="https://fuelx.fs0ciety.org/showcase/og.png"');
  expect(html).toContain('"@type": "VideoGame"');
  expect(html).toMatch(/rel="preload" href="\/assets\/inter-tight-latin-900-normal-[^"]+\.woff2"/);
  for (const path of ['/showcase/og.png', '/robots.txt', '/sitemap.xml', '/showcase/plates/_stack.webp']) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
});

test('hydrates without errors and links the game at /play', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Fuel-X' })).toBeVisible();
  const ctas = page.getByRole('link', { name: /Open the pad/ });
  await expect(ctas).toHaveCount(3);
  for (const cta of await ctas.all()) await expect(cta).toHaveAttribute('href', '/play');
  await expect(page.getByRole('img', { name: 'CM Interactive' })).toBeAttached();
  await expect(page.getByRole('img', { name: 'Cardor Media' })).toBeAttached();
  await expect(page.locator('[data-stage-ready="true"]')).toBeAttached({ timeout: 90_000 });
  expect(errors).toEqual([]);
});

test('the story clock, phase bar and sheets follow the scroll', async ({ page }) => {
  await page.goto('/');
  const clock = page.getByRole('banner').getByLabel('Mission clock');
  await expect(clock).toHaveText('T-06:00:00');
  await scrollStory(page, 0.55);
  await expect(clock).toHaveText(/^T\+00:0[01]:\d\d$/);
  await expect(page.getByRole('navigation', { name: 'Launch phases' }).locator('[aria-current="true"]')).toHaveText(
    'Liftoff',
  );
  await expect(page.locator('article[data-active="true"] h3')).toHaveText('Fly');
  await scrollStory(page, 0.95);
  await expect(page.locator('article[data-active="true"] h3')).toHaveText('Turn around');
});

test('tabs, filters and the site selector work from the keyboard', async ({ page }) => {
  await page.goto('/');
  const tab = page.getByRole('tab', { name: /Propellant margin/ });
  await tab.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('tab', { name: /Go \/ No-Go/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel').first()).toContainText('Hold for the weather');

  await page.getByRole('button', { name: 'Fleet', exact: true }).click();
  await expect(page.locator('figcaption')).toHaveCount(2);

  const site = page.getByRole('tab', { name: /Cobble Reach/ });
  await site.click();
  await expect(page.getByRole('tabpanel').last()).toContainText('Cobble Reach');
});

test('the game answers at /play and /play.html', async ({ page }) => {
  for (const path of ['/play', '/play.html']) {
    await page.goto(path);
    await expect(page).toHaveTitle('Fuel-X — Pad');
  }
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('has no horizontal overflow and keeps the CTA in the top bar', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole('banner').getByRole('link', { name: /Open the pad/ })).toBeVisible();
  });
});

test.describe('reduced motion', () => {
  test('freezes the flight card clock and keeps the chapter stills', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('[data-reduced="true"]')).toBeAttached();
    const card = page.getByRole('region', { name: 'Next launch' }).locator('output');
    const before = await card.textContent();
    await page.waitForTimeout(2_200);
    await expect(card).toHaveText(before ?? '');
  });
});
