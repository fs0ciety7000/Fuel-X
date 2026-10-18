// Save migrations (ARCHITECTURE §10): `migrations[n]` turns a schema-n world into a schema-(n+1) world. Applied in
// order on load. Every migration ships with a frozen fixture `tests/fixtures/saves/schema-<n>.json` and a test
// (load → migrate → validate → run 100 ticks). Schema 1 is the first shipped shape, so the table is empty.

/** A world as parsed from JSON, before validation (shape of an older schema). */
export type RawWorld = Record<string, unknown>;
export type Migration = (world: RawWorld) => RawWorld;

export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

/**
 * Migrates `world` from `fromSchema` up to `toSchema` with `table` (default: the shipped migrations). Throws
 * `SAVE_MIGRATION_MISSING` when a step is not in the table.
 */
export function migrateWorld(
  world: RawWorld,
  fromSchema: number,
  toSchema: number,
  table: Readonly<Record<number, Migration>> = MIGRATIONS,
): RawWorld {
  let w = world;
  for (let n = fromSchema; n < toSchema; n++) {
    const step = table[n];
    if (!step) throw new Error(`SAVE_MIGRATION_MISSING: no migration from schema ${n} to ${n + 1}`);
    w = step(w);
    w.schema = n + 1;
  }
  return w;
}
