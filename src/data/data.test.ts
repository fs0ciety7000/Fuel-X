import { describe, expect, it } from 'vitest';
import {
  anomalies,
  countdown,
  flightProfile,
  lc1Layout,
  logistics,
  mvpContract,
  mvpFlight,
  propellant,
  time,
  vehicles,
} from './index';
import type { SitePath, V3 } from './index';

const dist = (a: V3, b: V3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function pathLength(p: SitePath): number {
  let len = 0;
  const pts = p.closed ? [...p.points, ...p.points.slice(0, 1)] : p.points;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1] as V3, pts[i] as V3);
  return len;
}

function allNumbers(value: unknown, path = '$'): [string, number][] {
  if (typeof value === 'number') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => allNumbers(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => allNumbers(v, `${path}.${k}`));
  }
  return [];
}

describe('balancing data', () => {
  it('contains only finite numbers', () => {
    const all = allNumbers({ anomalies, countdown, flightProfile, lc1Layout, logistics, propellant, time, vehicles });
    expect(all.length).toBeGreaterThan(100);
    for (const [path, n] of all) expect(Number.isFinite(n), path).toBe(true);
  });

  it('derived LOX/CH4 capacities match propMass and the O/F ratio (±0.1 %)', () => {
    const of = vehicles.mixtureRatioOF;
    for (const stage of [vehicles.booster, vehicles.ship]) {
      expect(stage.loxCapKg + stage.ch4CapKg).toBe(stage.propMassKg);
      expect(Math.abs(stage.loxCapKg - (stage.propMassKg * of) / (1 + of)) / stage.loxCapKg).toBeLessThan(1e-3);
    }
  });

  it('MVP farm start fits the farm and covers a nominal load', () => {
    const f = propellant.farm;
    expect(propellant.mvpStart.farmLoxKg).toBeLessThanOrEqual(f.loxTankCount * f.loxTankCapKg);
    expect(propellant.mvpStart.farmCh4Kg).toBeLessThanOrEqual(f.ch4TankCount * f.ch4TankCapKg);
    expect(propellant.mvpStart.farmLoxKg).toBeGreaterThan(vehicles.booster.loxCapKg + vehicles.ship.loxCapKg);
    expect(propellant.mvpStart.farmCh4Kg).toBeGreaterThan(vehicles.booster.ch4CapKg + vehicles.ship.ch4CapKg);
  });

  it('countdown marks are ordered and the window allows the planned T-0', () => {
    const p = countdown.pollTS;
    expect(countdown.scenarioStartTS).toBeLessThan(p.load);
    expect(p.load).toBeLessThan(countdown.loadStartTS);
    expect(countdown.loadStartTS).toBeLessThan(p.terminal);
    expect(p.terminal).toBeLessThan(countdown.loadMustCompleteByTS);
    expect(countdown.loadMustCompleteByTS).toBeLessThan(p.final);
    expect(countdown.recycleToTS).toBe(p.terminal);
    expect(mvpContract.windowOpenTS).toBeLessThanOrEqual(0);
    expect(mvpContract.windowOpenTS + mvpContract.windowDurationS).toBeGreaterThan(0);
    const ms = countdown.milestones.map((m) => m.tS);
    expect([...ms].sort((a, b) => a - b)).toEqual(ms);
  });

  it('flight keyframes are time-ordered and director weights sum to 1', () => {
    const ts = flightProfile.booster.map((k) => k.tS);
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
    const w = Object.values(anomalies.director.weights).reduce((s, x) => s + x, 0);
    expect(w).toBeCloseTo(1, 9);
  });

  it('time caps only use allowed rates', () => {
    for (const s of Object.values(time.maxTimeScaleByPhase)) expect(time.timeScales).toContain(s);
  });
});

describe('LC-1 layout', () => {
  const { placements, paths, points } = lc1Layout;

  it('has every MVP call-sign exactly once (GDD §13.1)', () => {
    const signs = placements.map((p) => p.callSign);
    expect(new Set(signs).size).toBe(signs.length);
    const expected = [
      'TOWER-1',
      'OLM-1',
      'LOX-1',
      'LOX-2',
      'LOX-3',
      'CH4-1',
      'CH4-2',
      'LN2-1',
      'HB-1',
      'TH-1',
      'B-09',
      'S-21',
      'SP-41',
      'SP-42',
      'CR-77',
      'LX-01',
      'LX-02',
      'LX-03',
      'LX-04',
      'MX-01',
      'MX-02',
      'CV-01',
      'CV-02',
      'CV-03',
      'PK-03',
      'PK-04',
      'RV-1',
      'WX-1',
      'WX-2',
    ];
    expect([...signs].sort()).toEqual([...expected].sort());
    for (const s of [mvpFlight.booster, mvpFlight.ship, mvpFlight.tower, mvpFlight.mount]) expect(signs).toContain(s);
  });

  it('tank and fleet counts match the balancing data', () => {
    const count = (prefix: string): number => placements.filter((p) => p.callSign.startsWith(prefix)).length;
    expect(count('LOX-')).toBe(propellant.farm.loxTankCount);
    expect(count('CH4-')).toBe(propellant.farm.ch4TankCount);
    expect(count('LX-')).toBe(logistics.fleet.lx);
    expect(count('MX-')).toBe(logistics.fleet.mx);
  });

  it('SP yard → OLM-1 path length equals routeYardToPadM', () => {
    expect(pathLength(paths['sp.yardToOlm1'])).toBeCloseTo(logistics.routeYardToPadM, 6);
    expect(pathLength(paths['sp.olm1ToYard'])).toBeCloseTo(logistics.routeYardToPadM, 6);
  });

  it('places the gate and crew safe area outside, the farm inside the hazard radius', () => {
    const r = logistics.hazardPadRadiusM;
    expect(dist(points.tankerGate, points.olm1)).toBeGreaterThan(r);
    expect(dist(points.crewSafeArea, points.olm1)).toBeGreaterThan(r);
    expect(dist(points.loxOffloadBay, points.olm1)).toBeLessThan(r);
    expect(dist(points.divertPoint, points.olm1)).toBe(flightProfile.divert.offshoreDistanceM);
    expect(points.catchPoint.y).toBe(flightProfile.booster.at(-1)?.altitudeM);
  });

  it('paths chain into each other and patrol loops are closed', () => {
    expect(paths['tanker.offMapToGate'].points.at(-1)).toEqual(paths['tanker.gateToLoxBay'].points[0]);
    expect(paths['tanker.gateToLoxBay'].points.at(-1)).toEqual(paths['tanker.loxBayToOffMap'].points[0]);
    expect(paths['pk03.patrol'].closed && paths['pk04.patrol'].closed).toBe(true);
    for (const p of Object.values(paths)) expect(p.points.length).toBeGreaterThanOrEqual(2);
  });
});
