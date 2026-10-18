// id → scene handle registry: views register their root Object3D on mount, RenderSync writes transforms
// through it each frame (ADR 0002 §3). Views never receive per-frame props.
import type { Object3D, Vector3 } from 'three';
import type { Id } from '@sim/types';
import type { AssetInfo } from './assets/useAsset';

export interface EntityHandle {
  id: Id;
  slot: number;
  object: Object3D;
  info: AssetInfo;
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
