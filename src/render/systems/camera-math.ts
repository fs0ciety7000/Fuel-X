// Pure camera maths for the CameraRig (5.5): orbit clamps, offsets, eased re-targeting, framing distance and the
// "never under ground" pitch floor. No three.js scene access, unit-tested in Node.
import { tokens } from '@tokens/tokens';
import type { CameraOrbit } from '../controls';

export const CAMERA_FOV_DEG = 30;
/** Strategic range: high oblique only, never level with the ground, never closer than a vehicle. */
export const CAMERA_LIMITS = { pitchMinDeg: 8, pitchMaxDeg: 85, distMinM: 40, distMaxM: 30_000 } as const;
/** Re-target glide (DESIGN_SYSTEM motion token `dur.camera`, 700 ms). */
export const CAMERA_GLIDE_MS = Number.parseFloat(tokens.motion.dur.camera);
/** Minimum camera height above the site ground / sea surface, m. */
export const CAMERA_MIN_HEIGHT_M = 2;
/** Framing margin around the bounding sphere. */
export const FRAME_MARGIN = 1.15;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const RAD = Math.PI / 180;

export function clampOrbit(o: CameraOrbit): CameraOrbit {
  return {
    yawDeg: ((o.yawDeg % 360) + 360) % 360,
    pitchDeg: clamp(o.pitchDeg, CAMERA_LIMITS.pitchMinDeg, CAMERA_LIMITS.pitchMaxDeg),
    distM: clamp(o.distM, CAMERA_LIMITS.distMinM, CAMERA_LIMITS.distMaxM),
  };
}

/** Camera offset from its target (compass yaw: 0 = camera north of the target = −Z, 90 = east = +X). */
export function orbitOffset(o: CameraOrbit, out: { x: number; y: number; z: number }) {
  const yaw = o.yawDeg * RAD;
  const pitch = o.pitchDeg * RAD;
  const h = Math.cos(pitch) * o.distM;
  out.x = Math.sin(yaw) * h;
  out.y = Math.sin(pitch) * o.distM;
  out.z = -Math.cos(yaw) * h;
  return out;
}

/** Smooth start and stop for the 700 ms glide. */
export function easeInOutCubic(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/** Orbit blend: yaw along the shortest arc, pitch linear, distance geometric (zooms feel even). */
export function mixOrbit(a: CameraOrbit, b: CameraOrbit, t: number): CameraOrbit {
  let dYaw = b.yawDeg - a.yawDeg;
  dYaw = ((((dYaw + 180) % 360) + 360) % 360) - 180;
  return {
    yawDeg: (((a.yawDeg + dYaw * t) % 360) + 360) % 360,
    pitchDeg: a.pitchDeg + (b.pitchDeg - a.pitchDeg) * t,
    distM: a.distM * (b.distM / a.distM) ** t,
  };
}

/** Pitch floor keeping the camera ≥ CAMERA_MIN_HEIGHT_M above ground for a target at `targetY`. */
export function groundPitchFloorDeg(targetY: number, distM: number): number {
  const s = clamp((CAMERA_MIN_HEIGHT_M - targetY) / Math.max(distM, 1e-3), -1, 1);
  return Math.asin(s) / RAD;
}

/** Distance that fits a bounding sphere of `radiusM` in both the vertical and horizontal FOV. */
export function frameDistance(radiusM: number, fovDeg: number, aspect: number): number {
  const v = (fovDeg * RAD) / 2;
  const h = Math.atan(Math.tan(v) * Math.max(aspect, 1e-3));
  return clamp((radiusM / Math.sin(Math.min(v, h))) * FRAME_MARGIN, CAMERA_LIMITS.distMinM, CAMERA_LIMITS.distMaxM);
}
