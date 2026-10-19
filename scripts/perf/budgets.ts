// Static budget checks (ARCHITECTURE §13): bundle gzip sizes from dist/ and GLB payload from public/models/.
// Runtime checks (draw calls, triangles, points, frame times) live in the Playwright perf project
// (`tests/e2e/scenes.perf.ts`, `perf-audit` skill): `npm run perf -- --browser` runs it after the static rows.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const budget = JSON.parse(readFileSync(resolve(root, 'scripts/perf/budget.json'), 'utf8')) as {
  bundle: { initialJsGzipKB: number; cssGzipKB: number; fontsKB: number };
  assets: { totalGlbKB: number };
  showcase: { initialJsGzipKB: number; deferredJsGzipKB: number; glbKB: number; imagesKB: number };
};

const walk = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? walk(p) : [p];
      })
    : [];
const kb = (bytes: number): number => Math.round((bytes / 1024) * 10) / 10;
const gz = (files: string[]): number => kb(files.reduce((s, f) => s + gzipSync(readFileSync(f)).length, 0));

const distFile = (name: string): string => resolve(root, 'dist/assets', name);
/** Static chunk graph from a list of chunk names (follows `import … from "./x.js"`). */
function graph(entries: string[], seen = new Set<string>()): Set<string> {
  for (const name of entries) {
    if (seen.has(name)) continue;
    seen.add(name);
    const code = readFileSync(distFile(name), 'utf8');
    graph(
      [...code.matchAll(/(?:import|from)\s*["']\.\/([\w.-]+\.js)["']/g)].map((m) => m[1] as string),
      seen,
    );
  }
  return seen;
}
/** Chunks an HTML entry loads up front: its module scripts and modulepreloads, plus their static imports. */
function entryGraph(html: string): Set<string> {
  const page = readFileSync(resolve(root, 'dist', html), 'utf8');
  return graph([...page.matchAll(/(?:src|href)="[^"]*\/assets\/([\w.-]+\.js)"/g)].map((m) => m[1] as string));
}

type Row = [metric: string, budget: number, measured: number | null];
const rows: Row[] = [];

const distAssets = walk(resolve(root, 'dist/assets'));
if (distAssets.length === 0) {
  console.log('perf: dist/ not built — run `npm run build` for bundle budgets');
} else {
  // Initial JS = the game entry's chunk graph (play.html), resolved like the showcase rows below.
  rows.push(['initial JS gzip (KB)', budget.bundle.initialJsGzipKB, gz([...entryGraph('play.html')].map(distFile))]);
  rows.push(['CSS gzip (KB)', budget.bundle.cssGzipKB, gz(distAssets.filter((f) => f.endsWith('.css')))]);
  rows.push([
    'fonts (KB)',
    budget.bundle.fontsKB,
    kb(distAssets.filter((f) => f.endsWith('.woff2')).reduce((s, f) => s + statSync(f).size, 0)),
  ]);
}
// Showcase (ADR 0009): initial = scripts/modulepreloads in dist/index.html (+ their static imports); deferred =
// the lazy ShowcaseStage chunk graph minus what is already loaded.
if (distAssets.length > 0 && existsSync(resolve(root, 'dist/index.html'))) {
  const initial = entryGraph('index.html');
  const stage = distAssets.map((f) => f.split('/').pop() as string).filter((f) => /^ShowcaseStage-.*\.js$/.test(f));
  const deferred = [...graph(stage)].filter((f) => !initial.has(f));
  rows.push(['showcase initial JS gz', budget.showcase.initialJsGzipKB, gz([...initial].map(distFile))]);
  rows.push(['showcase 3D chunk gz', budget.showcase.deferredJsGzipKB, gz(deferred.map(distFile))]);
  const used = ['tower', 'pad', 'booster', 'ship', 'transporter', 'tanker', 'boat_range', 'tank_v', 'tank_sphere'];
  const glbBytes = used.reduce((sum, n) => sum + statSync(resolve(root, `public/models/${n}.glb`)).size, 0);
  rows.push(['showcase GLB (KB)', budget.showcase.glbKB, kb(glbBytes)]);
  const images = walk(resolve(root, 'public/showcase')).filter((f) => /\.(webp|png|svg)$/.test(f));
  rows.push([
    'showcase images (KB)',
    budget.showcase.imagesKB,
    kb(images.reduce((sum, f) => sum + statSync(f).size, 0)),
  ]);
}

const glbs = walk(resolve(root, 'public/models')).filter((f) => f.endsWith('.glb'));
rows.push(['GLB payload (KB)', budget.assets.totalGlbKB, kb(glbs.reduce((s, f) => s + statSync(f).size, 0))]);

let failed = false;
console.log('metric'.padEnd(24), 'budget'.padStart(8), 'measured'.padStart(10), ' status');
for (const [metric, limit, measured] of rows) {
  const ok = measured === null || measured <= limit;
  failed ||= !ok;
  console.log(metric.padEnd(24), String(limit).padStart(8), String(measured ?? '—').padStart(10), ok ? ' ok' : ' OVER');
}
if (process.argv.includes('--browser')) {
  // Reference scenes on the production build (the Playwright webServer builds + previews when :4173 is free).
  const r = spawnSync('npx', ['playwright', 'test', '--project', 'perf'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, FUELX_PERF: '1' },
  });
  failed ||= r.status !== 0;
}
process.exit(failed ? 1 : 0);
