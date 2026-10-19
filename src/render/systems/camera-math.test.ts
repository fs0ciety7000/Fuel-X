import { describe, expect, it } from 'vitest';
import {
  CAMERA_GLIDE_MS,
  CAMERA_LIMITS,
  clampOrbit,
  easeInOutCubic,
  frameDistance,
  groundPitchFloorDeg,
  mixOrbit,
  orbitOffset,
  viewHeadingDeg,
} from './camera-math';

describe('camera maths', () => {
  it('clamps the orbit to the strategic range', () => {
    expect(clampOrbit({ yawDeg: -30, pitchDeg: -10, distM: 5 })).toEqual({
      yawDeg: 330,
      pitchDeg: CAMERA_LIMITS.pitchMinDeg,
      distM: CAMERA_LIMITS.distMinM,
    });
    expect(clampOrbit({ yawDeg: 400, pitchDeg: 120, distM: 1e6 }).pitchDeg).toBe(CAMERA_LIMITS.pitchMaxDeg);
  });

  it('places the camera on the compass bearing above the target', () => {
    const o = orbitOffset({ yawDeg: 90, pitchDeg: 30, distM: 100 }, { x: 0, y: 0, z: 0 });
    expect(o.x).toBeCloseTo(86.6, 1);
    expect(o.y).toBeCloseTo(50, 6);
    expect(o.z).toBeCloseTo(0, 6);
  });

  it('glides yaw along the shortest arc and distance geometrically', () => {
    const m = mixOrbit({ yawDeg: 350, pitchDeg: 20, distM: 100 }, { yawDeg: 10, pitchDeg: 40, distM: 400 }, 0.5);
    expect(m.yawDeg).toBeCloseTo(0, 6);
    expect(m.pitchDeg).toBe(30);
    expect(m.distM).toBeCloseTo(200, 6);
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 9);
    expect(CAMERA_GLIDE_MS).toBe(700);
  });

  it('keeps the camera above ground and frames a sphere in the narrow FOV', () => {
    expect(groundPitchFloorDeg(60, 500)).toBeLessThan(0); // high target: no floor
    expect(groundPitchFloorDeg(0, 40)).toBeCloseTo(2.866, 2);
    const d = frameDistance(72, 30, 16 / 9);
    expect(d).toBeGreaterThan(72 / Math.sin(Math.PI / 12));
    expect(frameDistance(72, 30, 0.5)).toBeGreaterThan(d); // portrait: horizontal FOV limits
  });

  it('writes in place when given an out orbit (aliasing allowed)', () => {
    const a = { yawDeg: 350, pitchDeg: 10, distM: 100 };
    const b = { yawDeg: 10, pitchDeg: 30, distM: 400 };
    const fresh = mixOrbit(a, b, 0.5);
    expect(mixOrbit(a, b, 0.5, a)).toBe(a);
    expect(a).toEqual(fresh);
    const o = { yawDeg: -30, pitchDeg: 100, distM: 1 };
    expect(clampOrbit(o, o)).toBe(o);
    expect(o).toEqual({ yawDeg: 330, pitchDeg: CAMERA_LIMITS.pitchMaxDeg, distM: CAMERA_LIMITS.distMinM });
    expect(viewHeadingDeg({ yawDeg: 245, pitchDeg: 24, distM: 1 })).toBe(65);
  });
});
