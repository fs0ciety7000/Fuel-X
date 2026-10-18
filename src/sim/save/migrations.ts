// Save migrations (ARCHITECTURE §10): `migrations[n]` turns a schema-n world into a schema-(n+1) world. Applied in
// order on load. Every migration ships with a frozen fixture `tests/fixtures/saves/schema-<n>.json` and a test
// (load → migrate → validate → run 100 ticks). Schema 1 is the first shipped shape.
//   1 → 2 (5.0): tower carriage / arm / QD arm state (fixture `schema-1.json`).
import { lc1Layout, tower as td } from '@data/index';
import { CARRIAGE_STACK_BOOSTER_M, CARRIAGE_STACK_SHIP_M, carriageForBoosterM } from '../math/tower';

/** A world as parsed from JSON, before validation (shape of an older schema). */
export type RawWorld = Record<string, unknown>;
export type Migration = (world: RawWorld) => RawWorld;

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});
const state = (e: Raw): unknown => obj(e.fsm).state;

/** Schema 1 → 2: towers get their mechanism state, inferred from the stack / flight progress at save time. */
function addTowerMechanisms(world: RawWorld): RawWorld {
  const byId = obj(obj(world.entities).byId);
  const countdowns = obj(world.countdowns);
  const prep = obj(world.prep);
  for (const e of Object.values(byId).map(obj)) {
    if (e.kind !== 'tower') continue;
    let carriageM = td.carriage.restM;
    let qdEngaged = false;
    for (const [cdId, cdRaw] of Object.entries(countdowns)) {
      const cd = obj(cdRaw);
      if (obj(prep[cdId]).towerId !== e.id) continue;
      const ship = obj(byId[String(cd.shipId)]);
      const booster = obj(byId[String(cd.boosterId)]);
      const taskStage = obj(e.task).stageId;
      if (['STACKED', 'LOADING', 'LOADED', 'DETANKING'].includes(String(state(ship)))) qdEngaged = true;
      if (obj(cd.inputs).stackComplete === true || (taskStage !== undefined && taskStage === cd.shipId)) {
        carriageM = CARRIAGE_STACK_SHIP_M;
      } else if (taskStage !== undefined) carriageM = CARRIAGE_STACK_BOOSTER_M;
      if (['CATCH_READY', 'CATCHING'].includes(String(state(e))) || state(booster) === 'CAUGHT_SAFING') {
        carriageM = carriageForBoosterM(lc1Layout.points.catchPoint.y);
      }
    }
    const open = e.arms !== 'CLOSED';
    Object.assign(e, {
      carriageM,
      carriageTargetM: carriageM,
      armLRad: open ? td.arms.openRad : 0,
      armRRad: open ? -td.arms.openRad : 0,
      qd: qdEngaged ? 'ENGAGED' : 'STOWED',
      qdArmRad: qdEngaged ? td.qdArm.engagedRad : 0,
      interlock: 'NONE',
    });
  }
  return world;
}

export const MIGRATIONS: Readonly<Record<number, Migration>> = { 1: addTowerMechanisms };

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
