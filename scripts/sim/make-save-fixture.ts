// Writes the frozen save fixture for the current world schema (ARCHITECTURE §10):
// tests/fixtures/saves/schema-<WORLD_SCHEMA>.json = scenario mvp, seed 42, standard autopilot, saved at sim tick
// 540 000 (T-clock T-01:04:19 under the A3 LEAK_FIX hold: leak, hold, load and range state all populated).
// Refuses to overwrite: a fixture is the contract a later migration must keep loading.
// Usage (once per schema bump, before changing the World shape): npx tsx scripts/sim/make-save-fixture.ts
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORLD_SCHEMA, createSave } from '../../src/sim/index.ts';
import { runMvp } from '../../tests/harness.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = resolve(root, `tests/fixtures/saves/schema-${WORLD_SCHEMA}.json`);
if (existsSync(out)) {
  console.error(`${out} exists — fixtures are frozen; bump WORLD_SCHEMA and add a migration instead`);
  process.exit(1);
}
const run = runMvp({ seed: 42, maxTicks: 540_000 });
writeFileSync(
  out,
  `${createSave(run.world, { game: '0.1.0', createdAt: '2026-10-18T00:00:00.000Z', commandLog: run.commands })}\n`,
);
console.log(`wrote ${out} (tick ${run.world.tick})`);
