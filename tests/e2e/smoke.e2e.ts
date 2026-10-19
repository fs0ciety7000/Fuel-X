import { expect, test } from '@playwright/test';

test('game entry boots the scene on the paper substrate', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByTestId('debug-readout')).toContainText('LC-1');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(244, 244, 240)');
  // Debug hooks are off in production builds without ?debug=1.
  expect(await page.evaluate(() => '__fuelx' in window)).toBe(false);
  expect(errors).toEqual([]);
});

test('design gallery lists every color token', async ({ page }) => {
  await page.goto('/design.html');
  await expect(page.getByRole('heading', { name: 'TOKENS' })).toBeVisible();
  await expect(page.getByText('accentText', { exact: true })).toBeVisible();
});
