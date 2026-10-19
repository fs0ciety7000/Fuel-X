// Sea + ground system (5.3): mounts the point-cloud world (`world/ground.ts`) and drives it each frame with the
// visual clock (frozen by `freezeVisuals`). Rebuilt only when the site changes.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import type { Camera, Scene, WebGLRenderer } from 'three';
import type { RenderControls } from '../controls';
import type { FrameShared } from '../frame';
import { WorldGround } from '../world/ground';
import { VisualClock } from '../world/visual-clock';

export const GROUND_PRIORITY = -5;

class GroundRunner {
  readonly clock = new VisualClock();
  private ground: WorldGround | null = null;
  private site = '';

  constructor(
    private readonly shared: FrameShared,
    private readonly controls: RenderControls,
  ) {}

  mount(scene: Scene, gl: WebGLRenderer): () => void {
    const sync = (): void => {
      if (this.ground && this.site === this.controls.siteId) return;
      if (this.ground) {
        scene.remove(this.ground.surface, this.ground.points, this.ground.catcher);
        this.ground.dispose();
      }
      this.site = this.controls.siteId;
      this.ground = new WorldGround(this.shared, this.site, gl);
      scene.add(this.ground.surface, this.ground.points, this.ground.catcher);
    };
    this.sync = sync;
    sync();
    return () => {
      if (!this.ground) return;
      scene.remove(this.ground.surface, this.ground.points, this.ground.catcher);
      this.ground.dispose();
      this.ground = null;
    };
  }

  private sync: () => void = () => undefined;

  frame(state: { camera: Camera; gl: WebGLRenderer }, delta: number): void {
    this.sync();
    const t = this.clock.frame(this.controls, delta);
    this.ground?.frame(state.camera, state.gl, t);
  }
}

export function GroundSystem({ shared, controls }: { shared: FrameShared; controls: RenderControls }) {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const [runner] = useState(() => new GroundRunner(shared, controls));
  useEffect(() => runner.mount(scene, gl), [runner, scene, gl]);
  useFrame((state, delta) => runner.frame(state, delta), GROUND_PRIORITY);
  return null;
}
