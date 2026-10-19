// Vehicle attitude in the launch plane (5.0b). A vehicle's attitude is one angle, `tiltRad`: its long axis (asset +Y)
// tilted from vertical toward the launch heading (+ downrange, − back toward the site). The quaternion composes the
// on-pad yaw with that tilt about the horizontal axis perpendicular to the ground track. Pure functions.
import type { Quat, Vec3 } from '../types';
import { headingToQuat } from './path';

/** Stage rotation on the launch mount (assets face +Z = heading π, i.e. identity). */
export const ON_PAD_ROT: Quat = headingToQuat(Math.PI);

/** Hamilton product a·b (apply b, then a). */
export function quatMul(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

/** Rotates `v` by unit quaternion `q`. */
export function rotateVec(q: Quat, v: Vec3): Vec3 {
  const p = quatMul(quatMul(q, { x: v.x, y: v.y, z: v.z, w: 0 }), { x: -q.x, y: -q.y, z: -q.z, w: q.w });
  return { x: p.x, y: p.y, z: p.z };
}

/**
 * Orientation of a vehicle with base (on-pad) rotation `base`, tilted by `tiltRad` toward the horizontal unit
 * direction `dir` (x east, z south). Axis = up × dir, so a positive tilt moves the +Y axis toward `dir`.
 */
export function tiltQuat(base: Quat, dir: { x: number; z: number }, tiltRad: number): Quat {
  const s = Math.sin(tiltRad / 2);
  const tilt: Quat = { x: dir.z * s, y: 0, z: -dir.x * s, w: Math.cos(tiltRad / 2) };
  return quatMul(tilt, base);
}

/** Moves `from` toward `to` by at most `stepAbs`; lands exactly on `to`. */
export function approachAngle(from: number, to: number, stepAbs: number): number {
  const d = to - from;
  if (Math.abs(d) <= stepAbs) return to;
  return from + Math.sign(d) * stepAbs;
}
