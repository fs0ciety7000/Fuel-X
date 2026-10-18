import { countdown as cdData, propellant as pd, vehicles } from '@data/index';
import type { Propellant } from '@data/index';
import { describe, expect, it } from 'vitest';
import { hashWorld } from '../core/serialize';
import { DT_S, secondsToTicks as T } from '../core/time';
import type { World } from '../core/world';
import { entity, mvpSetup, run, runUntil, stateChanges } from '../fixtures.test-utils';
import type { MvpSetup } from '../fixtures.test-utils';
import { advance, step } from '../step';
import type { EntityOf } from '../types';
import { addToFarm, drawFromFarm, farmMassKg, farmUsableKg, toppingDemandKgPerS } from './propellant';

const FLUIDS: readonly Propellant[] = ['LOX', 'CH4'];

function stages(s: MvpSetup): [EntityOf<'booster'>, EntityOf<'ship'>] {
  return [entity(s.world, s.cd.boosterId, 'booster'), entity(s.world, s.cd.shipId, 'ship')];
}

/** Countdown in PropellantLoad (load poll passed) with both stages stacked on OLM-1. */
function loadSetup(startTS: number, phase: 'PropellantLoad' | 'TerminalCount' = 'PropellantLoad'): MvpSetup {
  const s = mvpSetup({ startTS, phase, pollsPassed: phase === 'PropellantLoad' ? ['load'] : ['load', 'terminal'] });
  for (const st of stages(s)) st.fsm.state = 'STACKED';
  return s;
}

const key = (f: Propellant): 'loxKg' | 'ch4Kg' => (f === 'LOX' ? 'loxKg' : 'ch4Kg');

/** Everything that exists or has left the system, per fluid: must stay equal to the start farm. */
function massBudget(s: MvpSetup, f: Propellant): number {
  const l = s.world.logistics.ledger[f];
  const onBoard = stages(s).reduce((sum, st) => sum + st.prop[key(f)], 0);
  return farmMassKg(s.world, f) + onBoard + l.farmBoilOffKg + l.vehicleBoilOffKg + l.detankLostKg - l.deliveredKg;
}

describe('farm boil-off (AC 9)', () => {
  it('follows the configured fraction per second, compounded per tick; LN2 stays static', () => {
    const { world } = mvpSetup();
    const lox = entity(world, world.logistics.farm.LOX[0] ?? '', 'tank');
    const ln2 = entity(world, world.logistics.farm.LN2[0] ?? '', 'tank');
    const m0 = lox.massKg;
    const n = T(3_600);
    advance(world, n);
    const f = pd.farm.boilOffFractionPerS.LOX;
    expect(lox.massKg / (m0 * (1 - f * DT_S) ** n)).toBeCloseTo(1, 10);
    expect(lox.massKg / (m0 * Math.exp(-f * 3_600))).toBeCloseTo(1, 9);
    expect(lox.boiledOffKg).toBeCloseTo(m0 - lox.massKg, 6);
    expect(ln2.massKg).toBe(pd.farm.ln2TankCapKg);
  });

  it('is independent of step batching (any time scale gives the same state)', () => {
    const a = mvpSetup();
    const b = mvpSetup();
    advance(a.world, T(7_200)); // one batch
    for (let i = 0; i < 720; i++) advance(b.world, T(10)); // 10 s frames
    expect(hashWorld(b.world)).toBe(hashWorld(a.world));
  });
});

describe('farm transfers', () => {
  it('draws only above the heel and fills only up to capacity, exactly', () => {
    const { world } = mvpSetup();
    const usable = farmUsableKg(world, 'CH4');
    const total = farmMassKg(world, 'CH4');
    expect(drawFromFarm(world, 'CH4', usable + 5_000)).toBeCloseTo(usable, 6);
    expect(farmUsableKg(world, 'CH4')).toBe(0);
    expect(farmMassKg(world, 'CH4')).toBeCloseTo(total - usable, 6);
    expect(drawFromFarm(world, 'CH4', 1)).toBe(0);
    const free = pd.farm.ch4TankCount * pd.farm.ch4TankCapKg - farmMassKg(world, 'CH4');
    expect(addToFarm(world, 'CH4', free + 1_000)).toBeCloseTo(free, 6);
    expect(addToFarm(world, 'CH4', 1)).toBe(0);
  });
});

describe('propellant load + topping (AC 15)', () => {
  it('starts at T-01:15:00 and draws each line at its configured rate from the farm', () => {
    const s = loadSetup(cdData.loadStartTS - 10);
    const [booster, ship] = stages(s);
    const before = run(s.world, T(10) - 1);
    expect(booster.prop.loxKg).toBe(0);
    expect(stateChanges(before, booster.id)).toEqual([]);
    const evs = run(s.world, 2);
    expect(stateChanges(evs, booster.id)).toEqual(['LOADING']);
    expect(stateChanges(evs, ship.id)).toEqual(['LOADING']);
    const l0 = { ...s.world.logistics.ledger.LOX };
    step(s.world);
    const drawn = s.world.logistics.ledger.LOX.farmToVehicleKg - l0.farmToVehicleKg;
    expect(drawn).toBeCloseTo((pd.loadRateKgPerS.booster.LOX + pd.loadRateKgPerS.ship.LOX) * DT_S, 9);
  });

  it('fills every line to capacity in the time the rate and boil-off imply, conserving mass', () => {
    const s = loadSetup(cdData.loadStartTS);
    const [booster, ship] = stages(s);
    const budget0 = FLUIDS.map((f) => massBudget(s, f));
    const log = runUntil(s.world, () => s.cd.inputs.loadComplete);
    // m' = r − k·m  ⇒  t_full = −ln(1 − k·C/r) / k, per line; the slowest line ends the load.
    const tFull = (r: number, k: number, c: number): number => -Math.log(1 - (k * c) / r) / k;
    const expected = Math.max(
      ...(['booster', 'ship'] as const).flatMap((st) =>
        FLUIDS.map((f) =>
          tFull(
            pd.loadRateKgPerS[st][f],
            pd.vehicleBoilOffFractionPerS[f],
            vehicles[st][f === 'LOX' ? 'loxCapKg' : 'ch4CapKg'],
          ),
        ),
      ),
    );
    expect(Math.abs((s.world.tick - 1) * DT_S - expected)).toBeLessThan(1);
    expect(booster.prop).toMatchObject({ loxKg: booster.prop.loxCapKg, ch4Kg: booster.prop.ch4CapKg });
    expect(ship.prop).toMatchObject({ loxKg: ship.prop.loxCapKg, ch4Kg: ship.prop.ch4CapKg });
    expect(stateChanges(log, booster.id)).toEqual(['LOADING', 'LOADED']);
    FLUIDS.forEach((f, i) => expect(massBudget(s, f) / (budget0[i] ?? 1)).toBeCloseTo(1, 12));
  });

  it('topping replaces vehicle boil-off from the farm once full, during a hold too', () => {
    const s = loadSetup(cdData.loadStartTS);
    runUntil(s.world, () => s.cd.inputs.loadComplete);
    step(s.world, [{ t: 'Hold', countdownId: s.cd.id }]);
    const [booster] = stages(s);
    const l0 = { ...s.world.logistics.ledger.LOX };
    const farm0 = farmMassKg(s.world, 'LOX');
    const demand = toppingDemandKgPerS(s.world, s.cd, 'LOX');
    run(s.world, T(600));
    const l = s.world.logistics.ledger.LOX;
    expect(booster.prop.loxKg).toBe(booster.prop.loxCapKg);
    expect(l.farmToVehicleKg - l0.farmToVehicleKg).toBeCloseTo(l.vehicleBoilOffKg - l0.vehicleBoilOffKg, 3);
    expect(l.farmToVehicleKg - l0.farmToVehicleKg).toBeCloseTo(demand * 600, 0);
    expect(farm0 - farmMassKg(s.world, 'LOX')).toBeCloseTo(
      l.farmToVehicleKg - l0.farmToVehicleKg + l.farmBoilOffKg - l0.farmBoilOffKg,
      3,
    );
    expect(s.cd.clock.state).toBe('Holding');
  });

  it('a nominal load leaves the MVP farm with margin at T-0', () => {
    const s = loadSetup(cdData.loadStartTS);
    runUntil(s.world, () => s.cd.tClockTicks >= T(-60));
    expect(s.cd.inputs.loadComplete).toBe(true);
    for (const f of FLUIDS) expect(farmUsableKg(s.world, f)).toBeGreaterThan(0);
  });

  it('stays incomplete when the farm runs dry, and needs stacked stages', () => {
    const dry = loadSetup(cdData.loadStartTS);
    for (const tid of dry.world.logistics.farm.CH4) {
      const t = entity(dry.world, tid, 'tank');
      t.massKg = t.capKg * pd.farm.heelFraction + 10_000;
    }
    run(dry.world, T(600));
    const [booster, ship] = stages(dry);
    // 10 t usable per tank, minus what boiled off before it was drawn.
    const got = booster.prop.ch4Kg + ship.prop.ch4Kg + dry.world.logistics.ledger.CH4.vehicleBoilOffKg;
    expect(got).toBeGreaterThan(pd.farm.ch4TankCount * 10_000 - 100);
    expect(got).toBeLessThanOrEqual(pd.farm.ch4TankCount * 10_000);
    expect(farmUsableKg(dry.world, 'CH4')).toBe(0);
    expect(dry.cd.inputs.loadComplete).toBe(false);

    const yard = mvpSetup({ startTS: cdData.loadStartTS, phase: 'PropellantLoad', pollsPassed: ['load'] });
    run(yard.world, T(60));
    expect(stages(yard)[0].prop.loxKg).toBe(0);
    expect(stages(yard)[0].fsm.state).toBe('IN_YARD');
  });
});

describe('auto-hold at T-00:03:00 (AC 15)', () => {
  it('a late load holds the count at T-00:03:00 and releases it when the load completes', () => {
    const s = loadSetup(-2_000);
    const log = runUntil(s.world, () => s.cd.liftoffTick !== null);
    const hold = log.find((e) => e.t === 'HoldStarted');
    expect(hold).toMatchObject({ reason: 'LOAD_INCOMPLETE', tClockTicks: T(cdData.loadMustCompleteByTS) });
    const release = log.find((e) => e.t === 'HoldReleased');
    expect(release).toMatchObject({ reason: 'LOAD_INCOMPLETE', by: 'AUTO' });
    const full = log.find((e) => e.t === 'EntityStateChanged' && e.to === 'LOADED' && e.kind === 'booster');
    expect((release?.tick ?? 0) - (full?.tick ?? 0)).toBeLessThanOrEqual(2);
  });
});

describe('scrub detank (AC 12)', () => {
  function scrubbed(loaded: boolean): MvpSetup & { world: World } {
    const s = loadSetup(-1_500, 'TerminalCount');
    if (loaded) {
      const [booster, ship] = stages(s);
      booster.fsm.state = 'LOADING';
      ship.fsm.state = 'LOADED';
      Object.assign(booster.prop, { loxKg: 1_200_000, ch4Kg: 300_000 });
      Object.assign(ship.prop, { loxKg: ship.prop.loxCapKg, ch4Kg: ship.prop.ch4CapKg });
      // The propellant on board came out of the farm.
      drawFromFarm(s.world, 'LOX', booster.prop.loxKg + ship.prop.loxKg);
      drawFromFarm(s.world, 'CH4', booster.prop.ch4Kg + ship.prop.ch4Kg);
    }
    return s;
  }

  it('drains the stages at the line rates, vents the configured fraction, then Debrief', () => {
    const s = scrubbed(true);
    const [booster, ship] = stages(s);
    const onBoard = { LOX: booster.prop.loxKg + ship.prop.loxKg, CH4: booster.prop.ch4Kg + ship.prop.ch4Kg };
    const farm0 = { LOX: farmMassKg(s.world, 'LOX'), CH4: farmMassKg(s.world, 'CH4') };
    const log = [...run(s.world, 1), ...run(s.world, 1)]; // tick 0: no scrub yet
    log.push(...step(s.world, [{ t: 'Scrub', countdownId: s.cd.id }]));
    log.push(...runUntil(s.world, () => s.cd.phase.state === 'Debrief'));
    expect(stateChanges(log, booster.id)).toEqual(['DETANKING', 'STACKED']);
    expect(stateChanges(log, ship.id)).toEqual(['DETANKING', 'STACKED']);
    expect(booster.prop.loxKg + booster.prop.ch4Kg + ship.prop.loxKg + ship.prop.ch4Kg).toBe(0);
    const done = log.find((e) => e.t === 'DetankCompleted');
    const l = s.world.logistics.ledger;
    for (const f of FLUIDS) {
      const drained = l[f].detankReturnedKg + l[f].detankLostKg;
      expect(l[f].detankLostKg / drained).toBeCloseTo(pd.scrubDetankLossFraction, 12);
      // Everything on board went somewhere: drained, boiled off on the vehicle, or topped first.
      expect(drained + l[f].vehicleBoilOffKg - l[f].farmToVehicleKg).toBeCloseTo(onBoard[f], 3);
      expect(farmMassKg(s.world, f)).toBeCloseTo(
        farm0[f] + l[f].detankReturnedKg - l[f].farmToVehicleKg - l[f].farmBoilOffKg,
        3,
      );
    }
    expect(done).toMatchObject({ returnedKg: { LOX: l.LOX.detankReturnedKg }, lostKg: { CH4: l.CH4.detankLostKg } });
    expect(s.cd.inputs.detankComplete).toBe(true);
    // Each line drains at its load rate while boiling off: m' = −r − k·m ⇒ t = ln(1 + k·m0/r) / k.
    const scrubTick = log.find((e) => e.t === 'PhaseChanged' && e.to === 'Scrubbed')?.tick ?? 0;
    const tEmpty = (m0: number, r: number, k: number): number => Math.log(1 + (k * m0) / r) / k;
    const slowest = Math.max(
      ...FLUIDS.map((f) =>
        tEmpty(
          vehicles.ship[f === 'LOX' ? 'loxCapKg' : 'ch4CapKg'],
          pd.loadRateKgPerS.ship[f],
          pd.vehicleBoilOffFractionPerS[f],
        ),
      ),
    );
    expect(Math.abs((done?.tick ?? 0) - scrubTick - T(slowest))).toBeLessThan(T(5));
  });

  it('with nothing loaded, detank completes at once', () => {
    const s = mvpSetup({ startTS: -10_000, phase: 'Stack' });
    const log = step(s.world, [{ t: 'Scrub', countdownId: s.cd.id }]);
    log.push(...run(s.world, 2));
    expect(log.map((e) => e.t)).toContain('DetankCompleted');
    expect(s.cd.phase.state).toBe('Debrief');
  });
});
