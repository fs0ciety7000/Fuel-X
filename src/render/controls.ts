// Mutable view/camera intents the app (debug hooks now, HUD later via the bridge viewStore) writes and render
// systems read every frame. Plain object: no React state, no subscriptions on the per-frame path.
import type { Id } from '@sim/types';

export interface CameraOrbit {
  /** Compass bearing from target to camera, degrees (0 = camera north of target, 90 = east). */
  yawDeg: number;
  /** Elevation above the horizon, degrees. */
  pitchDeg: number;
  /** Distance target → camera, m. */
  distM: number;
}

export type CameraRequest =
  | { kind: 'home' }
  | { kind: 'frame' }
  | ({ kind: 'orbit' } & CameraOrbit);

export interface RenderControls {
  /** Entity the camera follows (and the floating origin re-centres on); null = site home target. */
  followId: Id | null;
  /** Site whose home view is used when nothing is followed. */
  siteId: string;
  /** Pending camera preset; the camera system consumes it (sets it back to null). */
  cameraRequest: CameraRequest | null;
  /** Next camera move is a cut, not a damped glide (screenshots, jumps). */
  snapCamera: boolean;
  /** Static visuals for screenshots: fixed wall clock, no damping (ARCHITECTURE §9). */
  frozen: boolean;
  /** Seconds of visual time when frozen (particles/noise seeded from it in 5.6/5.7). */
  frozenTimeS: number;
}

export function createRenderControls(siteId: string): RenderControls {
  return {
    followId: null,
    siteId,
    cameraRequest: { kind: 'home' },
    snapCamera: true,
    frozen: false,
    frozenTimeS: 0,
  };
}
