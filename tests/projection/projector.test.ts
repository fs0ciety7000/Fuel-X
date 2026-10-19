// Projector cadence (ADR 0004): ≤ 10 Hz wall clock while running, immediate on salient events / view / time
// changes, paused ⇒ events only; structural sharing across runs; AC 17 freshness.
import { describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { PROJECTION_INTERVAL_MS, Projector } from '../../src/app/projection';
import type { TimeInputs } from '../../src/app/projection';
import { emptyProjection } from '../../src/bridge/empty-projection';
import { initialViewState } from '../../src/bridge/stores';
import type { ViewState } from '../../src/bridge/stores';
import type { UiProjection } from '../../src/bridge/projection-types';
import { STANDARD_AUTOPILOT, autopilotCommands, createMvpScenario, step } from '../../src/sim/index';
import type { SimEvent } from '../../src/sim/index';

function setup() {
  const sc = createMvpScenario({ seed: 42 });
  sc.world.outbox.length = 0;
  let now = 0;
  const time: TimeInputs = {
    requested: 1,
    paused: false,
    effective: 1,
    maxAllowed: 100,
    lagging: false,
    effectiveRate: 1,
  };
  const view = createStore<ViewState>(() => initialViewState());
  const store = createStore<UiProjection>(() => emptyProjection());
  const p = new Projector({
    inspect: () => ({ world: sc.world, countdown: sc.countdown }),
    time: () => ({ ...time }),
    view,
    store,
    now: () => now,
  });
  const commits: number[] = [];
  store.subscribe(() => commits.push(now));
  /** One 60 Hz frame at `steps` ticks per frame. */
  const frame = (steps = 1, extra: SimEvent[] = []): boolean => {
    const evs: SimEvent[] = [...extra];
    for (let i = 0; i < steps; i++) {
      evs.push(...step(sc.world, autopilotCommands(sc.world, sc.countdown.id, STANDARD_AUTOPILOT)));
      sc.world.outbox.length = 0;
    }
    if (evs.length) p.onEvents(evs);
    now += 1000 / 60;
    return p.frame(now);
  };
  return { sc, p, store, view, time, commits, frame, at: () => now };
}

describe('Projector cadence', () => {
  it('runs at ≤ 10 Hz while running, even at 100×', () => {
    const t = setup();
    t.frame(); // first frame: initial projection (dirty)
    t.commits.length = 0;
    const runs0 = t.p.stats().runs;
    for (let i = 0; i < 600; i++) t.frame(56); // 10 s wall at ≈ 100×
    const runs = t.p.stats().runs - runs0;
    // 10 Hz cadence + salient flushes (phase / station changes over ~17 min of sim time)
    expect(runs - t.p.stats().flushes).toBeLessThanOrEqual(101);
    expect(t.commits.length).toBeLessThanOrEqual(runs);
    const s = t.p.stats();
    expect(s.ageMs).toBeLessThanOrEqual(PROJECTION_INTERVAL_MS + 1000 / 60); // AC 17: ≤ 250 ms
  });

  it('flushes immediately on a salient event and on a view change', () => {
    const t = setup();
    t.frame();
    expect(t.frame()).toBe(false); // 16 ms later: not due
    const salient: SimEvent = {
      t: 'AnomalyFired',
      tick: t.sc.world.tick,
      countdownId: 'cd01',
      anomaly: 'A1',
      entityId: 'e000001',
      source: 'DIRECTOR',
    };
    expect(t.frame(1, [salient])).toBe(true);
    expect(t.frame()).toBe(false);
    t.view.setState({ selectedId: t.sc.countdown.boosterId });
    expect(t.frame()).toBe(true);
    expect(t.store.getState().inspector?.callSign).toBe('B-09');
  });

  it('paused: no cadence runs, only events / time changes', () => {
    const t = setup();
    t.frame();
    t.time.paused = true;
    t.time.effective = 0;
    expect(t.frame(0)).toBe(true); // time-control change is salient
    let runs = 0;
    for (let i = 0; i < 120; i++) if (t.frame(0)) runs++;
    expect(runs).toBe(0);
    expect(t.store.getState().timeScale.readout).toBe('SIM PAUSED');
  });

  it('keeps identity of unchanged slices between runs', () => {
    const t = setup();
    t.frame();
    const a = t.store.getState();
    for (let i = 0; i < 7; i++) t.frame(1); // > 100 ms → one cadence run
    const b = t.store.getState();
    expect(b).not.toBe(a);
    expect(b.sites).toBe(a.sites);
    expect(b.economy).toBe(a.economy);
    expect(b.lists.tanks.length).toBeGreaterThan(0);
    // tanks only boil off by grams: rows whose rounded display did not change keep identity
    expect(b.lists.tanks.filter((r, i) => r === a.lists.tanks[i]).length).toBeGreaterThan(0);
    expect(b.range.stations[1]).toBe(a.range.stations[1]); // RANGE
    expect(b.range.stations[3]).toBe(a.range.stations[3]); // VEHICLE
  });
});
