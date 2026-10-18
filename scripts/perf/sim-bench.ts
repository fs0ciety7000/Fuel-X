// Sim benchmarks for `npm run perf` (ARCHITECTURE §13.3, budgets in scripts/perf/budget.json). Plain timing
// harness (Vitest 5 replaced the `bench()` API):
//   mvp     — scenario `mvp`, seed 42, standard autopilot, every tick of the full run timed (mean / p95)
//   frame   — the same run in 50-step batches (one frame at 100×), p95 per batch
//   stress  — the MVP world at T-01:10:00 plus generated entities up to 2 000 (patrolling boats, crew vans,
//             idle tankers, extra farm tanks, buildings), 30 000 ticks timed
//   save    — size of an MVP save at Debrief
// Exits 1 when a measurement is over its budget.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STANDARD_AUTOPILOT,
  autopilotCommands,
  createMvpScenario,
  createSave,
  headingToQuat,
  spawnEntity,
  step,
} from '../../src/sim/index.ts';
import type { EntitySpec, Lc1PathId, World } from '../../src/sim/index.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const budget = JSON.parse(readFileSync(resolve(root, 'scripts/perf/budget.json'), 'utf8')) as {
  sim: {
    mvpTickMeanUs: number;
    mvpTickP95Us: number;
    stressTickMeanUs: number;
    frame100xP95Ms: number;
    saveKB: number;
  };
};

const percentile = (xs: Float64Array, q: number): number => {
  const s = Float64Array.from(xs).sort();
  return s[Math.min(s.length - 1, Math.floor(s.length * q))] ?? 0;
};
const mean = (xs: Float64Array): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

function tick(world: World, cdId: string): void {
  step(world, autopilotCommands(world, cdId, STANDARD_AUTOPILOT));
  world.outbox.length = 0;
}

/** Full MVP run, every tick timed. */
function benchMvp(): { meanUs: number; p95Us: number; ticks: number; saveKB: number } {
  const { world, countdown: cd } = createMvpScenario({ seed: 42 });
  world.outbox.length = 0;
  const samples: number[] = [];
  while (cd.phase.state !== 'Debrief') {
    const t0 = performance.now();
    tick(world, cd.id);
    samples.push((performance.now() - t0) * 1000);
  }
  const xs = Float64Array.from(samples);
  const saveKB = new TextEncoder().encode(createSave(world, { game: 'bench', createdAt: '' })).length / 1024;
  return { meanUs: mean(xs), p95Us: percentile(xs, 0.95), ticks: xs.length, saveKB };
}

/** The same run in 50-step frames (100× at 60 fps ≈ 50 steps per frame). */
function benchFrames(): { p95Ms: number; meanMs: number } {
  const { world, countdown: cd } = createMvpScenario({ seed: 42 });
  const frames: number[] = [];
  const done = (): boolean => cd.phase.state === 'Debrief';
  while (!done()) {
    const t0 = performance.now();
    for (let i = 0; i < 50 && !done(); i++) tick(world, cd.id);
    frames.push(performance.now() - t0);
  }
  const xs = Float64Array.from(frames);
  return { p95Ms: percentile(xs, 0.95), meanMs: mean(xs) };
}

const PATROLS: readonly Lc1PathId[] = ['pk03.patrol', 'pk04.patrol'];

/** Adds generated entities until the world holds `total`. */
function populate(world: World, total: number): void {
  const base = { siteId: 'LC-1' as const, rot: headingToQuat(0) };
  let i = 0;
  while (world.entities.order.length < total) {
    const k = i++ % 5;
    const n = String(100 + i);
    if (k === 0) {
      const pathId = PATROLS[i % 2] as Lc1PathId;
      spawnEntity(world, {
        ...base,
        kind: 'boat',
        callSign: `PK-${n}`,
        asset: 'boat_range',
        pos: { x: 3_000, y: 0, z: 0 },
        role: 'picket',
        fsm: { state: 'PATROL', enteredTick: world.tick },
        route: { pathId, movedTicks: (i * 97) % 2_000, speedMPerS: 5 },
        leg: null,
        targetId: null,
        escortEndTick: null,
      } satisfies EntitySpec<'boat'>);
    } else if (k === 1) {
      spawnEntity(world, {
        ...base,
        kind: 'van',
        callSign: `CV-${n}`,
        asset: 'van',
        pos: { x: -3_400, y: 0, z: 300 },
        fsm: { state: 'PARKED', enteredTick: world.tick },
        route: null,
      } satisfies EntitySpec<'van'>);
    } else if (k === 2) {
      spawnEntity(world, {
        ...base,
        kind: 'tanker',
        callSign: `LX-${n}`,
        asset: 'tanker',
        pos: { x: -6_000, y: 0, z: 60 },
        fluid: 'LOX',
        fsm: { state: 'OFFMAP', enteredTick: world.tick },
        capKg: 20_000,
        cargoKg: 0,
        chartered: true,
        order: null,
        route: null,
      } satisfies EntitySpec<'tanker'>);
    } else if (k === 3) {
      const fluid = i % 2 === 0 ? 'LOX' : 'CH4';
      const t = spawnEntity(world, {
        ...base,
        kind: 'tank',
        callSign: `${fluid}-${n}`,
        asset: 'tank_v',
        pos: { x: -500, y: 0, z: 400 },
        fluid,
        massKg: 1_000,
        capKg: 100_000,
        boiledOffKg: 0,
      } satisfies EntitySpec<'tank'>);
      world.logistics.farm[fluid].push(t.id);
    } else {
      spawnEntity(world, {
        ...base,
        kind: 'building',
        callSign: `HB-${n}`,
        asset: 'bldg_highbay',
        pos: { x: -1_400, y: 0, z: 600 },
      } satisfies EntitySpec<'building'>);
    }
  }
}

function benchStress(): { meanUs: number; p95Us: number; entities: number } {
  const { world, countdown: cd } = createMvpScenario({ seed: 42 });
  while (cd.tClockTicks < -70 * 60 * 30) tick(world, cd.id); // to T-01:10:00 (load running)
  populate(world, 2_000);
  const entities = world.entities.order.length;
  for (let i = 0; i < 1_000; i++) tick(world, cd.id); // warm-up
  const xs = new Float64Array(30_000);
  for (let i = 0; i < xs.length; i++) {
    const t0 = performance.now();
    tick(world, cd.id);
    xs[i] = (performance.now() - t0) * 1000;
  }
  return { meanUs: mean(xs), p95Us: percentile(xs, 0.95), entities };
}

type Row = [metric: string, budget: number, measured: number, unit: string];
const rows: Row[] = [];
const mvp = benchMvp();
rows.push([`MVP tick mean (${mvp.ticks} ticks)`, budget.sim.mvpTickMeanUs, mvp.meanUs, 'µs']);
rows.push(['MVP tick p95', budget.sim.mvpTickP95Us, mvp.p95Us, 'µs']);
const frames = benchFrames();
rows.push(['100× frame (50 steps) p95', budget.sim.frame100xP95Ms, frames.p95Ms, 'ms']);
const stress = benchStress();
rows.push([`stress tick mean (${stress.entities} entities)`, budget.sim.stressTickMeanUs, stress.meanUs, 'µs']);
rows.push(['MVP save at Debrief', budget.sim.saveKB, mvp.saveKB, 'KB']);

let failed = false;
console.log('sim metric'.padEnd(40), 'budget'.padStart(8), 'measured'.padStart(10), ' status');
for (const [metric, limit, measured, unit] of rows) {
  const ok = measured <= limit;
  failed ||= !ok;
  console.log(
    metric.padEnd(40),
    `${limit} ${unit}`.padStart(8),
    `${measured.toFixed(2)} ${unit}`.padStart(10),
    ok ? ' ok' : ' OVER',
  );
}
console.log(`(stress p95 ${stress.p95Us.toFixed(2)} µs, 100× frame mean ${frames.meanMs.toFixed(3)} ms)`);
process.exit(failed ? 1 : 0);
