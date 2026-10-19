import { describe, expect, it } from 'vitest';
import { ANIM_STRIDE, SLOT_STRIDE, SlotFlag, createRenderSnapshot } from '../snapshot';
import { createPose, sampleAnim, samplePose } from './interpolate';

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

describe('sampleAnim', () => {
  it('lerps plain channels and takes the shortest arc on wrapped ones', () => {
    const s = createRenderSnapshot(4);
    s.curr[2 * SLOT_STRIDE + 7] = SlotFlag.ALIVE;
    s.animPrev.set([0, 6.2, 1], 2 * ANIM_STRIDE);
    s.animCurr.set([10, 0.1, 3], 2 * ANIM_STRIDE);
    const out = sampleAnim(s, 2, 0.5, 0b10, new Float32Array(ANIM_STRIDE));
    expect(out[0]).toBeCloseTo(5, 6);
    // 6.2 → 0.1 (+0.183 rad across 2π): halfway ≈ 6.2 + 0.0916
    expect(out[1]).toBeCloseTo(6.2 + (0.1 + Math.PI * 2 - 6.2) / 2, 5);
    expect(out[2]).toBeCloseTo(2, 6);
  });

  it('uses curr only on a SNAP slot', () => {
    const s = createRenderSnapshot(4);
    s.curr[SLOT_STRIDE + 7] = SlotFlag.ALIVE | SlotFlag.SNAP;
    s.animPrev.set([0], ANIM_STRIDE);
    s.animCurr.set([4], ANIM_STRIDE);
    expect(sampleAnim(s, 1, 0.25, 0, new Float32Array(ANIM_STRIDE))[0]).toBe(4);
  });
});
