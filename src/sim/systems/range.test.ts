import {
  anomalies as an,
  countdown as cdData,
  lc1Layout,
  logistics as ld,
  propellant as pd,
  vehicles,
  weather as wx,
} from '@data/index';
import { describe, expect, it } from 'vitest';
import { rng } from '../core/rng';
import { secondsToTicks as T } from '../core/time';
import { BOAT_STATES, VAN_STATES, boatFsm, vanFsm } from '../entities/machines';
import { entity, id, liveSetup, mvpSetup, run, runUntil } from '../fixtures.test-utils';
import { pathLengthM, pointAt } from '../math/path';
import { step } from '../step';
import type { BoatState, GoStatus, StationDriver, VanState } from '../types';
import { newAnomalyState } from './anomalies';
import { crewElapsedS, foulRange, propellantReserve, vehicleHealth } from './range';
import { farmUsableKg } from './propellant';

const STATION_TICKS = T(cdData.stationSampleS);
const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Live stations, weather forced (MANUAL) so tests control the wind. */
function stationsSetup(opts: Parameters<typeof mvpSetup>[0] = {}) {
  return mvpSetup({ ...opts, config: { stations: 'LIVE', weather: 'MANUAL', anomalies: false } });
}

function stationOf(s: ReturnType<typeof mvpSetup>, st: 'WEATHER' | 'RANGE' | 'PROPELLANT' | 'VEHICLE' | 'PAD_CREW') {
  const r = s.world.range[s.cd.id]?.stations[st];
  if (!r) throw new Error('no reading');
  return r;
}

describe('boat and van FSM tables', () => {
  it.each<[BoatState, string, BoatState | null]>([
    ['DOCKED', 'undock', 'PATROL'],
    ['PATROL', 'dispatch', 'INTERCEPT'],
    ['INTERCEPT', 'intercepted', 'ESCORT'],
    ['ESCORT', 'escortDone', 'RETURNING'],
    ['RETURNING', 'onLoop', 'PATROL'],
    ['IN_AREA', 'intercepted', 'INTERCEPTED'],
    ['INTERCEPTED', 'leave', 'LEAVING'],
    ['PATROL', 'intercepted', null],
    ['ON_STATION', 'dispatch', null],
    ['LEAVING', 'leave', null],
  ])('boat %s --%s--> %s', (from, on, to) => {
    const { world, ids } = mvpSetup();
    const b = entity(world, id(ids, 'PK-03'), 'boat');
    b.fsm.state = from;
    expect(boatFsm.fire(b.fsm, on as never, { world, e: b })?.to ?? null).toBe(to);
    expect(world.outbox).toHaveLength(to ? 1 : 0);
  });

  it.each<[VanState, string, VanState | null]>([
    ['AT_PAD', 'toSafe', 'TO_SAFE'],
    ['TO_SAFE', 'arrived', 'PARKED'],
    ['PARKED', 'toPad', 'TO_PAD'],
    ['TO_PAD', 'arrived', 'AT_PAD'],
    ['AT_PAD', 'arrived', null],
    ['PARKED', 'toSafe', null],
  ])('van %s --%s--> %s', (from, on, to) => {
    const { world, ids } = mvpSetup();
    const v = entity(world, id(ids, 'CV-01'), 'van');
    v.fsm.state = from;
    expect(vanFsm.fire(v.fsm, on as never, { world, e: v })?.to ?? null).toBe(to);
  });

  it('list every state', () => {
    expect(boatFsm.states).toEqual(BOAT_STATES);
    expect(vanFsm.states).toEqual(VAN_STATES);
  });
});

describe('PICKET patrols (AC 26)', () => {
  it('spawn on patrol; RV-1 holds on station', () => {
    const { world, ids } = mvpSetup();
    expect(entity(world, id(ids, 'PK-03'), 'boat')).toMatchObject({ role: 'picket', fsm: { state: 'PATROL' } });
    expect(entity(world, id(ids, 'PK-04'), 'boat').route?.pathId).toBe('pk04.patrol');
    expect(entity(world, id(ids, 'RV-1'), 'boat')).toMatchObject({ role: 'recovery', fsm: { state: 'ON_STATION' } });
  });

  it('loop at the patrol speed and wrap after one lap', () => {
    const { world, ids } = mvpSetup();
    const pk = entity(world, id(ids, 'PK-03'), 'boat');
    run(world, T(100));
    const p = pointAt('pk03.patrol', T(100) * ld.picketPatrolSpeedMPerS * (1 / 30));
    expect(pk.pos.x).toBeCloseTo(p.pos.x, 6);
    expect(pk.pos.z).toBeCloseTo(p.pos.z, 6);
    const lapTicks = Math.ceil(pathLengthM('pk03.patrol') / (ld.picketPatrolSpeedMPerS / 30) - 1e-9);
    run(world, lapTicks - T(100));
    expect(pk.route?.movedTicks).toBe(0);
    const start = lc1Layout.paths['pk03.patrol'].points[0];
    expect(dist(pk.pos, start ?? pk.pos)).toBeLessThan(1e-6);
  });
});

describe('A1 intruder: foulRange, intercept, escort (GDD §7.2)', () => {
  function fouled(seed = 3) {
    const s = stationsSetup({ seed });
    const intruderId = foulRange(s.world, rng(s.world, 'anomaly'));
    if (!intruderId) throw new Error('not fouled');
    const intruder = entity(s.world, intruderId, 'boat');
    const picket = entity(s.world, intruder.targetId ?? '', 'boat');
    return { ...s, intruder, picket };
  }

  it('spawns UNK-01 inside AREA BRAVO 4–12 km from the dispatched (nearest) picket', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { world, intruder, picket, ids } = fouled(seed);
      expect(intruder.callSign).toBe('UNK-01');
      expect(intruder.fsm.state).toBe('IN_AREA');
      const area = lc1Layout.maritimeHazardArea;
      expect(intruder.pos.x).toBeGreaterThanOrEqual(Math.min(...area.map((p) => p.x)));
      expect(intruder.pos.x).toBeLessThanOrEqual(Math.max(...area.map((p) => p.x)));
      expect(intruder.pos.z).toBeGreaterThanOrEqual(Math.min(...area.map((p) => p.z)));
      expect(intruder.pos.z).toBeLessThanOrEqual(Math.max(...area.map((p) => p.z)));
      const d = dist(picket.leg?.from ?? picket.pos, intruder.pos);
      expect(d).toBeGreaterThanOrEqual(an.A1.intruderDistanceMinM - 1e-6);
      expect(d).toBeLessThanOrEqual(an.A1.intruderDistanceMaxM + 1e-6);
      expect(picket.fsm.state).toBe('INTERCEPT');
      const other = entity(world, id(ids, picket.callSign === 'PK-03' ? 'PK-04' : 'PK-03'), 'boat');
      expect(dist(picket.leg?.from ?? picket.pos, intruder.pos)).toBeLessThanOrEqual(dist(other.pos, intruder.pos));
    }
  });

  it('refuses a second intruder and needs a patrolling picket', () => {
    const { world } = fouled();
    expect(foulRange(world, rng(world, 'anomaly'))).toBeNull();
    const s = mvpSetup();
    for (const b of Object.values(s.world.entities.byId))
      if (b.kind === 'boat' && b.role === 'picket') b.fsm.state = 'DOCKED';
    expect(foulRange(s.world, rng(s.world, 'anomaly'))).toBeNull();
  });

  it('RANGE NO-GO with the intercept ETA → escort 300 s → despawn → MARGINAL (repositioning) → GO', () => {
    const f = fouled(4);
    const d = dist(f.picket.pos, f.intruder.pos);
    const eta = Math.ceil(d / (ld.picketSpeedMPerS / 30) - 1e-9);
    const log = run(f.world, STATION_TICKS);
    expect(stationOf(f, 'RANGE')).toMatchObject({ status: 'NO_GO', driver: 'INTRUDER' });
    expect(stationOf(f, 'RANGE').value).toBeGreaterThan(d / ld.picketSpeedMPerS - 1);
    log.push(...runUntil(f.world, () => f.picket.fsm.state === 'ESCORT'));
    const intercepted = log.find((e) => e.t === 'EntityStateChanged' && e.id === f.picket.id && e.to === 'ESCORT');
    expect(intercepted?.tick).toBe(eta - 1);
    expect(f.intruder.fsm.state).toBe('INTERCEPTED');
    log.push(...runUntil(f.world, () => f.picket.fsm.state === 'RETURNING'));
    const gone = log.find((e) => e.t === 'Despawned');
    expect(gone).toMatchObject({ callSign: 'UNK-01' });
    expect((gone?.tick ?? 0) - (intercepted?.tick ?? 0)).toBe(T(an.A1.clearAfterInterceptS));
    run(f.world, STATION_TICKS);
    expect(stationOf(f, 'RANGE')).toMatchObject({ status: 'MARGINAL', driver: 'PICKET_REPOSITIONING' });
    log.push(...runUntil(f.world, () => f.picket.fsm.state === 'PATROL'));
    run(f.world, STATION_TICKS);
    expect(stationOf(f, 'RANGE').status).toBe('GO');
    const ranges = log.flatMap((e) => (e.t === 'StationChanged' && e.station === 'RANGE' ? [e.status] : []));
    expect(ranges).toEqual<GoStatus[]>(['NO_GO', 'MARGINAL', 'GO']);
  });
});

describe('crew vans and PAD/CREW (GDD §4.11)', () => {
  it('leave the pad at T-01:30:00, staggered, and are out of the hazard radius by T-01:20:00', () => {
    const s = stationsSetup({ startTS: cdData.crew.vanDepartTS - 10, prepped: true });
    const vans = ['CV-01', 'CV-02', 'CV-03'].map((c) => entity(s.world, id(s.ids, c), 'van'));
    const log = runUntil(s.world, () => s.cd.tClockTicks >= T(cdData.crewPadClearByTS));
    const departs = log.flatMap((e) => (e.t === 'EntityStateChanged' && e.to === 'TO_SAFE' ? [e.tick] : []));
    expect(departs).toHaveLength(3);
    expect((departs[1] ?? 0) - (departs[0] ?? 0)).toBe(T(cdData.crew.vanStaggerS));
    for (const v of vans) {
      expect(v.fsm.state).toBe('PARKED');
      expect(dist(v.pos, lc1Layout.points.olm1)).toBeGreaterThan(ld.hazardPadRadiusM);
    }
    run(s.world, STATION_TICKS);
    expect(stationOf(s, 'PAD_CREW').status).toBe('GO');
  });

  it('NO-GO when a van is inside the hazard radius after the clear-by mark', () => {
    const s = stationsSetup({ startTS: cdData.crewPadClearByTS + 10, prepped: true });
    const v = entity(s.world, id(s.ids, 'CV-02'), 'van');
    v.pos = { ...lc1Layout.points.crewPadParking };
    run(s.world, STATION_TICKS);
    expect(stationOf(s, 'PAD_CREW')).toMatchObject({ status: 'NO_GO', driver: 'CREW_IN_HAZARD' });
  });

  it('MARGINAL near the shift limit, NO-GO over it; the shift clock runs during holds', () => {
    const s = stationsSetup({ startTS: -20_000 });
    step(s.world, [{ t: 'Hold', countdownId: s.cd.id }]);
    const c = cdData.crew;
    s.cd.createdTick -= T(c.marginalFromS - c.elapsedAtStartS);
    run(s.world, STATION_TICKS);
    expect(stationOf(s, 'PAD_CREW')).toMatchObject({ status: 'MARGINAL', driver: 'CREW_SHIFT' });
    expect(crewElapsedS(s.world, s.cd)).toBeGreaterThanOrEqual(c.marginalFromS);
    s.cd.createdTick -= T(c.shiftLimitS - c.marginalFromS);
    run(s.world, STATION_TICKS);
    expect(stationOf(s, 'PAD_CREW')).toMatchObject({ status: 'NO_GO', driver: 'CREW_SHIFT' });
  });

  it('drive back to the pad once the attempt is over', () => {
    const s = stationsSetup({ startTS: cdData.crew.vanDepartTS + 600, prepped: true });
    const v = entity(s.world, id(s.ids, 'CV-01'), 'van');
    runUntil(s.world, () => v.fsm.state === 'PARKED');
    s.cd.phase.state = 'Debrief';
    runUntil(s.world, () => v.fsm.state === 'AT_PAD');
    expect(dist(v.pos, lc1Layout.points.crewPadParking)).toBeLessThan(1e-6);
  });
});

describe('WEATHER station', () => {
  const L = wx.launchLimit;
  function at(ground: number, upper: number, prev?: GoStatus) {
    const s = stationsSetup({ startTS: -20_000 });
    if (prev) s.cd.inputs.stations.WEATHER = prev;
    Object.assign(s.world.weather, { groundWindMPerS: ground, upperWindMPerS: upper });
    step(s.world);
    return stationOf(s, 'WEATHER');
  }

  it.each<[number, number, GoStatus, StationDriver]>([
    [7, 35, 'GO', 'NOMINAL'],
    [L.groundWindMPerS * 0.86, 35, 'MARGINAL', 'GROUND_WIND'],
    [L.groundWindMPerS + 0.1, 35, 'NO_GO', 'GROUND_WIND'],
    [7, L.upperWindMPerS * 0.9, 'MARGINAL', 'UPPER_WIND'],
    [7, L.upperWindMPerS + 1, 'NO_GO', 'UPPER_WIND'],
    [L.groundWindMPerS * 0.9, L.upperWindMPerS + 1, 'NO_GO', 'UPPER_WIND'],
  ])('ground %f, upper %f → %s (%s)', (g, u, status, driver) => {
    expect(at(g, u)).toMatchObject({ status, driver });
  });

  it('has a deadband: a worse status holds until the value is clear by the hysteresis', () => {
    const marginalAt = L.groundWindMPerS * (1 - cdData.marginalBand);
    const h = cdData.stationHysteresisFraction * L.groundWindMPerS;
    expect(at(marginalAt - h / 2, 35, 'MARGINAL').status).toBe('MARGINAL');
    expect(at(marginalAt - h * 1.5, 35, 'MARGINAL').status).toBe('GO');
    expect(at(L.groundWindMPerS - h / 2, 35, 'NO_GO').status).toBe('NO_GO');
    expect(at(marginalAt - h / 2, 35, 'GO').status).toBe('GO');
  });

  it('MARGINAL when a known front is forecast over the upper limit before the window closes', () => {
    const s = stationsSetup({ startTS: -20_000 });
    Object.assign(s.world.weather, { groundWindMPerS: 7, upperWindMPerS: 44, upperDevMPerS: 15, initialized: true });
    s.world.weather.front = { arrivalTick: s.world.tick, durationTicks: T(3_000) };
    step(s.world);
    expect(stationOf(s, 'WEATHER')).toMatchObject({ status: 'MARGINAL', driver: 'FORECAST_UPPER_WIND' });
  });
});

describe('PROPELLANT station (farm reserve)', () => {
  it('MVP start: MARGINAL on LOX (reserve < 1 hold-hour), and the estimate matches the real T-0 reserve', () => {
    const s = stationsSetup({ prepped: true, startTS: -5_000 });
    run(s.world, STATION_TICKS);
    const r = stationOf(s, 'PROPELLANT');
    expect(r).toMatchObject({ status: 'MARGINAL', driver: 'FARM_RESERVE_LOX', limit: pd.stationMarginalBelowToppingS });
    const est = propellantReserve(s.world, s.cd, 'LOX').reserveKg;
    // Run the nominal count to T-0 with GO at every poll (no holds) and compare.
    runUntil(s.world, () => {
      if (s.cd.clock.state === 'Holding') step(s.world, [{ t: 'Go', countdownId: s.cd.id }]);
      return s.cd.tClockTicks >= -1;
    });
    const actual = farmUsableKg(s.world, 'LOX');
    expect(Math.abs(est - actual)).toBeLessThan(2_000);
  });

  it('GO with a full farm, NO-GO when the farm cannot finish the load', () => {
    const s = stationsSetup({ prepped: true, startTS: -5_000 });
    for (const tid of s.world.logistics.farm.LOX) entity(s.world, tid, 'tank').massKg = pd.farm.loxTankCapKg;
    for (const tid of s.world.logistics.farm.CH4) entity(s.world, tid, 'tank').massKg = pd.farm.ch4TankCapKg;
    run(s.world, STATION_TICKS);
    expect(stationOf(s, 'PROPELLANT')).toMatchObject({ status: 'GO', driver: 'NOMINAL' });
    for (const tid of s.world.logistics.farm.CH4) entity(s.world, tid, 'tank').massKg = 400_000;
    run(s.world, STATION_TICKS);
    expect(stationOf(s, 'PROPELLANT')).toMatchObject({ status: 'NO_GO', driver: 'FARM_RESERVE_CH4' });
    expect(stationOf(s, 'PROPELLANT').value).toBeLessThan(0);
  });

  it('a NO-GO in PropellantLoad auto-holds the count (AC 10–11)', () => {
    const s = stationsSetup({ prepped: true, startTS: -4_700, phase: 'PropellantLoad', pollsPassed: ['load'] });
    for (const tid of s.world.logistics.farm.LOX) entity(s.world, tid, 'tank').massKg = 500_000;
    const log = run(s.world, STATION_TICKS + 1);
    expect(log.find((e) => e.t === 'HoldStarted')).toMatchObject({ reason: 'NO_GO' });
  });
});

describe('VEHICLE station', () => {
  it('GO for B-09 (health 1 − 0.5·wear), MARGINAL on a worn booster or an active GSE leak', () => {
    const s = stationsSetup();
    run(s.world, STATION_TICKS);
    expect(vehicleHealth(s.world, s.cd)).toBeCloseTo(1 - vehicles.healthLossPerWear * vehicles.mvpBooster.wear, 12);
    expect(stationOf(s, 'VEHICLE').status).toBe('GO');
    entity(s.world, s.cd.boosterId, 'booster').wear = 0.5;
    run(s.world, STATION_TICKS);
    expect(stationOf(s, 'VEHICLE')).toMatchObject({ status: 'MARGINAL', driver: 'VEHICLE_HEALTH' });
    entity(s.world, s.cd.boosterId, 'booster').wear = 0;
    const st = newAnomalyState();
    st.leak.active = true;
    s.world.anomalies[s.cd.id] = st;
    run(s.world, STATION_TICKS);
    expect(stationOf(s, 'VEHICLE')).toMatchObject({ status: 'MARGINAL', driver: 'GSE_LEAK' });
  });
});

describe('station bookkeeping', () => {
  it('evaluates at 10 Hz, emits StationChanged only on a status change', () => {
    const s = stationsSetup({ startTS: -20_000 });
    const log = run(s.world, 30);
    // Start: PROPELLANT MARGINAL (one event); nothing else changes in calm MANUAL weather.
    expect(log.filter((e) => e.t === 'StationChanged')).toEqual([
      expect.objectContaining({ station: 'PROPELLANT', status: 'MARGINAL', tick: 0 }),
    ]);
    s.world.weather.groundWindMPerS = 20;
    const more = run(s.world, STATION_TICKS);
    expect(more.filter((e) => e.t === 'StationChanged')).toHaveLength(1);
    expect(s.cd.inputs.stations.WEATHER).toBe('NO_GO');
  });

  it('MANUAL stations are left to the caller', () => {
    const s = mvpSetup();
    s.cd.inputs.stations.RANGE = 'NO_GO';
    run(s.world, 10);
    expect(s.cd.inputs.stations.RANGE).toBe('NO_GO');
    expect(s.world.range).toEqual({});
  });

  it('live run: deterministic and only GO/MARGINAL/NO_GO values', () => {
    const a = liveSetup({ seed: 9, startTS: -8_000, prepped: true });
    const b = liveSetup({ seed: 9, startTS: -8_000, prepped: true });
    const la = run(a.world, T(1_200));
    const lb = run(b.world, T(1_200));
    expect(la).toEqual(lb);
    for (const v of Object.values(a.cd.inputs.stations)) expect(['GO', 'MARGINAL', 'NO_GO']).toContain(v);
  });
});
