import { describe, expect, it } from 'vitest';
import { tower } from '@data/tower';
import { createPose, stagePose, STAGE } from './pose';

const at = (p: number) => stagePose(p, createPose());
const ps = Array.from({ length: 401 }, (_, i) => i / 400);

describe('showcase stage pose', () => {
  it('rolls B-09 in on SP-41 and stacks it on OLM-1', () => {
    expect(at(0).booster).toMatchObject({ y: STAGE.CARGO_Y, z: STAGE.ROAD_Z });
    expect(at(0.21).booster.z).toBe(0);
    expect(at(0.4).booster).toEqual({ x: 0, y: STAGE.MOUNT_Y, z: 0 });
    expect(at(0.4).ship).toEqual({ x: 0, y: STAGE.SHIP_ON_STACK, z: 0 });
    expect(at(0.4).shipVisible).toBe(true);
  });

  it('keeps the arms closed on the booster pins while lifting it', () => {
    const pose = at(0.245);
    expect(pose.armsRad).toBe(0);
    expect(pose.carriageM - pose.booster.y).toBeCloseTo(66, 6);
  });

  it('lights the engines only around liftoff and the landing burn', () => {
    expect(at(0.45).thrust).toBe(0);
    expect(at(0.55).thrust).toBe(1);
    expect(at(0.75).landing).toBeGreaterThan(0);
    expect(at(0.9).landing).toBe(0);
  });

  it('ends with B-09 caught in closed arms at the catch height', () => {
    const pose = at(0.9);
    expect(pose.booster.y).toBeCloseTo(STAGE.CATCH_Y, 6);
    expect(pose.carriageM).toBeCloseTo(STAGE.CATCH_CARRIAGE, 6);
    expect(pose.armsRad).toBeCloseTo(0, 6);
  });

  it('stays inside the mechanism ranges and never produces NaN', () => {
    for (const p of ps) {
      const pose = at(p);
      for (const v of [pose.booster.y, pose.ship.y, pose.camera.x, pose.camera.y, pose.target.y, pose.carriageM]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      expect(pose.armsRad).toBeGreaterThanOrEqual(0);
      expect(pose.armsRad).toBeLessThanOrEqual(STAGE.OPEN + 1e-9);
      expect(pose.carriageM).toBeGreaterThanOrEqual(tower.carriage.minM);
      // The ship is lowered from just above the lattice top (contract max + 12 m of over-travel, see pose.ts).
      expect(pose.carriageM).toBeLessThanOrEqual(tower.carriage.maxM + 12);
      expect(pose.booster.y).toBeGreaterThanOrEqual(0);
    }
  });
});
