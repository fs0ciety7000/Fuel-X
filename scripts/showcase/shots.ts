// Showcase screenshots for the `showcase-check` skill: run against `npm run preview` (port 4173).
// Output: test-results/showcase/*.png. Usage: npx tsx scripts/showcase/shots.ts [--only desktop|phone|reduced]
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import type { Page } from '@playwright/test';

const BASE = process.env.SHOWCASE_URL ?? 'http://localhost:4173/';
const OUT = 'test-results/showcase';
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : undefined;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function stageReady(page: Page): Promise<void> {
  await page.waitForSelector('[data-stage-ready="true"]', { timeout: 90_000 }).catch(() => {
    console.log('shots: stage not ready (fallback still shown)');
  });
}

/** Scroll so the story is at progress p (same geometry as the driver: sheet container vs viewport middle). */
async function storyAt(page: Page, p: number): Promise<void> {
  await page.evaluate((target) => {
    const el = document.getElementById('dossier');
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + target * el.offsetHeight - window.innerHeight / 2, behavior: 'instant' });
  }, p);
  await page.waitForTimeout(1_800);
}

async function sections(page: Page, prefix: string): Promise<void> {
  for (const [name, selector] of [
    ['calls', 'section:has(#calls-anchor), main > section:nth-of-type(1)'],
    ['hardware', 'main > section:nth-of-type(2)'],
    ['sites', 'main > section:nth-of-type(3)'],
    ['built', 'main > section:nth-of-type(4)'],
    ['band', 'main > section:nth-of-type(5)'],
  ] as const) {
    const loc = page.locator(selector).first();
    await loc.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${prefix}-${name}.png` });
  }
  await page.locator('footer').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/${prefix}-footer.png` });
}

if (!only || only === 'desktop') {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE);
  await page.screenshot({ path: `${OUT}/desktop-first-paint.png` });
  await stageReady(page);
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: `${OUT}/desktop-hero.png` });
  const anchors = [0.08, 0.25, 0.31, 0.45, 0.53, 0.75, 0.79, 0.95];
  for (const [i, p] of anchors.entries()) {
    await storyAt(page, p);
    await page.screenshot({ path: `${OUT}/story-${String(i + 1).padStart(2, '0')}-p${p}.png` });
  }
  await sections(page, 'desktop');
  await page.close();
}

if (!only || only === 'phone') {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(BASE);
  await stageReady(page);
  await page.screenshot({ path: `${OUT}/phone-hero.png` });
  await storyAt(page, 0.53);
  await page.screenshot({ path: `${OUT}/phone-story.png` });
  await sections(page, 'phone');
  await page.close();
}

if (!only || only === 'reduced') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(BASE);
  await stageReady(page);
  await storyAt(page, 0.79);
  await page.screenshot({ path: `${OUT}/reduced-motion.png` });
  await context.close();
}

await browser.close();
console.log(`shots: written to ${OUT}/`);
