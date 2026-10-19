// The R3F scene (5.1). `frameloop="never"`: the app's GameLoop calls `api.advance(now)` once per rAF after
// stepping the sim (ADR 0002 §1). WebGL2, no tone mapping (`flat`, matches Blender "Standard"), sRGB output,
// soft shadows, DPR clamped to [1, 1.5]. React renders this tree on mount and on index changes only.
import { Canvas } from '@react-three/fiber';
import type { RootState } from '@react-three/fiber';
import { Suspense, useEffect, useRef, useState } from 'react';
import type { Group } from 'three';
import { ALL_ASSETS, isAssetName, useAssets } from './assets/useAsset';
import type { RenderControls } from './controls';
import { createFrameShared } from './frame';
import type { FrameInput, RendererStats } from './frame';
import { IndexFeed } from './index-feed';
import { EntityRegistry } from './registry';
import type { RenderSnapshot } from './snapshot';
import { AdaptiveDpr, DPR_RANGE } from './systems/AdaptiveDpr';
import { CAMERA_FOV_DEG, CameraSystem } from './systems/CameraSystem';
import { EnvironmentSystem } from './systems/EnvironmentSystem';
import { GroundSystem } from './systems/GroundSystem';
import { RenderPass } from './systems/RenderPass';
import { RenderSync } from './systems/RenderSync';
import { EntityViews } from './views/EntityViews';

export interface SceneApi {
  /** Runs the render systems and draws one frame. */
  advance(now: number): void;
  /** Stats of the last rendered frame (renderer.info, main + shadow passes). */
  stats(): Readonly<RendererStats>;
  /** All GLBs loaded and every indexed entity mounted. */
  isReady(): boolean;
  frames(): number;
}

export interface SceneProps {
  snapshot: RenderSnapshot;
  controls: RenderControls;
  input: FrameInput;
  onApi: (api: SceneApi) => void;
  className?: string | undefined;
}

function AssetGate({ onLoaded }: { onLoaded: () => void }) {
  useAssets(ALL_ASSETS);
  useEffect(onLoaded, [onLoaded]);
  return null;
}

/** Non-React scene state shared by the systems (registry, index feed, per-frame scratch). */
class SceneCore implements SceneApi {
  readonly registry = new EntityRegistry();
  readonly feed = new IndexFeed();
  readonly shared = createFrameShared();
  private loaded = false;
  private advanceFn: ((now: number) => void) | null = null;

  constructor(private readonly snapshot: RenderSnapshot) {}

  readonly markLoaded = (): void => {
    this.loaded = true;
  };

  bind(state: RootState): void {
    state.gl.info.autoReset = true;
    this.advanceFn = (now) => state.advance(now);
  }

  advance(now: number): void {
    this.advanceFn?.(now);
  }

  stats(): Readonly<RendererStats> {
    return this.shared.stats;
  }

  isReady(): boolean {
    if (!this.loaded || this.shared.frames === 0) return false;
    const want = this.snapshot.index.slots.filter((s) => isAssetName(s.asset)).length;
    return this.feed.get() === this.snapshot.index && this.registry.size >= want;
  }

  frames(): number {
    return this.shared.frames;
  }
}

export function Scene({ snapshot, controls, input, onApi, className }: SceneProps) {
  const [core] = useState(() => new SceneCore(snapshot));
  const world = useRef<Group>(null);
  const onCreated = (state: RootState): void => {
    core.bind(state);
    onApi(core);
  };

  return (
    <Canvas
      className={className}
      frameloop="never"
      flat
      shadows="percentage"
      dpr={[DPR_RANGE[0], DPR_RANGE[1]]}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      camera={{ fov: CAMERA_FOV_DEG, near: 1, far: 60_000, position: [800, 600, 900] }}
      onCreated={onCreated}
    >
      <RenderSync
        snapshot={snapshot}
        controls={controls}
        input={input}
        shared={core.shared}
        registry={core.registry}
        feed={core.feed}
        world={world}
      />
      <CameraSystem controls={controls} registry={core.registry} shared={core.shared} />
      <EnvironmentSystem shared={core.shared} />
      <AdaptiveDpr input={input} />
      <GroundSystem shared={core.shared} controls={controls} />
      <RenderPass shared={core.shared} />
      <group ref={world} name="WORLD">
        <Suspense fallback={null}>
          <AssetGate onLoaded={core.markLoaded} />
          <EntityViews feed={core.feed} registry={core.registry} />
        </Suspense>
      </group>
    </Canvas>
  );
}
