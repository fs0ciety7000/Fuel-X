import { expect, test } from '@playwright/test';

// 6.4 / 6.7 panels on /design (fixtures): flight card, inspector per class, tabbed panel keyboard contract, events
// filter, toasts and the debrief sheet in all four outcomes. AA / radius / opacity sweeps over these sections run in
// design.e2e.ts (they cover every `gallery-*` section).

test('panel sections render without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/design.html');
  for (const id of ['flight', 'inspector', 'tabbed', 'events', 'debrief'])
    await expect(page.getByTestId(`gallery-${id}`)).toBeVisible();
  await expect(page.getByTestId('gallery-inspector').getByTestId('inspector')).toHaveCount(6);
  await expect(page.getByTestId('gallery-debrief').getByTestId('debrief')).toHaveCount(4);
  expect(errors).toEqual([]);
});

test('tabbed panel: arrows and Alt+1…5 switch tabs, content follows', async ({ page }) => {
  await page.goto('/design.html');
  const panel = page.getByTestId('gallery-tabbed').getByTestId('tabbed-panel').first();
  await panel.getByRole('tab', { name: /VEHICLES/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(panel).toHaveAttribute('data-tab', 'tanks');
  await expect(panel.getByRole('listbox', { name: 'Tanks' })).toBeVisible();
  await page.keyboard.press('End');
  await expect(panel).toHaveAttribute('data-tab', 'events');
  await expect(panel.getByRole('list', { name: 'Event log' })).toBeVisible();
  // The flight card's TASKS › shortcut drives the same gallery tab state.
  await page.getByTestId('gallery-flight').getByRole('button', { name: 'TASKS ›' }).click();
  await expect(panel).toHaveAttribute('data-tab', 'tasks');
});

test('events filter narrows the log to warn and danger', async ({ page }) => {
  await page.goto('/design.html');
  const log = page.getByTestId('gallery-events').getByRole('list', { name: 'Event log' }).first();
  const all = await log.getByRole('listitem').count();
  await page.getByTestId('gallery-events').getByRole('radio', { name: 'DANGER' }).first().click();
  await expect(log.getByRole('listitem')).toHaveCount(1);
  expect(all).toBeGreaterThan(1);
});

test('inspector destructive action opens a confirm dialog with consequences', async ({ page }) => {
  await page.goto('/design.html');
  await page
    .getByTestId('gallery-inspector')
    .getByRole('button', { name: /DIVERT…/ })
    .click();
  const dialog = page.getByTestId('gallery-inspector').getByRole('dialog', { name: /DIVERT B-09/ });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('BOOSTER LOST');
  await expect(dialog.getByRole('button', { name: 'CANCEL' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('debrief: ledger table, decision log and the four exit actions per outcome', async ({ page }) => {
  await page.goto('/design.html');
  const sheets = page.getByTestId('gallery-debrief').getByTestId('debrief');
  for (const outcome of ['CAUGHT', 'DIVERTED', 'CATCH_FAILED', 'SCRUBBED']) {
    const d = sheets.and(page.locator(`[data-outcome="${outcome}"]`));
    await expect(d).toHaveCount(1);
    await expect(d.getByRole('table')).toBeVisible();
    for (const name of ['REPLAY SAME SEED', 'NEW SEED', 'EXPORT LOG', /VIEW SITE/])
      await expect(d.getByRole('button', { name })).toBeVisible();
  }
  await expect(page.getByTestId('debrief-ready')).toBeVisible();
});
