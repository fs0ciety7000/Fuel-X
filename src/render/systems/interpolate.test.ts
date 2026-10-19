import { describe, expect, it } from 'vitest';
import { SLOT_STRIDE, SlotFlag, createRenderSnapshot } from '../snapshot';
import { createPose, samplePose } from './interpolate';

function put(arr: Float64Array, slot: number, v: readonly number[]): void {
  arr.set(v, slot * SLOT_STRIDE);
}

describe('samplePose', () => {
  const half = Math.SQRT1_2;

  it('lerps position and nlerps rotation between prev and curr', () => {
    const s = createRenderSnapshot(4);
    put(s.prev, 1, [0, 0, 0, 0, 0, 0, 1, SlotFlag.ALIVE]);
    put(s.curr, 1, [10, 20, -30, 0, half, 0, half, SlotFlag.ALIVE]);
    const p = samplePose(s, 1, 0.5, createPose());
    expect([p.x, p.y, p.z]).toEqual([5, 10, -15]);
    // halfway between identity and 90° about Y = 45° about Y
    expect(p.qy).toBeCloseTo(Math.sin(Math.PI / 8), 3);
    expect(Math.hypot(p.qx, p.qy, p.qz, p.qw)).toBeCloseTo(1, 12);
    expect(p.flags).toBe(SlotFlag.ALIVE);
  });

  it('takes the short arc when the quaternions have opposite signs', () => {
    const s = createRenderSnapshot(2);
    put(s.prev, 0, [0, 0, 0, 0, 0, 0, 1, SlotFlag.ALIVE]);
    put(s.curr, 0, [0, 0, 0, 0, 0, 0, -1, SlotFlag.ALIVE]); // same orientation
    const p = samplePose(s, 0, 0.5, createPose());
    expect(Math.abs(p.qw)).toBeCloseTo(1, 12);
  });

  it('never interpolates across a SNAP and clamps alpha', () => {
    const s = createRenderSnapshot(2);
    put(s.prev, 0, [0, 0, 0, 0, 0, 0, 1, SlotFlag.ALIVE]);
    put(s.curr, 0, [100, 0, 0, 0, 0, 0, 1, SlotFlag.ALIVE | SlotFlag.SNAP]);
    expect(samplePose(s, 0, 0.1, createPose()).x).toBe(100);
    s.curr[7] = SlotFlag.ALIVE;
    expect(samplePose(s, 0, 2, createPose()).x).toBe(100);
    expect(samplePose(s, 0, -1, createPose()).x).toBe(0);
  });
});
