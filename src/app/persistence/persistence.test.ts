// 8.3 persistence (ARCHITECTURE §10): autosave ring + triggers, boot resume offer, export / import round trip and
// error texts. Storage is the in-memory adapter behind the `SaveStore` interface (no fake-indexeddb dependency); the
// IndexedDB adapter itself is covered by tests/e2e/persistence.e2e.ts.
import { createStore } from 'zustand/vanilla';
import { initialPersistenceState } from '@bridge/persistence';
import type { PersistenceState } from '@bridge/persistence';
import { WORLD_SCHEMA, hashWorld, loadSave } from '@sim/index';
import type { SimEvent } from '@sim/types';
import { describe, expect, it } from 'vitest';
import fixture5 from '../../../tests/fixtures/saves/schema-5.json?raw';
import { EventBus } from '../bus';
import { parseJumpTarget } from '../jump';
import { InlineSimHost } from '../sim-host/inline';
import {
  MemorySaveStore,
  PersistenceController,
  decodeSaveBytes,
  gzipText,
  isGzip,
  latestAutosave,
  persistenceErrorText,
  wallLabel,
} from './index';
import type { SaveStore } from './index';

function must<T>(v: T | null | undefined): T {
  if (v === null || v === undefined) throw new Error('missing');
  return v;
}

const NOW = '2026-10-21T14:22:09.000Z';

function rig(opts: { store?: SaveStore; storeP?: Promise<SaveStore>; ring?: number } = {}) {
  const host = new InlineSimHost(() => 0);
  const bus = new EventBus();
  const store = opts.store ?? new MemorySaveStore();
  let hidden: (() => void) | null = null;
  const files: { name: string; bytes: Uint8Array; mime: string }[] = [];
  const shown: number[] = [];
  const st = { paused: false, loads: 0 };
  const state = createStore<PersistenceState>(() => initialPersistenceState());
  const ctl = new PersistenceController({
    host,
    bus,
    store: opts.storeP ?? Promise.resolve(store),
    env: {
      nowIso: () => NOW,
      onHidden: (fn) => {
        hidden = fn;
        return () => (hidden = null);
      },
      download: (name, bytes, mime) => files.push({ name, bytes, mime }),
      showSeed: (s) => shown.push(s),
    },
    setPaused: (on) => (st.paused = on),
    afterLoad: () => st.loads++,
    state,
    ...(opts.ring ? { ring: opts.ring } : {}),
  });
  const newRun = async (seed: number, autopilot = false): Promise<void> => {
    await host.newGame({ seed, autopilot });
    ctl.onNewRun();
  };
  /** n ticks through the frame path (events reach the bus, like GameLoop). */
  const play = (n: number): void => {
    host.advance({ maxSteps: n, budgetMs: Number.POSITIVE_INFINITY });
    bus.dispatch(host.drainEvents());
  };
  const hide = async (): Promise<void> => {
    hidden?.();
    await ctl.idle();
  };
  const tick = (): number => host.inspect().world.tick;
  const hash = (): string => hashWorld(host.inspect().world);
  return { host, bus, store, ctl, state, st, files, shown, newRun, play, hide, tick, hash };
}

const toMilestone = async (r: ReturnType<typeof rig>): Promise<void> => {
  // first milestone (STANDARD_ORDER_LAST_CALL) is at T-04:45:00; land 1 s before it, then play through it
  await r.host.jump(parseJumpTarget('T-04:45:01'));
  r.play(60);
  await r.ctl.idle();
};

describe('autosave triggers and ring', () => {
  it('autosaves on Milestone with the run metadata; the body loads to the same world', async () => {
    const r = rig();
    await r.newRun(42);
    await toMilestone(r);
    const list = await r.store.list();
    expect(list).toHaveLength(1);
    const rec = must(list[0]);
    expect(rec).toMatchObject({
      key: 'auto-0',
      seq: 0,
      reason: 'milestone',
      detail: 'STANDARD_ORDER_LAST_CALL',
      seed: 42,
      tick: r.tick(),
      finished: false,
      autopilot: false,
      schema: WORLD_SCHEMA,
      savedAt: NOW,
    });
    expect(hashWorld(loadSave(rec.json).world)).toBe(r.hash());
    expect(r.state.getState().lastAutosave).toMatch(/^T-04:44:59 · 2026-10-21 14:22 UTC · MILESTONE STANDARD ORDER/);
  });

  it('autosaves on visibilitychange → hidden, once per tick', async () => {
    const r = rig();
    await r.newRun(7);
    r.play(10);
    await r.hide();
    await r.hide();
    expect(await r.store.list()).toHaveLength(1);
    r.play(1);
    await r.hide();
    const list = await r.ctl.autosaves();
    expect(list.map((m) => [m.reason, m.tick])).toEqual([
      ['hidden', 11],
      ['hidden', 10],
    ]);
  });

  it('autosaves when the run enters Debrief', async () => {
    const r = rig();
    await r.newRun(3);
    r.bus.dispatch([{ t: 'PhaseChanged', tick: 0, countdownId: 'cd01', from: 'Safing', to: 'Debrief' } as SimEvent]);
    await r.ctl.idle();
    expect((await r.ctl.autosaves())[0]?.reason).toBe('debrief');
  });

  it('keeps the last N in a ring; the write counter survives a reload', async () => {
    const store = new MemorySaveStore();
    const r = rig({ store, ring: 3 });
    await r.newRun(9);
    for (let i = 0; i < 5; i++) {
      r.play(1);
      await r.hide();
    }
    const list = await store.list();
    expect(list.map((x) => x.key).sort()).toEqual(['auto-0', 'auto-1', 'auto-2']);
    expect(list.map((x) => x.seq).sort()).toEqual([2, 3, 4]);
    expect(latestAutosave(list)?.tick).toBe(5);
    const again = rig({ store, ring: 3 });
    await again.newRun(9);
    again.play(1);
    await again.hide();
    expect(latestAutosave(await store.list())).toMatchObject({ seq: 5, key: 'auto-2' });
  });

  it('does not autosave autopilot (demo) runs', async () => {
    const r = rig();
    await r.newRun(42, true);
    r.play(5);
    await r.hide();
    expect(await r.store.list()).toEqual([]);
  });

  it('turns autosave off when storage cannot open (export still works)', async () => {
    const r = rig({ storeP: Promise.reject(new Error('IDB_UNAVAILABLE')) });
    await r.newRun(1);
    await r.ctl.boot({ urlSeed: null, autopilot: false, start: () => r.newRun(1) });
    expect(r.state.getState()).toMatchObject({ autosaveOff: 'STORAGE UNAVAILABLE', offer: null });
    expect(r.st.paused).toBe(false);
    expect(await r.ctl.autosave('manual')).toBeNull();
    expect(await r.ctl.exportSave()).toMatch(/\.fuelx\.json\.gz$/);
  });
});

/** A store holding one unfinished autosave of seed 42 at a milestone, plus the run that wrote it. */
async function savedRun() {
  const a = rig();
  await a.newRun(42);
  await toMilestone(a);
  return a;
}

describe('boot: resume offer', () => {
  it('offers CONTINUE; continue reproduces the saved tick and world, paused; then runs ≡ the original', async () => {
    const a = await savedRun();
    const rec = must(latestAutosave(await a.store.list()));
    const b = rig({ store: a.store });
    await b.ctl.boot({ urlSeed: null, autopilot: false, start: () => b.newRun(777) });
    expect(b.st.paused).toBe(true);
    expect(b.state.getState().offer).toEqual({
      seed: '42',
      tClock: 'T-04:44:59',
      phase: 'STANDBY',
      savedAt: '2026-10-21 14:22 UTC',
      reason: 'MILESTONE STANDARD ORDER LAST CALL',
    });
    // no autosave of the held fresh run while the question is open
    await b.hide();
    expect(await b.store.list()).toHaveLength(1);

    expect(await b.ctl.continueRun()).toBe(true);
    expect(b.tick()).toBe(rec.tick);
    expect(b.hash()).toBe(a.hash());
    expect(b.host.inspect().seed).toBe(42);
    expect(b.st).toMatchObject({ paused: true, loads: 1 });
    expect(b.shown).toEqual([42]);
    expect(b.state.getState().offer).toBeNull();
    // continuing is not a new autosave at the same tick
    await b.hide();
    expect(await b.store.list()).toHaveLength(1);

    a.play(3_000);
    b.play(3_000);
    expect(b.hash()).toBe(a.hash());
  });

  it('NEW RUN keeps the fresh world at tick 0 and releases the hold; the autosave stays', async () => {
    const a = await savedRun();
    const b = rig({ store: a.store });
    await b.ctl.boot({ urlSeed: null, autopilot: false, start: () => b.newRun(777) });
    b.ctl.handlers.newRun();
    expect(b.st.paused).toBe(false);
    expect(b.state.getState().offer).toBeNull();
    expect(b.host.inspect()).toMatchObject({ seed: 777 });
    expect(b.tick()).toBe(0);
    expect(await a.store.list()).toHaveLength(1);
  });

  it('a URL seed starts a new run unless it is the autosaved seed; ?autopilot=1 never offers', async () => {
    const a = await savedRun();
    const other = rig({ store: a.store });
    await other.ctl.boot({ urlSeed: 5, autopilot: false, start: () => other.newRun(5) });
    expect(other.state.getState().offer).toBeNull();
    expect(other.st.paused).toBe(false);

    const same = rig({ store: a.store });
    await same.ctl.boot({ urlSeed: 42, autopilot: false, start: () => same.newRun(42) });
    expect(same.state.getState().offer?.seed).toBe('42');

    const demo = rig({ store: a.store });
    await demo.ctl.boot({ urlSeed: null, autopilot: true, start: () => demo.newRun(1, true) });
    expect(demo.state.getState()).toMatchObject({ offer: null, autosaveOff: 'DEMO RUN (AUTOPILOT)' });
    expect(demo.st.paused).toBe(false);
  });

  it('a finished run (Debrief) is not offered', async () => {
    const a = rig();
    await a.newRun(42);
    await a.host.jump({ phase: 'Debrief' });
    await a.hide();
    expect((await a.ctl.autosaves())[0]).toMatchObject({ finished: true, phase: 'Debrief' });
    const b = rig({ store: a.store });
    await b.ctl.boot({ urlSeed: null, autopilot: false, start: () => b.newRun(8) });
    expect(b.state.getState().offer).toBeNull();
  });

  it('a run started while the lookup is pending supersedes the offer', async () => {
    const a = await savedRun();
    let open!: (s: SaveStore) => void;
    const b = rig({ storeP: new Promise<SaveStore>((res) => (open = res)) });
    const boot = b.ctl.boot({ urlSeed: null, autopilot: false, start: () => b.newRun(777) });
    await Promise.resolve();
    await b.newRun(5); // e.g. __fuelx.seed() from a test
    expect(b.st.paused).toBe(false);
    open(a.store);
    await boot;
    expect(b.state.getState().offer).toBeNull();
    expect(b.host.inspect().seed).toBe(5);
  });
});

describe('export / import', () => {
  it('round-trips through .fuelx.json.gz; the import is autosaved', async () => {
    const a = await savedRun();
    a.play(100);
    const name = await a.ctl.exportSave();
    expect(name).toBe(`fuelx-save-seed42-t${a.tick()}.fuelx.json.gz`);
    const f = must(a.files[0]);
    expect(f.mime).toBe('application/gzip');
    expect(isGzip(f.bytes)).toBe(true);

    const b = rig();
    await b.newRun(1);
    expect(await b.ctl.importFile(new Blob([f.bytes as BlobPart]))).toBe(true);
    expect(b.hash()).toBe(a.hash());
    expect(b.st).toMatchObject({ paused: true, loads: 1 });
    expect(b.state.getState().status).toEqual({ state: 'ok', text: 'LOADED · SEED 42 · T-04:44:56 · STANDBY' });
    expect((await b.ctl.autosaves())[0]).toMatchObject({ reason: 'import', tick: a.tick(), seed: 42 });
  });

  it('accepts plain JSON and migrates older schemas', async () => {
    const b = rig();
    await b.newRun(1);
    expect(await b.ctl.importBytes(new TextEncoder().encode(fixture5))).toBe(true);
    expect(b.state.getState().status?.text).toMatch(/^LOADED · SEED 42 · .* · MIGRATED FROM SCHEMA 5$/);
    expect(b.host.inspect().world.schema).toBe(WORLD_SCHEMA);
  });

  it('rejects bad files with a specific message and keeps the current run', async () => {
    const b = rig();
    await b.newRun(11);
    b.play(20);
    const before = b.hash();
    const good = await b.host.save({ game: 'x', createdAt: NOW });
    const gz = must(await gzipText(good));
    const newer = good.replace(`"schema":${WORLD_SCHEMA}`, '"schema":99');
    const cases: [Uint8Array, RegExp][] = [
      [gz.slice(0, gz.length - 40), /^CORRUPT SAVE · THE \.GZ FILE IS DAMAGED/],
      [new TextEncoder().encode('{"format":"fuelx-save",'), /^CORRUPT SAVE · NOT READABLE JSON/],
      [new TextEncoder().encode(newer), /^SAVE FROM A NEWER VERSION · SCHEMA 99, THIS BUILD READS UP TO \d+/],
      [new TextEncoder().encode('{"format":"fuelx-session","version":1}'), /SESSION LOG \(EXPORT LOG\), NOT A SAVE/],
      [new TextEncoder().encode('{"hello":1}'), /^NOT A FUEL-X SAVE · UNKNOWN FILE FORMAT/],
      [new Uint8Array(0), /^NOT A FUEL-X SAVE · FILE IS EMPTY/],
      [
        new TextEncoder().encode(`{"format":"fuelx-save","schema":${WORLD_SCHEMA},"world":{"schema":${WORLD_SCHEMA}}}`),
        /^CORRUPT SAVE · WORLD DATA FAILED VALIDATION/,
      ],
    ];
    for (const [bytes, re] of cases) {
      expect(await b.ctl.importBytes(bytes)).toBe(false);
      expect(b.state.getState().status).toMatchObject({ state: 'danger' });
      expect(b.state.getState().status?.text).toMatch(re);
    }
    expect(b.hash()).toBe(before);
    expect(b.st.loads).toBe(0);
  });
});

describe('codec', () => {
  it('gzips and gunzips; plain JSON passes through', async () => {
    const gz = must(await gzipText('{"a":1}'));
    expect(isGzip(gz)).toBe(true);
    expect(await decodeSaveBytes(gz)).toBe('{"a":1}');
    expect(await decodeSaveBytes(new TextEncoder().encode('{"b":2}'))).toBe('{"b":2}');
  });

  it('formats wall time and unknown errors', () => {
    expect(wallLabel(NOW)).toBe('2026-10-21 14:22 UTC');
    expect(persistenceErrorText(new Error('SAVE_MIGRATION_MISSING: no migration from schema 0 to 1'))).toBe(
      'SAVE TOO OLD · NO MIGRATION PATH TO THIS VERSION',
    );
    expect(persistenceErrorText(new Error('QuotaExceededError'))).toBe('SAVE ERROR · QUOTAEXCEEDEDERROR');
  });
});
