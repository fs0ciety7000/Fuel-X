// Save / load (ARCHITECTURE §10): format, canonical round trip, schema guard, migrations scaffold, frozen fixture.
import { describe, expect, it } from 'vitest';
import {
  STANDARD_AUTOPILOT,
  WORLD_SCHEMA,
  autopilotCommands,
  createSave,
  hashWorld,
  loadSave,
  migrateWorld,
  serializeWorld,
  step,
} from '../../src/sim/index';
import type { Migration } from '../../src/sim/index';
import { drive, runMvp } from '../harness';
import fixture from '../fixtures/saves/schema-1.json?raw';

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
    const before = serializeWorld(loaded.world);
    drive({ world: loaded.world, countdown: cd, ids: {} }, { maxTicks: 100 });
    expect(loaded.world.tick).toBe(540_100);
    expect(serializeWorld(loaded.world)).not.toBe(before);
  });
});
