// id → scene handle registry: views register their root Object3D on mount, RenderSync writes transforms
// through it each frame (ADR 0002 §3). Views never receive per-frame props.
import type { Object3D, Vector3 } from 'three';
import type { Id } from '@sim/types';
import type { AssetInfo } from './assets/useAsset';
import type { AssetName } from './assets/generated';
import { ANIM_STRIDE } from './snapshot';

/** One LOD level of a mounted entity: its cloned GLB scene and the rig driving its animated nodes. */
export interface LodLevel {
  root: Object3D;
  apply: ((anim: Float32Array) => void) | null;
}

/** LOD state of a mounted (non-pooled) entity; ViewSystem picks `active` by projected height. */
export interface LodRuntime {
  levels: LodLevel[];
  /** Active level index; −1 = hidden (below 0.3 % of the viewport, label only). */
  active: number;
  /** Projected-size reference, m (see `lodSize`). */
  size: number;
}

export interface EntityHandle {
  id: Id;
  slot: number;
  /** Root posed by RenderSync (absolute site metres inside the floating-origin WORLD group). */
  object: Object3D;
  info: AssetInfo;
  asset: AssetName;
  /** Interpolated animation channels for this frame (RenderSync writes, ViewSystem applies). */
  anim: Float32Array;
  /** Per-entity LOD set; null for pooled (instanced) assets — the InstancePools draw those. */
  lod: LodRuntime | null;
}

export function createAnimBuffer(): Float32Array {
  return new Float32Array(ANIM_STRIDE);
}

export class EntityRegistry {
  readonly byId = new Map<Id, EntityHandle>();
  /** Bumped on every add/remove (cheap change detection for systems). */
  version = 0;

  add(handle: EntityHandle): void {
    this.byId.set(handle.id, handle);
    this.version++;
  }

  remove(id: Id, object: Object3D): void {
    if (this.byId.get(id)?.object === object) {
      this.byId.delete(id);
      this.version++;
    }
  }

  get size(): number {
    return this.byId.size;
  }

  /** Socket rest position in asset space, or null. */
  socket(id: Id, socket: string): Vector3 | null {
    return this.byId.get(id)?.info.sockets.get(socket) ?? null;
  }
}
