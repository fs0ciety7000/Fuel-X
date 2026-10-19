// Final pass (priority > 0 takes rendering over from R3F): renders the frame through the post pipeline (5.7:
// RenderPass → one EffectPass with SMAA + halftone/dither; skipped under `controls.lowFx`), then records renderer.info for `__fuelx.stats()`.
// renderer.info is reset once per frame (not per render call) so the stats cover shadow + main + post passes.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import type { Camera, Scene, WebGLRenderer } from 'three';
import type { RenderControls } from '../controls';
import type { FrameShared } from '../frame';
import { PostPipeline } from '../post/pipeline';

export const RENDER_PASS_PRIORITY = 1;

/** Copies renderer.info (accumulated since the last reset) into `shared` and counts the frame. */
export function recordStats(gl: WebGLRenderer, shared: FrameShared): void {
  const info = gl.info;
  const s = shared.stats;
  s.drawCalls = info.render.calls;
  s.triangles = info.render.triangles;
  s.points = info.render.points;
  s.geometries = info.memory.geometries;
  s.textures = info.memory.textures;
  s.programs = info.programs?.length ?? 0;
  shared.frames++;
}

/** Draws the frame without post (fallback / tests) and records stats. */
export function renderFrame(gl: WebGLRenderer, scene: Scene, camera: Camera, shared: FrameShared): void {
  gl.info.autoReset = false;
  gl.info.reset();
  gl.render(scene, camera);
  recordStats(gl, shared);
}

class PostRunner {
  private pipeline: PostPipeline | null = null;

  constructor(
    private readonly shared: FrameShared,
    private readonly controls: Readonly<RenderControls>,
  ) {}

  mount(gl: WebGLRenderer, scene: Scene, camera: Camera): () => void {
    this.pipeline = new PostPipeline(gl, scene, camera);
    return () => {
      this.pipeline?.dispose();
      this.pipeline = null;
    };
  }

  frame(gl: WebGLRenderer, scene: Scene, camera: Camera): void {
    if (!this.pipeline || this.controls.lowFx) {
      renderFrame(gl, scene, camera, this.shared);
      return;
    }
    gl.info.autoReset = false;
    gl.info.reset();
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
  useFrame((state) => runner.frame(state.gl, state.scene, state.camera), RENDER_PASS_PRIORITY);
  return null;
}
