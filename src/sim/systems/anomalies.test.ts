import { ANOMALY_IDS, anomalies as an, countdown as cdData, propellant as pd, vehicles } from '@data/index';
import type { AnomalyId } from '@data/index';
import { describe, expect, it } from 'vitest';
import type { Command } from '../core/commands';
import type { SimEvent } from '../core/events';
import { rngFromState, seedStream } from '../core/rng';
import { secondsToTicks as T } from '../core/time';
import type { DirectorPlan } from '../core/world';
import { entity, id, liveSetup, mvpSetup, rejected, run, runUntil } from '../fixtures.test-utils';
import type { MvpSetup } from '../fixtures.test-utils';
import { T_BOOSTBACK_END, T_BOOSTBACK_START } from '../math/profile';
import { step } from '../step';
import { releaseBlocker } from './countdown';
import {
  anomaliesFired,
  engineOutProbability,
  marginalMultiplier,
  newAnomalyState,
  reliabilityFactor,
  rollEngineOuts,
} from './anomalies';

const fired = (log: readonly SimEvent[]) =>
  log.flatMap((e) => (e.t === 'AnomalyFired' ? [`${e.anomaly}:${e.source}`] : []));

/** Anomalies on, weather/stations manual (tests force them), director plan replaced by `plan`. */
function withPlan(s: MvpSetup, plan: Partial<DirectorPlan> & { anomaly: AnomalyId }): MvpSetup {
  s.world.config.anomalies = true;
  const st = newAnomalyState();
  st.director.plan = { atTClockTicks: null, atLoadFraction: null, atMissionTicks: null, done: false, ...plan };
  s.world.anomalies[s.cd.id] = st;
  return s;
}
const state = (s: MvpSetup) => {
  const st = s.world.anomalies[s.cd.id];
  if (!st) throw new Error('no anomaly state');
  return st;
};

/** Scripted "hands-off director": GO whenever a hold can be released (not a leak fix), HOLD_FIX on leaks. */
function driver(s: MvpSetup): Command[] {
  const cmds: Command[] = [];
  if (s.cd.clock.state === 'Holding' && s.cd.hold?.reason !== 'LEAK_FIX' && releaseBlocker(s.world, s.cd) === null) {
    cmds.push({ t: 'Go', countdownId: s.cd.id });
  }
  const st = s.world.anomalies[s.cd.id];
  if (st?.leak.active && st.leak.response === null) cmds.push({ t: 'LeakResponse', choice: 'HOLD_FIX' });
  return cmds;
}

describe('director plan (AC 3)', () => {
  const plans = Array.from({ length: 200 }, (_, seed) => {
    const s = liveSetup({ seed });
    step(s.world);
    return state(s).director.plan;
  });

  it('draws a guaranteed anomaly in 100 % of 200 seeds', () => {
    expect(plans.every((p) => p !== null && !p.done)).toBe(true);
  });

  it('distribution within ±10 points of the configured weights', () => {
    for (const a of ANOMALY_IDS) {
      const share = plans.filter((p) => p?.anomaly === a).length / plans.length;
      expect(Math.abs(share - an.director.weights[a]), a).toBeLessThan(0.1);
    }
  });

  it('places every trigger inside its window, before the deadline (A4: in flight)', () => {
    for (const p of plans) {
      if (!p) continue;
      if (p.anomaly === 'A1') {
        expect(p.atTClockTicks).toBeGreaterThanOrEqual(T(an.A1.windowStartTS));
        expect(p.atTClockTicks).toBeLessThanOrEqual(T(an.director.deadlineTS));
      } else if (p.anomaly === 'A2') {
        expect(p.atTClockTicks).toBeGreaterThanOrEqual(T(an.director.a2EarliestTS));
        expect(p.atTClockTicks).toBeLessThanOrEqual(T(an.director.deadlineTS));
      } else if (p.anomaly === 'A3') {
        expect(p.atLoadFraction).toBeGreaterThanOrEqual(an.A3.onsetLoadFractionMin);
        expect(p.atLoadFraction).toBeLessThanOrEqual(an.A3.onsetLoadFractionMax);
      } else {
        const t = p.atMissionTicks ?? -1;
        const ascent = t >= T(an.A4.ascentWindowS[0]) && t <= T(an.A4.ascentWindowS[1]);
        const boostback = t >= T(T_BOOSTBACK_START) && t <= T(T_BOOSTBACK_END);
        expect(ascent || boostback).toBe(true);
      }
    }
  });

  it('is off when guaranteeOne is off', () => {
    an.director.guaranteeOne = false;
    try {
      const s = liveSetup({ seed: 1 });
      step(s.world);
      expect(state(s).director.plan).toBeNull();
    } finally {
      an.director.guaranteeOne = true;
    }
  });
});

describe('A1 range fouled', () => {
  it('natural: rolls only inside T-02:00:00 → T-0 (changing the data rate changes the outcome, AC 2)', () => {
    const rate = an.A1.ratePerS;
    an.A1.ratePerS = 1e6;
    try {
      const early = mvpSetup({ startTS: an.A1.windowStartTS - 100 });
      early.world.config.anomalies = true;
      const log = run(early.world, T(50));
      expect(fired(log).filter((f) => f.startsWith('A1'))).toEqual([]);
      log.push(...run(early.world, T(60)));
      expect(fired(log).filter((f) => f.startsWith('A1'))).toEqual(['A1:NATURAL']);
      expect(state(early).intruderId).not.toBeNull();
    } finally {
      an.A1.ratePerS = rate;
    }
  });

  it('director: fires at its T-offset, RANGE NO-GO auto-holds the load, GO once cleared', () => {
    const s = withPlan(mvpSetup({ prepped: true, startTS: -4_700, phase: 'PropellantLoad', pollsPassed: ['load'] }), {
      anomaly: 'A1',
      atTClockTicks: T(-4_690),
    });
    s.world.config.stations = 'LIVE';
    const log = run(s.world, T(11));
    expect(fired(log)).toEqual(['A1:DIRECTOR']);
    expect(state(s).director.plan?.done).toBe(true);
    log.push(...run(s.world, 4));
    expect(log.find((e) => e.t === 'HoldStarted')).toMatchObject({ reason: 'NO_GO' });
    const unk = state(s).intruderId ?? '';
    log.push(...runUntil(s.world, () => !s.world.entities.byId[unk]));
    log.push(...runUntil(s.world, () => releaseBlocker(s.world, s.cd) === null));
    expect(s.cd.inputs.stations.RANGE).not.toBe('NO_GO');
    expect(rejected(step(s.world, [{ t: 'Go', countdownId: s.cd.id }]))).toEqual([]);
    expect(s.cd.clock.state).toBe('Counting');
  });
});

describe('A2 upper-wind spike', () => {
  it('director: brings a front in during the load', () => {
    const s = withPlan(mvpSetup({ prepped: true, startTS: -4_000, phase: 'PropellantLoad', pollsPassed: ['load'] }), {
      anomaly: 'A2',
      atTClockTicks: T(-3_990),
    });
    const log = run(s.world, T(11));
    expect(fired(log)).toEqual(['A2:DIRECTOR']);
    expect(s.world.weather.front?.arrivalTick).toBe(T(10) - 1);
    expect(log.find((e) => e.t === 'AnomalyFired')).toMatchObject({ entityId: id(s.ids, 'WX-1') });
  });

  it('natural: a front counts only when it arrives during load → T-0', () => {
    const inLoad = mvpSetup({ prepped: true, startTS: -4_000, phase: 'PropellantLoad', pollsPassed: ['load'] });
    inLoad.world.config.anomalies = true;
    inLoad.world.weather.front = { arrivalTick: 50, durationTicks: T(2_400) };
    expect(fired(run(inLoad.world, 60))).toEqual(expect.arrayContaining(['A2:NATURAL']));
    const inStack = mvpSetup({ prepped: true, startTS: -9_000 });
    inStack.world.config.anomalies = true;
    inStack.world.weather.front = { arrivalTick: 50, durationTicks: T(2_400) };
    expect(fired(run(inStack.world, 60)).filter((f) => f.startsWith('A2'))).toEqual([]);
  });

  it('a director A2 after a natural A2 does not fire twice', () => {
    const s = withPlan(mvpSetup({ prepped: true, startTS: -4_000, phase: 'PropellantLoad', pollsPassed: ['load'] }), {
      anomaly: 'A2',
      atTClockTicks: T(-3_990),
    });
    s.world.weather.front = { arrivalTick: 5, durationTicks: T(2_400) };
    expect(fired(run(s.world, T(12)))).toEqual(['A2:NATURAL']);
    expect(state(s).director.plan?.done).toBe(true);
  });
});

describe('A3 GSE leak (D3b)', () => {
  function leaking(choice?: 'DEGRADED' | 'HOLD_FIX') {
    const s = withPlan(
      mvpSetup({ prepped: true, startTS: cdData.loadStartTS - 2, phase: 'PropellantLoad', pollsPassed: ['load'] }),
      { anomaly: 'A3', atLoadFraction: 0.01 },
    );
    s.world.config.stations = 'LIVE';
    const b = entity(s.world, s.cd.boosterId, 'booster');
    const log = runUntil(s.world, () => state(s).leak.active);
    if (choice) log.push(...step(s.world, [{ t: 'LeakResponse', choice }]));
    return { ...s, b, log };
  }

  it('starts at the onset fraction: load ×0.5, decision LEAK, VEHICLE MARGINAL', () => {
    const s = leaking();
    expect(s.b.prop.loxKg / s.b.prop.loxCapKg).toBeGreaterThanOrEqual(0.01);
    expect(fired(s.log)).toEqual(['A3:DIRECTOR']);
    expect(s.world.logistics.loadRateFactor).toBe(pd.degradedLoadFactor);
    expect(s.log.find((e) => e.t === 'DecisionRequired')).toMatchObject({ decision: 'LEAK', poll: null });
    run(s.world, 3);
    expect(s.cd.inputs.stations.VEHICLE).toBe('MARGINAL');
    const before = s.b.prop.loxKg;
    step(s.world);
    expect(s.b.prop.loxKg - before).toBeCloseTo(
      (pd.loadRateKgPerS.booster.LOX * 0.5) / 30 - (before * pd.vehicleBoilOffFractionPerS.LOX) / 30,
      6,
    );
  });

  it('DEGRADED keeps loading at the degraded rate; the leak lasts until liftoff', () => {
    const s = leaking('DEGRADED');
    expect(s.log.find((e) => e.t === 'LeakResponded')).toMatchObject({ choice: 'DEGRADED', by: 'PLAYER' });
    run(s.world, T(60));
    expect(s.world.logistics.loadRateFactor).toBe(pd.degradedLoadFactor);
    expect(state(s).leak.active).toBe(true);
    expect(rejected(step(s.world, [{ t: 'LeakResponse', choice: 'DEGRADED' }]))).toEqual(['ALREADY_RESPONDED']);
  });

  it('HOLD_FIX: LEAK_FIX hold, load paused 20 min, then full rate and the count resumes by itself', () => {
    const s = leaking('HOLD_FIX');
    expect(s.cd.hold).toMatchObject({ reason: 'LEAK_FIX' });
    expect(s.world.logistics.loadRateFactor).toBe(0);
    const tClock = s.cd.tClockTicks;
    const mass = s.b.prop.loxKg;
    run(s.world, T(an.A3.fixDurationS) - 10);
    expect(s.cd.tClockTicks).toBe(tClock);
    expect(s.b.prop.loxKg).toBeLessThan(mass); // boil-off only, no fill
    expect(rejected(step(s.world, [{ t: 'LeakResponse', choice: 'DEGRADED' }]))).toEqual(['ALREADY_RESPONDED']);
    const log = run(s.world, 20);
    expect(log.find((e) => e.t === 'LeakCleared')).toMatchObject({ by: 'FIXED' });
    expect(log.find((e) => e.t === 'HoldReleased')).toMatchObject({ reason: 'LEAK_FIX', by: 'AUTO' });
    expect(s.world.logistics.loadRateFactor).toBe(1);
    expect(s.cd.clock.state).toBe('Counting');
  });

  it('one-shot: HOLD_FIX after a DEGRADED answer is ALREADY_RESPONDED (no hold, still degraded)', () => {
    const s = leaking('DEGRADED');
    expect(rejected(step(s.world, [{ t: 'LeakResponse', choice: 'HOLD_FIX' }]))).toEqual(['ALREADY_RESPONDED']);
    expect(state(s).leak.response).toBe('DEGRADED');
    expect(s.cd.hold).toBeNull();
    expect(s.world.logistics.loadRateFactor).toBe(pd.degradedLoadFactor);
  });

  it('deadline = onset + decisionTimeoutS; unanswered → DEGRADED by AUTO, logged AUTO, VEHICLE MARGINAL (AC 29)', () => {
    const s = leaking();
    const onset = s.world.tick - 1;
    const deadline = onset + T(an.A3.decisionTimeoutS);
    expect(s.log.find((e) => e.t === 'DecisionRequired')).toMatchObject({ decision: 'LEAK', deadlineTick: deadline });
    expect(state(s).leak.deadlineTick).toBe(deadline);
    const before = run(s.world, deadline - s.world.tick);
    expect(before.some((e) => e.t === 'LeakResponded')).toBe(false);
    expect(state(s).leak.response).toBeNull();
    const at = step(s.world);
    expect(at.filter((e) => e.t === 'LeakResponded')).toEqual([
      { t: 'LeakResponded', tick: deadline, countdownId: s.cd.id, choice: 'DEGRADED', by: 'AUTO' },
    ]);
    expect(s.world.decisions[s.cd.id]?.at(-1)).toMatchObject({
      tick: deadline,
      kind: 'LeakResponse',
      detail: 'DEGRADED',
      by: 'AUTO',
    });
    expect(s.cd.hold).toBeNull();
    expect(s.world.logistics.loadRateFactor).toBe(pd.degradedLoadFactor);
    run(s.world, T(60));
    expect(s.cd.inputs.stations.VEHICLE).toBe('MARGINAL');
    expect(state(s).leak.active).toBe(true);
    expect(rejected(step(s.world, [{ t: 'LeakResponse', choice: 'HOLD_FIX' }]))).toEqual(['ALREADY_RESPONDED']);
  });

  it('a player answer at the deadline tick wins (commands apply before systems); no AUTO entry', () => {
    const s = leaking();
    const deadline = state(s).leak.deadlineTick ?? 0;
    run(s.world, deadline - s.world.tick);
    const at = step(s.world, [{ t: 'LeakResponse', choice: 'HOLD_FIX' }]);
    expect(at.filter((e) => e.t === 'LeakResponded')).toMatchObject([{ choice: 'HOLD_FIX', by: 'PLAYER' }]);
    expect(s.world.decisions[s.cd.id]?.filter((d) => d.kind === 'LeakResponse').map((d) => d.by)).toEqual(['PLAYER']);
  });

  it('a DIRECTOR answer is committed and logged as DIRECTOR (AC 33)', () => {
    const s = leaking();
    const at = step(s.world, [{ t: 'LeakResponse', choice: 'DEGRADED', source: 'DIRECTOR' }]);
    expect(at.filter((e) => e.t === 'LeakResponded')).toMatchObject([{ choice: 'DEGRADED', by: 'DIRECTOR' }]);
    expect(s.world.decisions[s.cd.id]?.filter((d) => d.kind === 'LeakResponse').map((d) => d.by)).toEqual(['DIRECTOR']);
  });

  it('deadline is capped at window close', () => {
    const onset = leaking().world.tick - 1; // same setup, deterministic onset tick
    const s = withPlan(
      mvpSetup({ prepped: true, startTS: cdData.loadStartTS - 2, phase: 'PropellantLoad', pollsPassed: ['load'] }),
      { anomaly: 'A3', atLoadFraction: 0.01 },
    );
    s.world.config.stations = 'LIVE';
    run(s.world, onset - s.world.tick);
    s.cd.windowCloseTick = onset + T(100); // the window moved close to the onset (only the cap matters here)
    const log = step(s.world);
    expect(s.world.tick - 1).toBe(onset);
    expect(log.find((e) => e.t === 'DecisionRequired')).toMatchObject({
      decision: 'LEAK',
      deadlineTick: onset + T(100),
    });
  });

  it('rejects a response without a leak', () => {
    const s = mvpSetup();
    expect(rejected(step(s.world, [{ t: 'LeakResponse', choice: 'HOLD_FIX' }]))).toEqual(['NO_ACTIVE_LEAK']);
  });

  it('natural: one roll per load at load start', () => {
    let hits = 0;
    for (let seed = 0; seed < 300; seed++) {
      const s = mvpSetup({
        seed,
        prepped: true,
        startTS: cdData.loadStartTS,
        phase: 'PropellantLoad',
        pollsPassed: ['load'],
      });
      s.world.config.anomalies = true;
      s.world.anomalies[s.cd.id] = newAnomalyState(); // no director plan
      run(s.world, 3);
      const st = state(s);
      expect(st.leakRolled).toBe(true);
      if (st.leakOnsetFraction !== null) {
        hits++;
        expect(st.leakOnsetSource).toBe('NATURAL');
      }
    }
    expect(hits / 300).toBeGreaterThan(an.A3.probabilityPerLoad - 0.05);
    expect(hits / 300).toBeLessThan(an.A3.probabilityPerLoad + 0.05);
  });
});

describe('A4 engine-out (AC 14, 18)', () => {
  it('probability = base × (1 + 2·wear) × marginal multiplier for WEATHER/VEHICLE GO-on-MARGINAL', () => {
    const s = mvpSetup();
    const b = entity(s.world, s.cd.boosterId, 'booster');
    const rf = reliabilityFactor(b.wear);
    expect(rf).toBeCloseTo(1 + vehicles.wear.reliabilityPerWear * vehicles.mvpBooster.wear, 12);
    expect(engineOutProbability(s.cd, b, 'ASCENT')).toBeCloseTo(an.A4.perEngineAscent * rf, 15);
    expect(engineOutProbability(s.cd, b, 'BOOSTBACK')).toBeCloseTo(an.A4.perEngineBoostback * rf, 15);
    s.cd.goWithMarginal = ['PROPELLANT', 'RANGE'];
    expect(marginalMultiplier(s.cd, 'A4')).toBe(1);
    s.cd.goWithMarginal = ['WEATHER'];
    expect(marginalMultiplier(s.cd, 'A4')).toBe(an.marginalRiskMultiplier);
    expect(marginalMultiplier(s.cd, 'A1')).toBe(1);
    expect(engineOutProbability(s.cd, b, 'ASCENT')).toBeCloseTo(an.A4.perEngineAscent * rf * 2, 15);
  });

  it('seeded rates: GO on a MARGINAL station doubles the engine-out rate (AC 14)', () => {
    const s = mvpSetup();
    const b = entity(s.world, s.cd.boosterId, 'booster');
    const flights = 20_000;
    const rate = (marginal: boolean): number => {
      s.cd.goWithMarginal = marginal ? ['VEHICLE'] : [];
      const r = rngFromState(seedStream(14, 'anomaly'));
      let outs = 0;
      for (let i = 0; i < flights; i++) {
        outs += rollEngineOuts(r, vehicles.booster.engines, engineOutProbability(s.cd, b, 'ASCENT'));
        outs += rollEngineOuts(r, vehicles.booster.boostbackEngines, engineOutProbability(s.cd, b, 'BOOSTBACK'));
      }
      return outs / flights;
    };
    const base = rate(false);
    const marginal = rate(true);
    const rf = reliabilityFactor(b.wear);
    expect(base).toBeCloseTo(rf * (33 * an.A4.perEngineAscent + 13 * an.A4.perEngineBoostback), 2);
    expect(marginal / base).toBeGreaterThan(1.8);
    expect(marginal / base).toBeLessThan(2.2);
  });

  function flying(plan: Partial<DirectorPlan>) {
    const s = withPlan(mvpSetup({ startTS: -5, phase: 'TerminalCount', pollsPassed: ['load', 'terminal', 'final'] }), {
      anomaly: 'A4',
      ...plan,
    });
    for (const st of [entity(s.world, s.cd.boosterId, 'booster'), entity(s.world, s.cd.shipId, 'ship')]) {
      st.fsm.state = 'LOADED';
      st.prop.loxKg = st.prop.loxCapKg;
      st.prop.ch4Kg = st.prop.ch4CapKg;
    }
    Object.assign(s.cd.inputs, { loadComplete: true, stackComplete: true, rolloutComplete: true });
    const log = runUntil(s.world, () => s.cd.phase.state === 'Debrief');
    return { ...s, log, b: entity(s.world, s.cd.boosterId, 'booster') };
  }

  it('director ascent engine-out: 32 of 33 at the planned mission time, MECO slips', () => {
    const f = flying({ atMissionTicks: T(60) });
    const ev = f.log.find((e) => e.t === 'AnomalyFired');
    const liftoff = f.cd.liftoffTick ?? 0;
    expect(ev).toMatchObject({ anomaly: 'A4', source: 'DIRECTOR', entityId: f.b.id });
    expect((ev?.tick ?? 0) - liftoff).toBe(T(60));
    expect(f.log.find((e) => e.t === 'EnginesChanged' && e.lit === 32)).toBeDefined();
    const meco = f.log.find((e) => e.t === 'FlightEvent' && e.event === 'MECO');
    expect((meco?.tick ?? 0) - liftoff).toBeGreaterThan(T(155));
    expect(anomaliesFired(f.world, f.cd.id)).toEqual(['A4']);
  });

  it('director boostback engine-out: 12 of 13, catch p drops', () => {
    const f = flying({ atMissionTicks: T(190) });
    expect(f.log.find((e) => e.t === 'EnginesChanged' && e.lit === 12 && e.failed === 1)).toBeDefined();
    expect(f.b.recovery?.p).toBeLessThan(0.8);
  });
});

describe('director fallback at T-00:30:00', () => {
  it('a plan that can no longer happen is replaced by an eligible anomaly', () => {
    const s = withPlan(
      mvpSetup({ prepped: true, startTS: an.director.deadlineTS - 5, phase: 'PropellantLoad', pollsPassed: ['load'] }),
      { anomaly: 'A3', atLoadFraction: 0.3 },
    );
    s.cd.inputs.loadComplete = true;
    for (const st of [entity(s.world, s.cd.boosterId, 'booster'), entity(s.world, s.cd.shipId, 'ship')]) {
      st.fsm.state = 'LOADED';
      st.prop.loxKg = st.prop.loxCapKg;
      st.prop.ch4Kg = st.prop.ch4CapKg;
    }
    run(s.world, T(6));
    const st = state(s);
    expect(st.director.fallbackUsed).toBe(true);
    expect(st.director.plan?.anomaly).not.toBe('A3');
    run(s.world, T(1));
    if (st.director.plan?.anomaly !== 'A4') expect(st.fired.length).toBe(1);
  });

  it('a count frozen at a poll (no input) still gets one before the window closes', () => {
    const s = withPlan(mvpSetup({ startTS: -4_810 }), { anomaly: 'A4', atMissionTicks: T(60) });
    const log = run(s.world, T(20));
    expect(s.cd.hold).toMatchObject({ reason: 'POLL', poll: 'load' });
    expect(fired(log)).toEqual([]);
    s.cd.windowCloseTick = s.world.tick + T(an.director.windowCloseLeadS) + 3;
    log.push(...run(s.world, 5));
    expect(state(s).director.fallbackUsed).toBe(true);
    expect(fired(log)).toEqual(['A1:DIRECTOR']);
  });

  it('does nothing when an anomaly already fired', () => {
    const s = withPlan(mvpSetup({ prepped: true, startTS: an.director.deadlineTS - 5 }), {
      anomaly: 'A3',
      atLoadFraction: 0.3,
    });
    state(s).fired.push({ anomaly: 'A1', tick: 0, source: 'NATURAL', entityId: '' });
    run(s.world, T(6));
    expect(state(s).director.fallbackUsed).toBe(false);
  });
});

describe('every plan kind actually fires in a live count (AC 3, sampled)', () => {
  // One seed per director kind (found from the plan sweep above), live weather/stations, scripted GO driver,
  // from T-02:05:00 with the stack done through boostback end.
  const seedFor = (kind: AnomalyId): number => {
    for (let seed = 0; seed < 200; seed++) {
      const s = liveSetup({ seed });
      step(s.world);
      if (state(s).director.plan?.anomaly === kind) return seed;
    }
    throw new Error(`no seed for ${kind}`);
  };

  it.each(ANOMALY_IDS)('%s', (kind) => {
    const seed = seedFor(kind);
    const s = liveSetup({ seed, prepped: true, startTS: -7_500 });
    // Ensure the order of deliveries keeps PROPELLANT out of NO-GO under holds: full farm.
    for (const tid of s.world.logistics.farm.LOX) entity(s.world, tid, 'tank').massKg = pd.farm.loxTankCapKg;
    for (const tid of s.world.logistics.farm.CH4) entity(s.world, tid, 'tank').massKg = pd.farm.ch4TankCapKg;
    const log: SimEvent[] = [];
    const b = entity(s.world, s.cd.boosterId, 'booster');
    for (let i = 0; i < T(20_000) && b.fsm.state !== 'DESCENT' && s.cd.phase.state !== 'Debrief'; i++) {
      log.push(...step(s.world, driver(s)));
    }
    expect(fired(log)).toContain(`${kind}:DIRECTOR`);
  });
});
