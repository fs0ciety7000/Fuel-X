// Pure interpolation helpers for RenderSync (ARCHITECTURE §3): lerp positions, nlerp quaternions (shortest arc)
// between the last two sim ticks. No three.js here so the maths is unit-tested in Node.
import { SLOT_STRIDE, SlotFlag } from '../snapshot';
import type { RenderSnapshot } from '../snapshot';

export interface Pose {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  flags: number;
}

export function createPose(): Pose {
  return { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, flags: 0 };
}

/** Interpolated pose of `slot` at `alpha` ∈ [0, 1] into `out`. Discrete flags always come from `curr`. */
export function samplePose(snap: RenderSnapshot, slot: number, alpha: number, out: Pose): Pose {
  const o = slot * SLOT_STRIDE;
  const p = snap.prev;
  const c = snap.curr;
  const flags = c[o + 7] ?? 0;
  const a = (flags & SlotFlag.SNAP) !== 0 ? 1 : Math.min(1, Math.max(0, alpha));
  const b = 1 - a;
  out.x = (p[o] ?? 0) * b + (c[o] ?? 0) * a;
  out.y = (p[o + 1] ?? 0) * b + (c[o + 1] ?? 0) * a;
  out.z = (p[o + 2] ?? 0) * b + (c[o + 2] ?? 0) * a;
  let px = p[o + 3] ?? 0;
  let py = p[o + 4] ?? 0;
  let pz = p[o + 5] ?? 0;
  let pw = p[o + 6] ?? 1;
  const cx = c[o + 3] ?? 0;
  const cy = c[o + 4] ?? 0;
  const cz = c[o + 5] ?? 0;
  const cw = c[o + 6] ?? 1;
  if (px * cx + py * cy + pz * cz + pw * cw < 0) {
    px = -px;
    py = -py;
    pz = -pz;
    pw = -pw;
  }
  let qx = px * b + cx * a;
  let qy = py * b + cy * a;
  let qz = pz * b + cz * a;
  let qw = pw * b + cw * a;
  const len = Math.hypot(qx, qy, qz, qw) || 1;
  qx /= len;
  qy /= len;
  qz /= len;
  qw /= len;
  out.qx = qx;
  out.qy = qy;
  out.qz = qz;
  out.qw = qw;
  out.flags = flags;
  return out;
}
