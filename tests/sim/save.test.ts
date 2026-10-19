// Save / load (ARCHITECTURE §10): format, canonical round trip, schema guard, migrations scaffold, frozen fixture.
import { describe, expect, it } from 'vitest';
import {
  CATCH_PROFILE,
  MIGRATIONS,
  STANDARD_AUTOPILOT,
  WORLD_SCHEMA,
  autopilotCommands,
  createSave,
  hashWorld,
  loadSave,
  migrateWorld,
  sampleProfile,
  seedStream,
  serializeWorld,
  step,
} from '../../src/sim/index';
import type { Migration } from '../../src/sim/index';
import { drive, runMvp } from '../harness';
import fixture from '../fixtures/saves/schema-1.json?raw';
import fixture2 from '../fixtures/saves/schema-2.json?raw';
import fixture3 from '../fixtures/saves/schema-3.json?raw';
import fixture4 from '../fixtures/saves/schema-4.json?raw';

const META = { game: '0.1.0', createdAt: '2026-10-18T12:00:00.000Z' };

describe('save format', () => {
  const run = runMvp({ seed: 5, maxTicks: 20_000 });

  it('is canonical JSON with the documented header', () => {
    const json = createSave(run.world, { ...META, commandLog: run.commands });
    const file = JSON.parse(json) as Record<string, unknown>;
    expect(Object.keys(file)).toEqual(['commandLog', 'createdAt', 'format', 'game', 'schema', 'world']);
    expect(file).toMatchObject({ format: 'fuelx-save', schema: WORLD_SCHEMA, ...META });
    expect(createSave(run.world, { ...META, commandLog: run.commands })).toBe(json); // byte-stable
  });

  it('round-trips: load gives the same world hash and command log; continuing ≡ not saving', () => {
    const json = createSave(run.world, { ...META, commandLog: run.commands });
    const loaded = loadSave(json);
    expect(loaded).toMatchObject({ ...META, fromSchema: WORLD_SCHEMA });
    expect(hashWorld(loaded.world)).toBe(hashWorld(run.world));
    expect(loaded.commandLog).toEqual(run.commands);
    const cd = loaded.world.countdowns.cd01;
    if (!cd) throw new Error('no countdown');
    for (let i = 0; i < 3_000; i++) {
      step(run.world, autopilotCommands(run.world, run.countdown.id, STANDARD_AUTOPILOT));
      step(loaded.world, autopilotCommands(loaded.world, cd.id, STANDARD_AUTOPILOT));
    }
    run.world.outbox.length = 0;
    loaded.world.outbox.length = 0;
    expect(hashWorld(loaded.world)).toBe(hashWorld(run.world));
    expect(loadSave(createSave(run.world, META)).commandLog).toEqual([]);
  });

  it('rejects junk, other formats and saves from a newer game', () => {
    expect(() => loadSave('{nope')).toThrow(/SAVE_NOT_JSON/);
    expect(() => loadSave('{"format":"other","schema":1}')).toThrow(/SAVE_BAD_FORMAT/);
    expect(() => loadSave('{"format":"fuelx-save","schema":1}')).toThrow(/SAVE_BAD_FORMAT/);
    const newer = JSON.parse(createSave(run.world, META)) as { schema: number; world: { schema: number } };
    newer.schema = WORLD_SCHEMA + 1;
    expect(() => loadSave(JSON.stringify(newer))).toThrow(/SAVE_FROM_NEWER_GAME/);
    const broken = JSON.parse(createSave(run.world, META)) as { world: Record<string, unknown> };
    delete broken.world.entities;
    expect(() => loadSave(JSON.stringify(broken))).toThrow(/WORLD_INVALID/);
  });

  it('MVP save at debrief stays under the 200 KB budget (ARCHITECTURE §13.3)', () => {
    const full = runMvp({ seed: 5 });
    const bytes = new TextEncoder().encode(createSave(full.world, { ...META, commandLog: full.commands })).length;
    expect(full.countdown.phase.state).toBe('Debrief');
    expect(bytes).toBeLessThan(200 * 1024);
  });
});

describe('migrations scaffold', () => {
  it('applies steps in order and stamps the schema', () => {
    const table: Record<number, Migration> = {
      0: (w) => ({ ...w, a: 1 }),
      1: (w) => ({ ...w, b: (w.a as number) + 1 }),
    };
    expect(migrateWorld({ schema: 0 }, 0, 2, table)).toEqual({ schema: 2, a: 1, b: 2 });
    expect(migrateWorld({ schema: 2 }, 2, 2, table)).toEqual({ schema: 2 });
    expect(() => migrateWorld({ schema: 0 }, 0, 3, table)).toThrow(/SAVE_MIGRATION_MISSING/);
  });

  it('an old save goes through the table on load', () => {
    const file = JSON.parse(fixture) as { schema: number; world: Record<string, unknown> };
    file.schema = 0;
    file.world.schema = 0;
    delete file.world.config;
    const loaded = loadSave(JSON.stringify(file), {
      ...MIGRATIONS,
      0: (w) => ({ ...w, config: { weather: 'SERIES', stations: 'LIVE', anomalies: true } }),
    });
    expect(loaded.fromSchema).toBe(0);
    expect(loaded.world.schema).toBe(WORLD_SCHEMA);
    expect(() => loadSave(JSON.stringify(file))).toThrow(/SAVE_MIGRATION_MISSING/);
  });
});

describe('fixture tests/fixtures/saves/schema-1.json (frozen)', () => {
  it('loads, validates and runs 100 ticks without error', () => {
    const loaded = loadSave(fixture);
    expect(loaded.fromSchema).toBe(1);
    expect(loaded.world.tick).toBe(540_000);
    const cd = loaded.world.countdowns.cd01;
    if (!cd) throw new Error('no countdown');
    expect(cd.hold?.reason).toBe('LEAK_FIX');
    // 1 → 2: ship stacked and loading → carriage at the ship pins (135 m), QD arm engaged, arms open.
    const tower = Object.values(loaded.world.entities.byId).find((e) => e.kind === 'tower');
    expect(tower).toMatchObject({ carriageM: 135, carriageTargetM: 135, qd: 'ENGAGED', interlock: 'NONE' });
    expect(tower?.kind === 'tower' && tower.qdArmRad).toBeCloseTo(Math.PI / 2, 12);
    const before = serializeWorld(loaded.world);
    drive({ world: loaded.world, countdown: cd, ids: {} }, { maxTicks: 100 });
    expect(loaded.world.tick).toBe(540_100);
    expect(serializeWorld(loaded.world)).not.toBe(before);
  });
});

describe('fixture tests/fixtures/saves/schema-2.json (frozen)', () => {
  it('2 → 3 puts the stacked stages on their asset-origin heights, then runs 100 ticks without error', () => {
    const old = JSON.parse(fixture2) as {
      world: { entities: { byId: Record<string, { kind: string; pos: { y: number } }> } };
    };
    const oldYs = Object.values(old.world.entities.byId)
      .filter((e) => e.kind === 'booster' || e.kind === 'ship')
      .map((e) => e.pos.y);
    expect(oldYs).toEqual([0, 71]); // schema 2: booster base on the ground under the mount
    const loaded = loadSave(fixture2);
    expect(loaded.fromSchema).toBe(2);
    expect(loaded.world.schema).toBe(WORLD_SCHEMA);
    const cd = loaded.world.countdowns.cd01;
    if (!cd) throw new Error('no countdown');
    const b = loaded.world.entities.byId[cd.boosterId];
    const ship = loaded.world.entities.byId[cd.shipId];
    expect(b?.pos.y).toBe(20); // PAD SOCKET_VehicleMount
    expect(ship?.pos.y).toBe(91); // + BOOSTER SOCKET_ShipMount
    const before = serializeWorld(loaded.world);
    drive({ world: loaded.world, countdown: cd, ids: {} }, { maxTicks: 100 });
    expect(loaded.world.tick).toBe(540_100);
    expect(serializeWorld(loaded.world)).not.toBe(before);
  });
});

describe('fixture tests/fixtures/saves/schema-3.json (frozen, in flight at T+40 s)', () => {
  it('3 → 4 adds the wind stream, wind direction and throttle, then runs 100 ticks without error', () => {
    const old = JSON.parse(fixture3) as { world: { rng: Record<string, unknown>; weather: Record<string, unknown> } };
    expect(old.world.rng.wind).toBeUndefined();
    expect(old.world.weather.windFromRad).toBeUndefined();
    const loaded = loadSave(fixture3);
    expect(loaded.fromSchema).toBe(3);
    expect(loaded.world.schema).toBe(WORLD_SCHEMA);
    const w = loaded.world;
    expect(w.rng.wind).toEqual(seedStream(w.seed, 'wind'));
    expect(w.weather.windFromRad).toBeCloseTo((210 * Math.PI) / 180, 12);
    expect(w.weather.windDirDevRad).toBe(0);
    const cd = w.countdowns.cd01;
    if (!cd) throw new Error('no countdown');
    const b = w.entities.byId[cd.boosterId];
    const ship = w.entities.byId[cd.shipId];
    if (b?.kind !== 'booster' || ship?.kind !== 'ship') throw new Error('no stages');
    expect(b.engines).toMatchObject({ lit: 33, throttle: 1 });
    expect(ship.engines).toMatchObject({ lit: 0, throttle: 0 });
    drive({ world: w, countdown: cd, ids: {} }, { maxTicks: 100 });
    expect(w.tick).toBe(649_302);
    // A save inside T+0–62 s snaps onto the eased liftoff curve on its next tick (schema 3 flew the straight segment).
    const f = b.flight;
    if (!f) throw new Error('no flight');
    expect(f.altitudeM).toBeCloseTo(sampleProfile(CATCH_PROFILE, f.profileTimeS).altitudeM, 6);
    expect(b.engines.throttle).toBe(1);
    expect(w.weather.windDirDevRad).not.toBe(0); // the series moved on
  });
});

describe('fixture tests/fixtures/saves/schema-4.json (frozen, A3 leak open and unanswered)', () => {
  it('4 → 5 adds the leak deadline (onset + decisionTimeoutS); unanswered past it → DEGRADED by AUTO', () => {
    const old = JSON.parse(fixture4) as { world: { anomalies: Record<string, { leak: Record<string, unknown> }> } };
    expect(old.world.anomalies.cd01?.leak).toEqual({ active: true, response: null, fixEndTick: null });
    const loaded = loadSave(fixture4);
    expect(loaded.fromSchema).toBe(4);
    expect(loaded.world.schema).toBe(WORLD_SCHEMA);
    const w = loaded.world;
    const cd = w.countdowns.cd01;
    if (!cd) throw new Error('no countdown');
    expect(w.tick).toBe(533_000);
    // A3 onset at tick 532 231 + 300 s × 30 Hz; the window closes later (783 000).
    expect(w.anomalies.cd01?.leak.deadlineTick).toBe(532_231 + 9_000);
    const events: string[] = [];
    drive(
      { world: w, countdown: cd, ids: {} },
      {
        autopilot: { ...STANDARD_AUTOPILOT, leakResponse: null },
        maxTicks: 9_000,
        each: (_w, ev) => {
          for (const e of ev) if (e.t === 'LeakResponded') events.push(`${e.tick} ${e.choice} ${e.by}`);
        },
      },
    );
    expect(events).toEqual(['541231 DEGRADED AUTO']);
    expect(w.decisions.cd01?.at(-1)).toMatchObject({ kind: 'LeakResponse', detail: 'DEGRADED', by: 'AUTO' });
  });
});
