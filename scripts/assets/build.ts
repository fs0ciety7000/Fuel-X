// Asset pipeline entry (ADR 0007): Blender → gltf-transform chain → contract check → codegen → preview.
// Usage: npm run asset -- <name> | npm run assets [-- --verify]
// Phase 2: discovers asset scripts only. The pipeline steps land in Phase 4.2 (docs/TASKS.md).
import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const assetsDir = resolve(root, 'blender/assets');
const args = process.argv.slice(2);
const all = args.includes('--all');
const names = args.filter((a) => !a.startsWith('--'));

const available = existsSync(assetsDir)
  ? readdirSync(assetsDir)
      .filter((f) => f.endsWith('.py'))
      .map((f) => f.slice(0, -3))
      .sort()
  : [];

const targets = all ? available : names;
if (!all && targets.length === 0) {
  console.error('usage: npm run asset -- <name>   (or npm run assets)');
  process.exit(2);
}
const unknown = targets.filter((n) => !available.includes(n));
if (unknown.length > 0) {
  console.error(`assets: no blender/assets/<name>.py for: ${unknown.join(', ')}`);
  process.exit(1);
}
if (targets.length === 0) {
  console.log('assets: no asset scripts yet (blender/assets/*.py) — nothing to build');
  process.exit(0);
}
console.error(`assets: pipeline not implemented yet (Phase 4.2); would build: ${targets.join(', ')}`);
process.exit(1);
