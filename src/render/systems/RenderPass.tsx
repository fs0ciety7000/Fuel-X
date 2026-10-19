// Final pass (priority > 0 takes rendering over from R3F): renders the frame through the post pipeline (5.7:
// RenderPass → one EffectPass with SMAA + halftone/dither; skipped under `controls.lowFx`), then records renderer.info for `__fuelx.stats()`.
// renderer.info is reset once per frame (not per render call) so the stats cover shadow + main + post passes.
// The pipeline (and the whole `postprocessing` package, ≈ 63 KB gz) is a lazy chunk (5.9: keeps the game's initial
// JS within ARCHITECTURE §13.3); frames before it lands are drawn raw and `shared.postReady` gates `isReady()`.
import { useFrame, useThree } from '@react-three/fiber';
import type { RootState } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import type { Camera, Scene, WebGLRenderer } from 'three';
import type { RenderControls } from '../controls';
import type { FrameShared } from '../frame';
import type { PostPipeline } from '../post/pipeline';
import { DPR_RANGE } from './AdaptiveDpr';

export const RENDER_PASS_PRIORITY = 1;

/**
 * Wraps the renderer's shadow pass once so its draw calls can be told apart from the main pass (5.9 perf-audit:
 * ARCHITECTURE §13.1 budgets them separately). Two integer reads per frame; returns the unwrap.
 */
export function probeShadowPass(gl: WebGLRenderer, shared: FrameShared): () => void {
  const sm = gl.shadowMap;
  const original = sm.render;
  sm.render = (...args: Parameters<typeof original>): void => {
    const c0 = gl.info.render.calls;
    original.apply(sm, args);
    const n = gl.info.render.calls - c0;
    shared.shadowCallsFrame += n;
    if (n > 0) shared.stats.shadowDrawCalls = n;
  };
  return () => {
    sm.render = original;
  };
}

/** Starts a frame's renderer.info accumulation (once per frame, not per render call). */
function beginStats(gl: WebGLRenderer, shared: FrameShared): void {
  gl.info.autoReset = false;
  gl.info.reset();
  shared.shadowCallsFrame = 0;
}

/** Copies renderer.info (accumulated since the last reset) into `shared` and counts the frame. */
export function recordStats(gl: WebGLRenderer, shared: FrameShared): void {
  const info = gl.info;
  const s = shared.stats;
  s.drawCalls = info.render.calls;
  s.mainDrawCalls = info.render.calls - shared.shadowCallsFrame;
  s.triangles = info.render.triangles;
  s.points = info.render.points;
  s.geometries = info.memory.geometries;
  s.textures = info.memory.textures;
  s.programs = info.programs?.length ?? 0;
  shared.frames++;
}

/** Draws the frame without post (fallback / tests) and records stats. */
export function renderFrame(gl: WebGLRenderer, scene: Scene, camera: Camera, shared: FrameShared): void {
  beginStats(gl, shared);
  gl.render(scene, camera);
  recordStats(gl, shared);
}

/** Device pixel ratio under `controls.lowFx` (software GL): a quarter of the pixels at DPR 1. */
export const LOW_FX_DPR = 0.5;

class PostRunner {
  private pipeline: PostPipeline | null = null;
  private low = false;

  constructor(
    private readonly shared: FrameShared,
    private readonly controls: Readonly<RenderControls>,
  ) {}

  mount(gl: WebGLRenderer, scene: Scene, camera: Camera): () => void {
    let live = true;
    const unprobe = probeShadowPass(gl, this.shared);
    import('../post/pipeline')
      .then(({ PostPipeline }) => {
        if (live) this.pipeline = new PostPipeline(gl, scene, camera);
      })
      .catch((err: unknown) => {
        // Degrade to the raw pass rather than never becoming ready.
        console.error('post pipeline failed to load', err);
      })
      .finally(() => {
        if (live) this.shared.postReady = true;
      });
    return () => {
      live = false;
      unprobe();
      this.pipeline?.dispose();
      this.pipeline = null;
      this.shared.postReady = false;
    };
  }

  frame(state: RootState): void {
    const { gl, scene, camera } = state;
    if (this.controls.lowFx !== this.low) {
      // Rare (debug toggle): one store update, no per-frame React. AdaptiveDpr never raises a DPR below 1.
      this.low = this.controls.lowFx;
      state.setDpr(this.low ? LOW_FX_DPR : DPR_RANGE[0]);
    }
    // Low fx: shadows freeze at their last update (a 2048² depth pass per moving frame is seconds in software GL).
    if (this.low) gl.shadowMap.needsUpdate = false;
    if (!this.pipeline || this.low) {
      renderFrame(gl, scene, camera, this.shared);
      return;
    }
    beginStats(gl, this.shared);
    this.pipeline.render(camera);
    recordStats(gl, this.shared);
  }
}

export function RenderPass({ shared, controls }: { shared: FrameShared; controls: Readonly<RenderControls> }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const [runner] = useState(() => new PostRunner(shared, controls));
  useEffect(() => runner.mount(gl, scene, camera), [runner, gl, scene, camera]);
  useFrame((state) => runner.frame(state), RENDER_PASS_PRIORITY);
  return null;
}
