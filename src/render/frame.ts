// Per-frame shared state. `FrameInput` is written by the app loop right before `advance(now)`; `FrameShared` is
// written by render systems in priority order (RenderSync → Camera → Environment → RenderPass) and read by later ones.
import { Vector3 } from 'three';

export interface FrameInput {
  /** Interpolation factor between snapshot.prev and snapshot.curr, [0, 1). */
  alpha: number;
  /** Wall-clock frame delta, ms (unclamped, for stats/adaptive DPR). */
  wallDtMs: number;
}

export interface RendererStats {
  drawCalls: number;
  triangles: number;
  points: number;
  geometries: number;
  textures: number;
  programs: number;
  /** Live FX sprites (upper bound from the emitters' state, 5.6; budget ≤ 20 k). */
  particles: number;
}

export interface FrameShared {
  /** Floating origin, absolute site metres: the world group sits at −origin. */
  origin: Vector3;
  /** Camera look-at point, absolute site metres. */
  targetAbs: Vector3;
  /** Camera distance to target, m. */
  camDist: number;
  /** Something moved near the camera target since the last frame (shadow map refresh). */
  movedNear: boolean;
  /** Frames rendered so far. */
  frames: number;
  /** Stats of the last rendered frame (main + shadow passes). */
  stats: RendererStats;
}

export function createFrameInput(): FrameInput {
  return { alpha: 0, wallDtMs: 16.7 };
}

export function createFrameShared(): FrameShared {
  return {
    origin: new Vector3(),
    targetAbs: new Vector3(),
    camDist: 1000,
    movedNear: true,
    frames: 0,
    stats: { drawCalls: 0, triangles: 0, points: 0, geometries: 0, textures: 0, programs: 0, particles: 0 },
  };
}
