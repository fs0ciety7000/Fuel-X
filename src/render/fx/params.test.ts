import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  DELUGE,
  FX_CAPACITY,
  delugeActive,
  engineRanks,
  FALLBACK_WIND,
  exhaustDriftShare,
  litCount,
  plumeShape,
  plumeThrottle,
  windDrift,
  selectionRadiusM,
  wakeLengthM,
} from './params';
import { buildPlumeBuffers, engineCluster } from './plume';
import { buildSteamBuffers } from './steam';

describe('fx params', () => {
  it('lights the booster centre and inner engines first and drops outer engines spread around the ring', () => {
    const r = engineRanks(33);
    expect(new Set(r).size).toBe(33);
    // landing burn (3) = sockets 01–03, boostback (13) = 01–13
    expect(r.slice(0, 3)).toEqual([0, 1, 2]);
    expect(r.slice(0, 13).every((v) => v < 13)).toBe(true);
    // first two engine-outs are opposite sides of the outer ring (k = 0 and k = 10 of 20)
    const outerDark = (lit: number) => r.flatMap((v, i) => (v >= lit ? [i - 13] : []));
    expect(outerDark(32)).toEqual([0]);
    expect(outerDark(31).sort((a, b) => a - b)).toEqual([0, 10]);
    expect(engineRanks(6)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('maps litFrac to an engine count', () => {
    expect(litCount(1, 33)).toBe(33);
    expect(litCount(32 / 33, 33)).toBe(32);
    expect(litCount(3 / 33, 33)).toBe(3);
    expect(litCount(0, 33)).toBe(0);
    expect(litCount(1.5, 6)).toBe(6);
  });

  it('shrinks the plume on engine-out and expands it with altitude', () => {
    const full = plumeShape(33, 33, 4.6, 0);
    const out = plumeShape(31, 33, 4.6, 0);
    const landing = plumeShape(3, 33, 4.6, 1_000);
    const high = plumeShape(33, 33, 4.6, 40_000);
    expect(out.r0M).toBeLessThan(full.r0M);
    expect(out.keep).toBeLessThan(full.keep);
    expect(landing.lengthM).toBeLessThan(full.lengthM);
    expect(high.lengthM).toBeGreaterThan(4 * full.lengthM);
    expect(high.rEndM).toBeGreaterThan(4 * full.rEndM);
    expect(plumeShape(0, 33, 4.6, 0).keep).toBe(0);
  });

  it('shortens the plume when throttled down and treats an unwritten throttle as full', () => {
    const full = plumeShape(33, 33, 4.6, 0, 1);
    const bucket = plumeShape(33, 33, 4.6, 0, 0.7);
    expect(plumeShape(33, 33, 4.6, 0)).toEqual(full);
    expect(bucket.lengthM).toBeLessThan(full.lengthM);
    expect(bucket.keep).toBeLessThan(full.keep);
    expect(plumeShape(33, 33, 4.6, 0, 0).lengthM).toBeCloseTo(0.55 * full.lengthM, 6);
    expect(plumeThrottle(0, 33)).toBe(1);
    expect(plumeThrottle(0.7, 33)).toBe(0.7);
    expect(plumeThrottle(0, 0)).toBe(0);
  });

  it('drifts steam downwind of world.weather.windFromRad (meteorological from, site +x east / −z north)', () => {
    const out = { x: 0, z: 0 };
    // wind from the north (0): air moves south = +z
    windDrift(0, 10, out);
    expect(out.x).toBeCloseTo(0, 9);
    expect(out.z).toBeCloseTo(4, 9);
    // wind from the east (π/2): air moves west = −x, clamped speed
    windDrift(Math.PI / 2, 40, out);
    expect(out.x).toBeCloseTo(-6, 9);
    expect(out.z).toBeCloseTo(0, 9);
    // calm still drifts a little
    windDrift(Math.PI, 0.1, out);
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(0.8, 9);
    // channels unwritten: the pre-5.10 breeze from 95° at 2.5 m/s (west, slightly north)
    windDrift(0, 0, out);
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(FALLBACK_WIND.driftMPerS, 9);
    expect(out.x).toBeLessThan(0);
    expect(exhaustDriftShare(0)).toBe(1);
    expect(exhaustDriftShare(5_000)).toBe(0);
  });

  it('runs the deluge from T-3 s and clears it by ~T+20 s', () => {
    expect(delugeActive(-10)).toBe(false);
    expect(delugeActive(DELUGE.waterFromS)).toBe(true);
    expect(delugeActive(3)).toBe(true);
    expect(delugeActive(DELUGE.endS + 1)).toBe(false);
    expect(DELUGE.endS).toBeGreaterThanOrEqual(18);
    expect(DELUGE.endS).toBeLessThanOrEqual(25);
  });

  it('sizes wakes and selection rings', () => {
    expect(wakeLengthM(0)).toBe(0);
    expect(wakeLengthM(5)).toBe(225);
    expect(wakeLengthM(100)).toBe(600);
    expect(selectionRadiusM({ min: [-3, 0, -3], max: [3, 29, 4] })).toBeCloseTo(6.8, 6);
    expect(selectionRadiusM({ min: [-1, 0, -1], max: [1, 1, 1] })).toBe(6);
  });

  it('stays inside the 20 k sprite budget with deterministic buffers', () => {
    const engines = Array.from({ length: 33 }, (_, i) => new Vector3(Math.cos(i), -0.5, Math.sin(i)));
    const ship = Array.from({ length: 6 }, (_, i) => new Vector3(i, -0.3, 0));
    const a = buildPlumeBuffers([
      { engines, body: FX_CAPACITY.boosterBody },
      { engines: ship, body: FX_CAPACITY.shipBody },
    ]);
    const b = buildPlumeBuffers([
      { engines, body: FX_CAPACITY.boosterBody },
      { engines: ship, body: FX_CAPACITY.shipBody },
    ]);
    expect(a.aSeed).toEqual(b.aSeed);
    const pad = { deluge: [new Vector3(9, 20, 0)], trench: new Vector3(0, 1, 48) };
    const s = buildSteamBuffers(pad);
    expect(s.aSeed).toEqual(buildSteamBuffers(pad).aSeed);
    expect(a.count + s.count).toBeLessThanOrEqual(20_000);
    expect(engineCluster(engines).planeY).toBeCloseTo(-0.5, 6);
  });
});
