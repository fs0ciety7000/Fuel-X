// RenderSync (ADR 0002 §3): every frame, lerp prev→curr from the RenderSnapshot and write Object3D transforms
// through the registry; re-centre the world group on the followed entity (floating origin, §14 risk 4);
// publish index changes to the views (the only React-visible event).
import { useFrame } from '@react-three/fiber';
import { useState } from 'react';
import type { RefObject } from 'react';
import type { Group } from 'three';
import type { RenderControls } from '../controls';
import type { FrameInput, FrameShared } from '../frame';
import type { IndexFeed } from '../index-feed';
import type { EntityRegistry } from '../registry';
import { ANIM_STRIDE, ANIM_WRAP, SLOT_STRIDE, SlotFlag, isAnimatedAsset } from '../snapshot';
import type { RenderSnapshot } from '../snapshot';
import { createPose, sampleAnim, samplePose } from './interpolate';

export const RENDER_SYNC_PRIORITY = -30;
/** Radius around the camera target inside which motion refreshes the shadow map, m. */
const SHADOW_MOTION_RADIUS_M = 900;

export interface RenderSyncDeps {
  snapshot: RenderSnapshot;
  controls: RenderControls;
  input: FrameInput;
  shared: FrameShared;
  registry: EntityRegistry;
  feed: IndexFeed;
  world: RefObject<Group | null>;
}

export class RenderSyncSystem {
  private readonly pose = createPose();
  private seenTick = -1;
  private seenRegistry = -1;

  constructor(private readonly d: RenderSyncDeps) {}

  frame(): void {
    const { snapshot, controls, input, shared, registry, feed, world } = this.d;
    feed.publish(snapshot.index);
    const regChanged = registry.version !== this.seenRegistry;
    const ticked = snapshot.tick !== this.seenTick || regChanged;
    this.seenTick = snapshot.tick;
    this.seenRegistry = registry.version;

    let movedNear = false;
    const t = shared.targetAbs;
    const r2 = SHADOW_MOTION_RADIUS_M * SHADOW_MOTION_RADIUS_M;
    const pose = this.pose;
    for (const h of registry.byId.values()) {
      samplePose(snapshot, h.slot, input.alpha, pose);
      const f = pose.flags;
      const o = h.object;
      if ((f & SlotFlag.ALIVE) === 0 || (f & SlotFlag.HIDDEN) !== 0) {
        o.visible = false;
        continue;
      }
      o.visible = true;
      o.position.set(pose.x, pose.y, pose.z);
      o.quaternion.set(pose.qx, pose.qy, pose.qz, pose.qw);
      const asset = h.asset;
      const animated = isAnimatedAsset(asset);
      if (isAnimatedAsset(asset)) sampleAnim(snapshot, h.slot, input.alpha, ANIM_WRAP[asset] ?? 0, h.anim);
      if (ticked && !movedNear) {
        const i = h.slot * SLOT_STRIDE;
        const p = snapshot.prev;
        const c = snapshot.curr;
        let moved = p[i] !== c[i] || p[i + 1] !== c[i + 1] || p[i + 2] !== c[i + 2] || p[i + 6] !== c[i + 6];
        if (!moved && animated) {
          const a = h.slot * ANIM_STRIDE;
          for (let k = 0; k < ANIM_STRIDE && !moved; k++) moved = snapshot.animPrev[a + k] !== snapshot.animCurr[a + k];
        }
        const dx = pose.x - t.x;
        const dz = pose.z - t.z;
        if (moved && dx * dx + dz * dz < r2) movedNear = true;
      }
    }
    shared.movedNear = movedNear || regChanged;

    // Floating origin: the followed entity sits at the scene origin; everything else is relative to it.
    const followed = controls.followId ? registry.byId.get(controls.followId) : undefined;
    if (followed?.object.visible) shared.origin.copy(followed.object.position);
    else shared.origin.set(0, 0, 0);
    world.current?.position.set(-shared.origin.x, -shared.origin.y, -shared.origin.z);
  }
}

export function RenderSync(props: RenderSyncDeps) {
  const [system] = useState(() => new RenderSyncSystem(props));
  useFrame(() => system.frame(), RENDER_SYNC_PRIORITY);
  return null;
}
