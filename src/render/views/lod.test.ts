import { describe, expect, it } from 'vitest';
import { LOD_HIDDEN, lodSize, pickLod, projectedFraction } from './lod';
import { bogieSteer } from './rigs';

describe('LOD selection', () => {
  it('matches the ASSETS_GUIDE reference distances at a 30° FOV', () => {
    // tower 146 m: LOD0 under ~1.8 km, LOD1 under ~9 km
    expect(pickLod(projectedFraction(146, 1_700, 30), 0, 3)).toBe(0);
    expect(pickLod(projectedFraction(146, 2_200, 30), 0, 3)).toBe(1);
    expect(pickLod(projectedFraction(146, 10_000, 30), 1, 3)).toBe(2);
    // van 2.7 m (2 files): last level until ~1.7 km, hidden beyond
    expect(pickLod(projectedFraction(2.7, 1_000, 30), 0, 2)).toBe(1);
    expect(pickLod(projectedFraction(2.7, 2_000, 30), 1, 2)).toBe(LOD_HIDDEN);
  });

  it('holds the current level inside the hysteresis band', () => {
    const atBoundary = 0.15;
    expect(pickLod(atBoundary * 0.95, 0, 3)).toBe(0); // just below: stays LOD0
    expect(pickLod(atBoundary * 0.85, 0, 3)).toBe(1);
    expect(pickLod(atBoundary * 1.05, 1, 3)).toBe(1); // just above: stays LOD1
    expect(pickLod(atBoundary * 1.15, 1, 3)).toBe(0);
    expect(pickLod(0.0029, LOD_HIDDEN, 3)).toBe(LOD_HIDDEN);
    expect(pickLod(0.0031, LOD_HIDDEN, 3)).toBe(LOD_HIDDEN);
    expect(pickLod(0.0034, LOD_HIDDEN, 3)).toBe(2);
  });

  it('sizes flat and long assets by half their longest side', () => {
    expect(lodSize({ min: [-60, 0, -60], max: [60, 23, 60] })).toBe(60);
    expect(lodSize({ min: [-5, 0, -5], max: [5, 146, 5] })).toBe(146);
  });
});

describe('bogieSteer', () => {
  it('steers front and rear bogies opposite in a forward turn and folds reversing angles into ±90°', () => {
    const [front] = bogieSteer(0.1, 1, 7);
    const [rear] = bogieSteer(0.1, 1, -7);
    expect(front).toBeGreaterThan(0);
    expect(rear).toBeCloseTo(-front, 9);
    const [rev, folded] = bogieSteer(0.1, -1, 7);
    expect(folded).toBe(true);
    expect(Math.abs(rev)).toBeLessThanOrEqual(Math.PI / 2);
    expect(bogieSteer(0.1, 0, 7)[0]).toBeCloseTo(Math.PI / 2, 9); // carousel
    expect(bogieSteer(0, 1, 7)[0]).toBe(0);
  });
});
