// Eased liftoff (5.10) and throttle schedule: pure profile math, SI.
import { flightProfile as fp, siteGeometry as geo } from '@data/index';
import { describe, expect, it } from 'vitest';
import {
  CATCH_PROFILE,
  DIVERT_PROFILE,
  LIFTOFF_CURVE,
  T_CATCH,
  T_LANDING_BURN,
  T_MECO,
  boosterThrottle,
  sampleProfile,
} from './profile';

const G = 9.80665;
/** TOWER tip (lightning mast), m above site ground (ASSETS_GUIDE §2). */
const TOWER_TIP_M = 146;
const T_MAXQ = 62;
const at = (tS: number) => sampleProfile(CATCH_PROFILE, tS);
/** Vertical speed by central difference, m/s. */
const vv = (tS: number, h = 1e-3): number => (at(tS + h).altitudeM - at(tS - h).altitudeM) / (2 * h);

describe('eased liftoff (BALANCING §6, 5.10)', () => {
  it('starts at rest on the mount deck with T/W 1.4–1.5', () => {
    expect(at(0)).toMatchObject({ altitudeM: geo.pad.vehicleMountM, downrangeM: 0, speedMPerS: 0 });
    const a0 = (at(0.01).altitudeM - at(0).altitudeM) / (0.5 * 0.01 * 0.01);
    expect(1 + a0 / G).toBeGreaterThanOrEqual(1.4);
    expect(1 + a0 / G).toBeLessThanOrEqual(1.5);
  });

  it.each([
    // tS, altitude range (origin above ground, m), speed range (m/s)
    [1, 21, 24, 3, 6],
    [3, 35, 45, 11, 17],
    [8, 150, 190, 33, 45],
    [20, 950, 1_150, 95, 125],
  ])('T+%i s: altitude %i–%i m, speed %i–%i m/s', (tS, hLo, hHi, vLo, vHi) => {
    const s = at(tS);
    expect(s.altitudeM).toBeGreaterThanOrEqual(hLo);
    expect(s.altitudeM).toBeLessThanOrEqual(hHi);
    expect(s.speedMPerS).toBeGreaterThanOrEqual(vLo);
    expect(s.speedMPerS).toBeLessThanOrEqual(vHi);
  });

  it('altitude, vertical speed and speed rise monotonically to Max-Q; acceleration rises as propellant burns', () => {
    let prev = at(0);
    let prevVv = 0;
    for (let t = 0.1; t <= T_MAXQ; t += 0.1) {
      const s = at(t);
      expect(s.altitudeM).toBeGreaterThan(prev.altitudeM);
      expect(s.speedMPerS).toBeGreaterThan(prev.speedMPerS);
      expect(s.downrangeM).toBeGreaterThanOrEqual(prev.downrangeM);
      const v = vv(t);
      expect(v).toBeGreaterThan(prevVv);
      prev = s;
      prevVv = v;
    }
    expect(LIFTOFF_CURVE.jerkMPerS3).toBeGreaterThan(0);
  });

  it('clears the tower tip (engine plane above 146 m) at T+7–8 s, rising vertically (no downrange yet)', () => {
    let t = 0;
    while (at(t).altitudeM <= TOWER_TIP_M) t += 1 / 30;
    expect(t).toBeGreaterThanOrEqual(7);
    expect(t).toBeLessThanOrEqual(8);
    expect(at(t).downrangeM).toBe(0);
    expect(at(fp.attitude.verticalRiseS).downrangeM).toBe(0);
  });

  it('meets the Max-Q keyframe exactly (altitude, downrange, speed, propellant), then follows the keyframes', () => {
    const k = CATCH_PROFILE[1];
    const s = at(T_MAXQ);
    expect(s.altitudeM).toBeCloseTo(k?.altitudeM ?? NaN, 6);
    expect(s.downrangeM).toBeCloseTo(k?.downrangeM ?? NaN, 6);
    expect(s.speedMPerS).toBeCloseTo(k?.speedMPerS ?? NaN, 6);
    expect(s.boosterPropKg).toBeCloseTo(k?.boosterPropKg ?? NaN, 6);
    expect(Math.abs(at(T_MAXQ - 1e-6).altitudeM - s.altitudeM)).toBeLessThan(1e-2); // continuous
    expect(at(T_MECO)).toMatchObject({ altitudeM: 68_000, speedMPerS: 1_550 });
    expect(T_MECO).toBe(155);
    expect(T_CATCH).toBe(415);
  });

  it('the divert profile shares the eased liftoff', () => {
    for (const t of [1, 8, 20, 50]) expect(sampleProfile(DIVERT_PROFILE, t)).toEqual(at(t));
  });
});

describe('booster throttle schedule (5.10)', () => {
  const q = fp.throttle.maxQBucket;
  it('full at liftoff, Max-Q bucket with ramps, full in boostback', () => {
    expect(boosterThrottle(0, T_CATCH)).toBe(1);
    expect(boosterThrottle(q.startS - q.rampS, T_CATCH)).toBe(1);
    expect(boosterThrottle(q.startS - q.rampS / 2, T_CATCH)).toBeCloseTo((1 + q.level) / 2, 12);
    expect(boosterThrottle(T_MAXQ, T_CATCH)).toBe(q.level);
    expect(boosterThrottle(q.endS + q.rampS, T_CATCH)).toBe(1);
    expect(boosterThrottle(190, T_CATCH)).toBe(fp.throttle.boostback);
  });

  it('landing burn ramps from landingStart to landingEnd at the end time', () => {
    expect(boosterThrottle(T_LANDING_BURN, T_CATCH)).toBe(fp.throttle.landingStart);
    expect(boosterThrottle(T_CATCH, T_CATCH)).toBeCloseTo(fp.throttle.landingEnd, 12);
    const end = fp.divert.splashdownTS;
    expect(boosterThrottle((T_LANDING_BURN + end) / 2, end)).toBeCloseTo(
      (fp.throttle.landingStart + fp.throttle.landingEnd) / 2,
      12,
    );
  });

  it('stays in [0, 1]', () => {
    for (let t = 0; t <= 420; t += 0.5) {
      const thr = boosterThrottle(t, T_CATCH);
      expect(thr).toBeGreaterThanOrEqual(0);
      expect(thr).toBeLessThanOrEqual(1);
    }
  });
});
