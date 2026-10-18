import { expect, test } from '@playwright/test';

test('game entry boots on the paper substrate', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'FUEL-X' })).toBeVisible();
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(244, 244, 240)');
  expect(errors).toEqual([]);
});

test('design gallery lists every color token', async ({ page }) => {
  await page.goto('/design.html');
  await expect(page.getByRole('heading', { name: 'TOKENS' })).toBeVisible();
  await expect(page.getByText('accentText', { exact: true })).toBeVisible();
});
