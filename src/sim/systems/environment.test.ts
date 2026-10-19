import { countdown as cdData, weather as wx } from '@data/index';
import { describe, expect, it } from 'vitest';
import { secondsToTicks as T } from '../core/time';
import { LIVE_CONFIG, createWorld } from '../core/world';
import type { World } from '../core/world';
import { step } from '../step';
import {
  environmentSystem,
  frontActive,
  frontBoostAt,
  peakUpperForecast,
  startFrontNow,
  weatherForecast,
} from './environment';

const liveWorld = (seed = 1): World => createWorld({ seed, config: LIVE_CONFIG });

describe('environment: weather series (GDD §4.10)', () => {
  it('MANUAL leaves forced readings untouched', () => {
    const w = createWorld({ seed: 1 });
    w.weather.groundGustMPerS = 14;
    step(w);
    expect(w.weather.groundGustMPerS).toBe(14);
    expect(w.weather.initialized).toBe(false);
  });

  it('SERIES writes gust and tower wind as fixed factors of the ground wind', () => {
    const w = liveWorld();
    for (let i = 0; i < 100; i++) environmentSystem(w);
    const g = w.weather.groundWindMPerS;
    expect(g).toBeGreaterThan(0);
    expect(w.weather.groundGustMPerS).toBeCloseTo(g * wx.groundWind.gustFactor, 12);
    expect(w.weather.towerWindMPerS).toBeCloseTo(g * wx.groundWind.towerFactor, 12);
  });

  it('is deterministic per seed and differs between seeds', () => {
    const a = liveWorld(5);
    const b = liveWorld(5);
    const c = liveWorld(6);
    for (let i = 0; i < 1_000; i++) [a, b, c].forEach(environmentSystem);
    expect(a.weather).toEqual(b.weather);
    expect(c.weather.groundWindMPerS).not.toBe(a.weather.groundWindMPerS);
  });

  it('ground and upper winds have the configured mean and spread (OU, long run)', () => {
    const w = liveWorld(11);
    w.weather.initialized = true; // skip the front roll: pure OU
    const n = T(40 * wx.upperWind.tauS);
    let gs = 0;
    let gs2 = 0;
    let us = 0;
    for (let i = 0; i < n; i++) {
      environmentSystem(w);
      gs += w.weather.groundWindMPerS;
      gs2 += w.weather.groundWindMPerS ** 2;
      us += w.weather.upperWindMPerS;
    }
    const gMean = gs / n;
    expect(gMean).toBeCloseTo(wx.groundWind.meanMPerS, 0);
    expect(Math.sqrt(gs2 / n - gMean ** 2)).toBeGreaterThan(wx.groundWind.sdMPerS * 0.7);
    expect(Math.sqrt(gs2 / n - gMean ** 2)).toBeLessThan(wx.groundWind.sdMPerS * 1.3);
    expect(Math.abs(us / n - wx.upperWind.meanMPerS)).toBeLessThan(3);
  });

  it('rolls a natural front in ≈ the configured share of runs, inside the arrival band', () => {
    let fronts = 0;
    for (let seed = 0; seed < 400; seed++) {
      const w = liveWorld(seed);
      environmentSystem(w);
      const f = w.weather.front;
      if (!f) continue;
      fronts++;
      const ts = f.arrivalTick / 30 + cdData.scenarioStartTS;
      expect(ts).toBeGreaterThanOrEqual(wx.front.arrivalEarliestTS - 1);
      expect(ts).toBeLessThanOrEqual(wx.front.arrivalLatestTS + 1);
    }
    expect(fronts / 400).toBeGreaterThan(wx.front.probabilityPerRun - 0.08);
    expect(fronts / 400).toBeLessThan(wx.front.probabilityPerRun + 0.08);
  });
});

describe('front (A2 driver)', () => {
  const front = { arrivalTick: 100, durationTicks: T(2_400) };
  const B = wx.front.upperWindBoostMPerS;
  const ramp = T(wx.front.rampS);

  it('is a trapezoid: ramp up, plateau, ramp down', () => {
    expect(frontBoostAt(null, 500)).toBe(0);
    expect(frontBoostAt(front, 100)).toBe(0);
    expect(frontBoostAt(front, 100 + ramp / 2)).toBeCloseTo(B / 2, 9);
    expect(frontBoostAt(front, 100 + ramp + 10)).toBe(B);
    expect(frontBoostAt(front, 100 + ramp + front.durationTicks + ramp / 2)).toBeCloseTo(B / 2, 9);
    expect(frontBoostAt(front, 100 + 2 * ramp + front.durationTicks)).toBe(0);
  });

  it('adds to the upper wind only', () => {
    const w = liveWorld();
    environmentSystem(w);
    w.weather.front = { arrivalTick: w.tick - ramp - 1, durationTicks: T(3_000) };
    const ground = w.weather.groundDevMPerS;
    environmentSystem(w);
    expect(w.weather.frontBoostMPerS).toBe(B);
    expect(w.weather.upperWindMPerS).toBeCloseTo(wx.upperWind.meanMPerS + w.weather.upperDevMPerS + B, 9);
    expect(Math.abs(w.weather.groundDevMPerS - ground)).toBeLessThan(0.2);
  });

  it('startFrontNow replaces a pending or passed front, keeps one already blowing', () => {
    const w = liveWorld();
    w.tick = 1_000;
    w.weather.front = { arrivalTick: 5_000, durationTicks: 10 };
    expect(startFrontNow(w)).toBe(true);
    expect(w.weather.front.arrivalTick).toBe(1_000);
    w.tick = 1_100;
    expect(frontActive(w)).toBe(true);
    expect(startFrontNow(w)).toBe(false);
    w.tick = 1_000 + 2 * ramp + w.weather.front.durationTicks + 1;
    expect(frontActive(w)).toBe(false);
    expect(startFrontNow(w)).toBe(true);
  });
});

describe('forecast', () => {
  it('decays toward the mean, band grows with lead time', () => {
    const w = liveWorld();
    w.weather.initialized = true;
    w.weather.upperDevMPerS = 10;
    w.weather.groundDevMPerS = -3;
    const now = weatherForecast(w, 0);
    const later = weatherForecast(w, wx.upperWind.tauS);
    expect(now.upper.meanMPerS).toBeCloseTo(45, 9);
    expect(later.upper.meanMPerS).toBeCloseTo(35 + 10 / Math.E, 9);
    expect(now.upper.bandMPerS).toBe(0);
    expect(later.upper.bandMPerS).toBeCloseTo(wx.forecast.errorGrowthMPerSPerS * wx.upperWind.tauS, 12);
    expect(weatherForecast(w, 1e6).ground.meanMPerS).toBeCloseTo(wx.groundWind.meanMPerS, 6);
  });

  it('does not forecast a front before it arrives; the peak includes a known front', () => {
    const w = liveWorld();
    w.weather.initialized = true;
    w.tick = 10_000;
    w.weather.front = { arrivalTick: 20_000, durationTicks: T(3_000) };
    expect(peakUpperForecast(w, 1_000_000)).toBeCloseTo(wx.upperWind.meanMPerS, 9);
    w.weather.front.arrivalTick = 9_000;
    const peak = peakUpperForecast(w, 1_000_000);
    expect(peak).toBeGreaterThan(wx.upperWind.meanMPerS + wx.front.upperWindBoostMPerS - 0.01);
    // Plateau after the window close does not count.
    expect(peakUpperForecast(w, 10_001)).toBeLessThan(peak);
  });
});

describe('wind direction (5.10, meteorological "from", rad)', () => {
  const MEAN = (wx.groundWind.fromDeg * Math.PI) / 180;
  const LIMIT = wx.windDirection.clampSd * wx.windDirection.sdRad;
  /** Signed angular distance a − b, wrapped to (−π, π]. */
  const angDiff = (a: number, b: number): number => {
    const d = (((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI);
    return d - Math.PI;
  };

  it('starts on the mean bearing; MANUAL leaves it as written', () => {
    const w = createWorld({ seed: 1 });
    expect(w.weather.windFromRad).toBeCloseTo(MEAN, 12);
    w.weather.windFromRad = 1;
    step(w);
    expect(w.weather.windFromRad).toBe(1);
  });

  it('is deterministic per seed, differs between seeds, and does not touch the wind-speed stream', () => {
    const a = liveWorld(5);
    const b = liveWorld(5);
    const c = liveWorld(6);
    const speeds: number[] = [];
    for (let i = 0; i < 2_000; i++) {
      [a, b, c].forEach(environmentSystem);
      speeds.push(a.weather.groundWindMPerS);
    }
    expect(a.weather.windFromRad).toBe(b.weather.windFromRad);
    expect(c.weather.windFromRad).not.toBe(a.weather.windFromRad);
    // Same speed series with the direction stream perturbed: the direction lives on rng stream 'wind'.
    const d = liveWorld(5);
    d.rng.wind = [1, 2, 3, 4];
    for (let i = 0; i < 2_000; i++) {
      environmentSystem(d);
      expect(d.weather.groundWindMPerS).toBe(speeds[i]);
    }
    expect(d.weather.windFromRad).not.toBe(a.weather.windFromRad);
  });

  it('stays in [0, 2π) within ± clampSd·sd of the mean, varies slowly, and has the configured spread', () => {
    const w = liveWorld(3);
    const n = T(20 * wx.windDirection.tauS);
    let prev: number | null = null;
    let maxStep = 0;
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      environmentSystem(w);
      const dir = w.weather.windFromRad;
      expect(dir).toBeGreaterThanOrEqual(0);
      expect(dir).toBeLessThan(2 * Math.PI);
      const dev = angDiff(dir, MEAN);
      expect(Math.abs(dev)).toBeLessThanOrEqual(LIMIT + 1e-12);
      s2 += dev * dev;
      if (prev !== null) maxStep = Math.max(maxStep, Math.abs(angDiff(dir, prev)));
      prev = dir;
    }
    expect(maxStep).toBeLessThan((0.5 * Math.PI) / 180); // < 0.5° per tick (≈ 0.03° typical)
    const sd = Math.sqrt(s2 / n);
    expect(sd).toBeGreaterThan(wx.windDirection.sdRad * 0.6);
    expect(sd).toBeLessThan(wx.windDirection.sdRad * 1.4);
  });
});
