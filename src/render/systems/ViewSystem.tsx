// ViewSystem (5.4): after the camera moved, pick each entity's LOD on projected screen height, apply its rig with
// the channels RenderSync interpolated this frame, and fill the instance pools. Runs between Camera (−20) and
// Environment (−10). Mutates three objects only; no React state.
import { useFrame } from '@react-three/fiber';
import { useState } from 'react';
import { PerspectiveCamera, Vector3 } from 'three';
import type { Camera } from 'three';
import type { AssetName } from '../assets/generated';
import type { FrameShared } from '../frame';
import type { EntityHandle, EntityRegistry } from '../registry';
import { LOD_HIDDEN, pickLod, projectedFraction } from '../views/lod';
import type { InstancePools } from '../views/pools';

export const VIEW_PRIORITY = -15;

export interface ViewDeps {
  registry: EntityRegistry;
  pools: InstancePools;
  shared: FrameShared;
}

export class ViewSystemCore {
  private readonly rel = new Vector3();
  private byAsset = new Map<AssetName, EntityHandle[]>();
  private seen = -1;

  constructor(private readonly d: ViewDeps) {}

  frame(camera: Camera): void {
    const { registry, pools, shared } = this.d;
    const fov = camera instanceof PerspectiveCamera ? camera.fov : 30;
    if (registry.version !== this.seen) {
      this.seen = registry.version;
      this.byAsset = new Map();
      for (const h of registry.byId.values()) {
        if (h.lod) continue;
        const list = this.byAsset.get(h.asset) ?? [];
        list.push(h);
        this.byAsset.set(h.asset, list);
      }
    }
    for (const h of registry.byId.values()) {
      const lod = h.lod;
      if (!lod || !h.object.visible) continue;
      // distance to the asset's mid-height, in scene space (WORLD group sits at −origin)
      this.rel.copy(h.object.position).sub(shared.origin);
      this.rel.y += lod.size * 0.5;
      const frac = projectedFraction(lod.size, this.rel.distanceTo(camera.position), fov);
      const next = pickLod(frac, lod.active, lod.levels.length);
      if (next !== lod.active) {
        for (let i = 0; i < lod.levels.length; i++) {
          const lv = lod.levels[i];
          if (lv) lv.root.visible = i === next;
        }
        lod.active = next;
      }
      if (next !== LOD_HIDDEN) lod.levels[next]?.apply?.(h.anim);
    }
    pools.update(this.byAsset, camera, shared.origin, fov);
  }
}

export function ViewSystem(props: ViewDeps) {
  const [core] = useState(() => new ViewSystemCore(props));
  useFrame(({ camera }) => core.frame(camera), VIEW_PRIORITY);
  return null;
}
