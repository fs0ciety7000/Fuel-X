// Save migrations (ARCHITECTURE §10): `migrations[n]` turns a schema-n world into a schema-(n+1) world. Applied in
// order on load. Every migration ships with a frozen fixture `tests/fixtures/saves/schema-<n>.json` and a test
// (load → migrate → validate → run 100 ticks). Schema 1 is the first shipped shape.
//   1 → 2 (5.0): tower carriage / arm / QD arm state (fixture `schema-1.json`).
//   2 → 3 (5.0b): stage positions = asset origins (mount 20 m, cargo deck +4.6 m), flight attitude `tiltRad`, ship
//                separation start (fixture `schema-2.json`).
//   3 → 4 (5.10): rng stream 'wind', weather wind direction (`windFromRad`, `windDirDevRad`), `engines.throttle`
//                (fixture `schema-3.json`, saved in flight at T+40 s).
//   4 → 5 (6.8): A3 leak decision deadline `anomalies[cd].leak.deadlineTick` (fixture `schema-4.json`: seed 42,
//                standard autopilot without a leak answer, saved at tick 533 000 with the A3 leak open, unanswered).
//   5 → 6 (7.3): transporter `role` ('prep' | 'ambient', SP-42's duty loop) (fixture `schema-5.json`: seed 42, standard
//                autopilot, saved at tick 540 000 under the A3 LEAK_FIX hold, SP-42 IDLE in its bay).
import { anomalies as an, flightProfile as fp, lc1Layout, siteGeometry as geo, tower as td } from '@data/index';
import { seedStream } from '../core/rng';
import { secondsToTicks } from '../core/time';
import { WIND_FROM_MEAN_RAD } from '../core/world';
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

/** Stage states with the stage on the launch mount (booster) or on the booster (ship). */
const ON_STACK = ['STACKED', 'LOADING', 'LOADED', 'DETANKING'];

/**
 * Schema 2 → 3: stages on SP-41 rise to the cargo socket, stacked stages to the mount / booster top (stages in the arms
 * are re-lifted on the next tick); flights get `tiltRad` 0 (the attitude program steers from there) and the ship
 * its separation start (the schema-2 ship flew from the booster's hot-staging keyframe).
 */
function addMountHeightsAndAttitude(world: RawWorld): RawWorld {
  const byId = obj(obj(world.entities).byId);
  const pad = lc1Layout.points.olm1;
  const sep = fp.booster.find((k) => k.event === 'HOT_STAGING');
  for (const e of Object.values(byId).map(obj)) {
    if (e.kind !== 'booster' && e.kind !== 'ship') continue;
    const pos = obj(e.pos);
    const s = String(state(e));
    if (s === 'ON_TRANSPORTER') pos.y = Number(pos.y) + geo.transporter.cargoM;
    else if (ON_STACK.includes(s)) {
      pos.y = pad.y + geo.pad.vehicleMountM + (e.kind === 'ship' ? geo.booster.shipMountM : 0);
    }
    if (e.flight && typeof e.flight === 'object') {
      const f = obj(e.flight);
      f.tiltRad = 0;
      if (e.kind === 'ship') {
        const separated = Number(f.profileTimeS) > 0;
        f.sepAltitudeM = separated ? (sep?.altitudeM ?? 0) : 0;
        f.sepDownrangeM = separated ? (sep?.downrangeM ?? 0) : 0;
      }
    }
  }
  return world;
}

/**
 * Schema 3 → 4: the 'wind' rng stream is seeded from the world seed (as `createWorld` does), the wind direction starts
 * on its mean (deviation 0; the series moves on from there), lit stages get throttle 1 (the flight system rewrites the
 * booster's from its schedule on the next tick), unlit ones 0. A save made inside T+0–62 s keeps its profile time, so
 * the booster snaps from the old straight LIFTOFF → MAX_Q segment onto the eased liftoff on its next tick (cosmetic,
 * up to ≈ 2.4 km lower; keyframe events and timings are unchanged).
 */
function addWindDirectionAndThrottle(world: RawWorld): RawWorld {
  const rngs = obj(world.rng);
  if (!Array.isArray(rngs.wind)) rngs.wind = seedStream(Number(world.seed), 'wind');
  world.rng = rngs;
  const w = obj(world.weather);
  w.windFromRad = WIND_FROM_MEAN_RAD;
  w.windDirDevRad = 0;
  world.weather = w;
  for (const e of Object.values(obj(obj(world.entities).byId)).map(obj)) {
    if (e.kind !== 'booster' && e.kind !== 'ship') continue;
    const engines = obj(e.engines);
    engines.throttle = Number(engines.lit) > 0 ? 1 : 0;
  }
  return world;
}

/**
 * Schema 4 → 5: every leak state gets `deadlineTick`. A leak that started gets min(A3 onset tick + decisionTimeoutS,
 * window close), the rule `startLeak` applies from schema 5 on (an unanswered leak past it is committed DEGRADED by
 * AUTO on the next tick); one that never started gets null.
 */
function addLeakDeadline(world: RawWorld): RawWorld {
  const countdowns = obj(world.countdowns);
  for (const [cdId, stRaw] of Object.entries(obj(world.anomalies))) {
    const st = obj(stRaw);
    const leak = obj(st.leak);
    const fired = Array.isArray(st.fired) ? st.fired.map(obj) : [];
    const onset = fired.find((f) => f.anomaly === 'A3');
    const close = Number(obj(countdowns[cdId]).windowCloseTick);
    leak.deadlineTick =
      onset === undefined ? null : Math.min(Number(onset.tick) + secondsToTicks(an.A3.decisionTimeoutS), close);
    st.leak = leak;
  }
  return world;
}

/**
 * Schema 5 → 6: every transporter gets its `role` from the layout (`lc1Layout.ambientDuty` call-signs → 'ambient',
 * others 'prep'). A schema-5 SP-42 was always IDLE in its bay with no route, so it simply starts its duty loop on the
 * next tick (or stays parked if the road is closed).
 */
function addTransporterRole(world: RawWorld): RawWorld {
  for (const e of Object.values(obj(obj(world.entities).byId)).map(obj)) {
    if (e.kind !== 'transporter') continue;
    e.role = lc1Layout.ambientDuty[String(e.callSign)] ? 'ambient' : 'prep';
  }
  return world;
}

export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: addTowerMechanisms,
  2: addMountHeightsAndAttitude,
  3: addWindDirectionAndThrottle,
  4: addLeakDeadline,
  5: addTransporterRole,
};

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
