// Build-time prerender of the showcase (ADR 0009). Runs after `vite build` (client, dist/) and
// `vite build --ssr src/showcase.server.tsx --outDir build/ssr`: renders the page to HTML and injects it, plus font
// preloads, into dist/index.html. The client entry then hydrates instead of rendering from an empty root.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const base = process.env.VITE_BASE ?? '/';
const indexPath = resolve(root, 'dist/index.html');

const { render } = (await import(pathToFileURL(resolve(root, 'build/ssr/showcase.server.js')).href)) as {
  render: () => string;
};
const html = render();
if (!html.includes('You never fly the rocket')) throw new Error('prerender: hero copy missing from the render');

// Preload the fonts the first viewport paints with (macro 900 + micro 400/700), so the LCP text does not swap late.
const fonts = readdirSync(resolve(root, 'dist/assets')).filter((f) =>
  /^(inter-tight-latin-900|jetbrains-mono-latin-(400|700))-normal-.*\.woff2$/.test(f),
);
if (fonts.length !== 3) throw new Error(`prerender: expected 3 preload fonts, found ${fonts.join(', ')}`);
const head = fonts
  .map((f) => `<link rel="preload" href="${base}assets/${f}" as="font" type="font/woff2" crossorigin />`)
  .join('\n    ');

const page = readFileSync(indexPath, 'utf8');
for (const marker of ['<!--showcase:html-->', '<!--showcase:head-->']) {
  if (!page.includes(marker)) throw new Error(`prerender: ${marker} missing from dist/index.html`);
}
writeFileSync(indexPath, page.replace('<!--showcase:head-->', head).replace('<!--showcase:html-->', html));
console.log(`prerender: dist/index.html (${Math.round(html.length / 1024)} KB markup, ${fonts.length} font preloads)`);
