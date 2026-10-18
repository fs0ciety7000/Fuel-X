// Static budget checks (ARCHITECTURE §13): bundle gzip sizes from dist/ and GLB payload from public/models/.
// Runtime checks (fps, draw calls) live in the Playwright perf project (`perf-audit` skill).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const budget = JSON.parse(readFileSync(resolve(root, 'scripts/perf/budget.json'), 'utf8')) as {
  bundle: { initialJsGzipKB: number; cssGzipKB: number; fontsKB: number };
  assets: { totalGlbKB: number };
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

type Row = [metric: string, budget: number, measured: number | null];
const rows: Row[] = [];

const distAssets = walk(resolve(root, 'dist/assets'));
if (distAssets.length === 0) {
  console.log('perf: dist/ not built — run `npm run build` for bundle budgets');
} else {
  // Initial JS = the game entry chunk graph; the design gallery chunk is excluded.
  const js = distAssets.filter((f) => f.endsWith('.js') && !/design/i.test(f));
  rows.push(['initial JS gzip (KB)', budget.bundle.initialJsGzipKB, gz(js)]);
  rows.push(['CSS gzip (KB)', budget.bundle.cssGzipKB, gz(distAssets.filter((f) => f.endsWith('.css')))]);
  rows.push([
    'fonts (KB)',
    budget.bundle.fontsKB,
    kb(distAssets.filter((f) => f.endsWith('.woff2')).reduce((s, f) => s + statSync(f).size, 0)),
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
process.exit(failed ? 1 : 0);
