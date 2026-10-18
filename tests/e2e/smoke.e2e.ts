import { expect, test } from '@playwright/test';

test('showcase is the public entry', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Fuel-X' })).toBeVisible();
  await expect(page.getByText('Developed by CM Interactive. A division of Cardor Media.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open the pad' })).toHaveAttribute('href', './play.html');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(244, 244, 240)');
  expect(errors).toEqual([]);
});

test('pad shell stays on play.html', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/play.html');
  await expect(page.getByRole('heading', { name: 'FUEL-X' })).toBeVisible();
  await expect(page.getByText('SIM OFFLINE')).toBeVisible();
  expect(errors).toEqual([]);
});

test('design gallery lists every color token', async ({ page }) => {
  await page.goto('/design.html');
  await expect(page.getByRole('heading', { name: 'TOKENS' })).toBeVisible();
  await expect(page.getByText('accentText', { exact: true })).toBeVisible();
});
