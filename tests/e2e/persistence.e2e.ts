// 8.3 (ARCHITECTURE §10): IndexedDB autosave → reload → RESUME RUN · CONTINUE lands on the same tick and world;
// SAVE · LOAD (Ctrl+S) export → import round trip of a `.fuelx.json.gz`, and a clear error for a bad file.
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

interface Fx {
  pause(): void;
  step(n?: number): void;
  jumpTo(target: string): Promise<void>;
  seed(seed: number, opts?: { autopilot?: boolean }): Promise<void>;
  save(): string;
  time(): { paused: boolean };
  autosaves(): Promise<{ reason: string; detail?: string; tick: number; seed: number }[]>;
  autosaveJson(): Promise<string | null>;
}
type FxWindow = { __fuelx?: Fx };

const PLAY = '/play.html?debug=1&lowfx=1&seed=42';

/** Boot done (the fresh run is released once the resume lookup found nothing). */
async function bootFresh(page: Page): Promise<void> {
  await page.goto(PLAY);
  await page.waitForFunction(() => {
    const fx = (window as unknown as FxWindow).__fuelx;
    return fx !== undefined && !fx.time().paused;
  });
}

const world = (json: string): unknown => (JSON.parse(json) as { world: unknown }).world;

const current = (page: Page) =>
  page.evaluate(() => {
    const fx = (window as unknown as FxWindow).__fuelx;
    if (!fx) throw new Error('no __fuelx');
    return { save: fx.save(), paused: fx.time().paused };
  });

test('milestone autosave → reload → CONTINUE resumes the same tick and world', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await bootFresh(page);
  // First milestone (STANDARD ORDER LAST CALL) is at T-04:45:00: land a second before, play through it.
  const saved = await page.evaluate(async () => {
    const fx = (window as unknown as FxWindow).__fuelx;
    if (!fx) throw new Error('no __fuelx');
    fx.pause();
    await fx.jumpTo('T-04:45:01');
    fx.step(60);
    return { list: await fx.autosaves(), json: await fx.autosaveJson() };
  });
  expect(saved.list[0]).toMatchObject({ reason: 'milestone', detail: 'STANDARD_ORDER_LAST_CALL', seed: 42 });
  expect(saved.json).not.toBeNull();

  await page.reload();
  const dialog = page.getByRole('dialog', { name: 'RESUME RUN' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('42');
  await expect(dialog).toContainText('T-04:44:59');
  await expect(dialog).toContainText('MILESTONE STANDARD ORDER LAST CALL');
  await expect(dialog.getByRole('button', { name: /CONTINUE/ })).toBeFocused();
  await dialog.getByRole('button', { name: /CONTINUE/ }).click();
  await expect(dialog).toBeHidden();

  const now = await current(page);
  expect(now.paused).toBe(true);
  expect(world(now.save)).toEqual(world(saved.json ?? '{}'));
  expect(new URL(page.url()).searchParams.get('seed')).toBe('42');
  expect(errors).toEqual([]);
});

test('SAVE · LOAD: export .fuelx.json.gz → import restores it; a bad file is refused with a reason', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await bootFresh(page);
  await page.evaluate(async () => {
    const fx = (window as unknown as FxWindow).__fuelx;
    if (!fx) throw new Error('no __fuelx');
    fx.pause();
    await fx.jumpTo('T-04:00:00');
  });

  await page.keyboard.press('Control+s');
  const sheet = page.getByRole('dialog', { name: 'SAVE · LOAD' });
  await expect(sheet).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    sheet.getByRole('button', { name: /EXPORT SAVE/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^fuelx-save-seed42-t\d+\.fuelx\.json\.gz$/);
  const gz = readFileSync(await download.path());
  const exported = gunzipSync(gz).toString('utf8');
  await expect(page.getByTestId('persistence-status')).toContainText('EXPORTED');

  // Move away: another seed, so the import has something to replace.
  await page.evaluate(async () => {
    const fx = (window as unknown as FxWindow).__fuelx;
    if (!fx) throw new Error('no __fuelx');
    await fx.seed(7, { autopilot: false });
    fx.pause();
  });
  expect(world((await current(page)).save)).not.toEqual(world(exported));

  const input = page.getByTestId('save-import-input');
  await input.setInputFiles({ name: 'broken.fuelx.json.gz', mimeType: 'application/gzip', buffer: gz.subarray(0, 40) });
  await expect(page.getByTestId('persistence-status')).toContainText('CORRUPT SAVE');
  const newer = exported.replace(/"schema":(\d+),"world"/, '"schema":99,"world"');
  await input.setInputFiles({ name: 'future.fuelx.json', mimeType: 'application/json', buffer: Buffer.from(newer) });
  await expect(page.getByTestId('persistence-status')).toContainText('SAVE FROM A NEWER VERSION · SCHEMA 99');

  await input.setInputFiles({ name: download.suggestedFilename(), mimeType: 'application/gzip', buffer: gz });
  await expect(page.getByTestId('persistence-status')).toContainText('LOADED · SEED 42 · T-04:00:00');
  const now = await current(page);
  expect(now.paused).toBe(true);
  expect(world(now.save)).toEqual(world(exported));
  const list = await page.evaluate(() => (window as unknown as FxWindow).__fuelx?.autosaves());
  expect(list?.[0]).toMatchObject({ reason: 'import', seed: 42 });
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  expect(errors).toEqual([]);
});
