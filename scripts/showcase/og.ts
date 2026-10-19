// Open Graph / Twitter card plate (1200×630) for the showcase: a token-styled composition around the Blender stack
// render, screenshotted with the preinstalled Chromium. Output: public/showcase/og.png (committed, referenced by
// index.html). Run: `npx tsx scripts/showcase/og.ts`.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { tokens } from '../../src/tokens/tokens';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const b64 = (p: string): string => readFileSync(resolve(root, p)).toString('base64');
const c = tokens.color;

const html = `<!doctype html><html><head><style>
@font-face { font-family: Macro; src: url(data:font/woff2;base64,${b64('node_modules/@fontsource/inter-tight/files/inter-tight-latin-900-normal.woff2')}); }
@font-face { font-family: Micro; font-weight: 500; src: url(data:font/woff2;base64,${b64('node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2')}); }
@font-face { font-family: Micro; font-weight: 700; src: url(data:font/woff2;base64,${b64('node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2')}); }
* { margin: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; background: ${c.paper}; color: ${c.ink}; font-family: Micro; text-transform: uppercase; overflow: hidden; }
.frame { position: absolute; inset: 0; display: grid; grid-template-columns: 620px 1fr; border: 2px solid ${c.ink}; }
.copy { display: grid; align-content: space-between; padding: 40px; }
.kicker { font-size: 18px; font-weight: 500; letter-spacing: 0.08em; color: ${c.ink3}; }
h1 { font-family: Macro; white-space: nowrap; font-size: 168px; line-height: 0.8; letter-spacing: -0.065em; margin-left: -8px; }
.line { font-size: 26px; font-weight: 700; letter-spacing: 0.04em; line-height: 1.3; max-width: 520px; }
.never { display: inline-block; margin-top: 18px; padding: 4px 10px; background: ${c.ink}; color: ${c.paper}; font-size: 20px; font-weight: 700; letter-spacing: 0.06em; }
.cta { display: flex; justify-content: space-between; width: 340px; padding: 14px 18px; background: ${c.accent}; border: 1px solid ${c.ink}; font-size: 20px; font-weight: 700; letter-spacing: 0.08em; }
.art { position: relative; overflow: hidden; border-left: 1px solid ${c.ink}; background: ${c.paper}; }
.art img { position: absolute; inset: -30px -40px -10px -40px; width: 640px; height: 640px; object-fit: cover; }
.tag { position: absolute; top: 24px; right: 24px; padding: 6px 10px; border: 1px solid ${c.ink}; background: ${c.paper}; font-size: 16px; font-weight: 700; letter-spacing: 0.08em; }
.hazard { position: absolute; left: 0; right: 0; bottom: 0; height: 18px; background: repeating-linear-gradient(-45deg, ${c.accent} 0 8px, ${c.ink} 8px 16px); }
</style></head><body><div class="frame">
<div class="copy"><p class="kicker">[ Calder Orbital · Brackwater LC-1 ]</p>
<div><h1>FUEL-X</h1></div>
<div><p class="line">A live rocket launch site you can play like a strategy game.</p><p class="never">You never fly the rocket.</p></div>
<p class="cta"><span>Open the pad</span><span>&gt;&gt;&gt;</span></p></div>
<div class="art"><img src="data:image/png;base64,${b64('docs/assets/_stack.png')}"><p class="tag">T-00:00:04</p><div class="hazard"></div></div>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: resolve(root, 'public/showcase/og.png') });
await browser.close();
console.log('og: public/showcase/og.png');
