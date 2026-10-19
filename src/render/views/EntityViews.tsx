// Entity views (5.4). Views take an entity id/slot from the snapshot index and register a handle with the
// registry — they never receive positions or state as props, and re-render only when the index changes (spawn /
// despawn / load). Per frame, RenderSync poses the handle and interpolates its channels; ViewSystem picks the LOD
// and applies the rig. Pooled props (tanks, vans) register a bare Object3D and are drawn by the InstancePools.
import { useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { Group, Object3D } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { SnapshotSlot } from '../snapshot';
import type { IndexFeed } from '../index-feed';
import { createAnimBuffer } from '../registry';
import type { EntityRegistry, LodRuntime } from '../registry';
import { castsShadow, isAssetName, useAssetLods } from '../assets/useAsset';
import { ASSETS } from '../assets/generated';
import type { AssetName } from '../assets/generated';
import { lodSize } from './lod';
import { isPooled } from './pools';
import type { InstancePools } from './pools';
import { createRig } from './rigs';

/** One root per entity holding every LOD clone (clone(true) shares geometry + token materials). Hidden until posed. */
function instantiate(gltfs: readonly GLTF[], asset: AssetName, name: string): { root: Group; lod: LodRuntime } {
  const root = new Group();
  root.name = name;
  root.visible = false;
  const levels = gltfs.map((g, i) => {
    const o = g.scene.clone(true);
    o.name = `${name}_LOD${i}`;
    o.visible = i === 0;
    root.add(o);
    return { root: o, apply: createRig(asset, o) };
  });
  return { root, lod: { levels, active: 0, size: lodSize(ASSETS[asset].bounds) } };
}

interface ViewProps {
  slot: SnapshotSlot;
  asset: AssetName;
  registry: EntityRegistry;
}

function EntityView({ slot, asset, registry }: ViewProps) {
  const { gltfs, info } = useAssetLods(asset);
  const view = useMemo(() => instantiate(gltfs, asset, slot.callSign), [gltfs, asset, slot.callSign]);
  useLayoutEffect(() => {
    registry.add({
      id: slot.id,
      slot: slot.slot,
      object: view.root,
      info,
      asset,
      anim: createAnimBuffer(),
      lod: view.lod,
    });
    return () => registry.remove(slot.id, view.root);
  }, [view, info, registry, slot, asset]);
  return <primitive object={view.root} />;
}

function PooledView({ slot, asset, registry }: ViewProps) {
  const { info } = useAssetLods(asset);
  const object = useMemo(() => {
    const o = new Object3D();
    o.name = slot.callSign;
    o.visible = false;
    return o;
  }, [slot.callSign]);
  useLayoutEffect(() => {
    registry.add({ id: slot.id, slot: slot.slot, object, info, asset, anim: createAnimBuffer(), lod: null });
    return () => registry.remove(slot.id, object);
  }, [object, info, registry, slot, asset]);
  return null;
}

function PoolMount({ asset, pools }: { asset: AssetName; pools: InstancePools }) {
  const { gltfs } = useAssetLods(asset);
  useLayoutEffect(() => pools.register(asset, gltfs, castsShadow(asset)), [pools, asset, gltfs]);
  return null;
}

export function EntityViews({
  feed,
  registry,
  pools,
}: {
  feed: IndexFeed;
  registry: EntityRegistry;
  pools: InstancePools;
}) {
  const index = useSyncExternalStore(feed.subscribe, feed.get);
  const pooled = useMemo(
    () => [...new Set(index.slots.map((s) => s.asset).filter((a): a is AssetName => isAssetName(a) && isPooled(a)))],
    [index],
  );
  return (
    <group name="ENTITIES">
      <primitive object={pools.group} />
      {pooled.map((a) => (
        <PoolMount key={a} asset={a} pools={pools} />
      ))}
      {index.slots.map((s) => {
        if (!isAssetName(s.asset)) return null;
        const View = isPooled(s.asset) ? PooledView : EntityView;
        return <View key={s.id} slot={s} asset={s.asset} registry={registry} />;
      })}
    </group>
  );
}
