// Entity views (5.2 minimal: placement + static GLB; animated nodes, LOD and instancing arrive in 5.4).
// Views take an entity id/slot from the snapshot index and register their root with the registry — they never
// receive positions or state as props, and re-render only when the index changes (spawn / despawn / load).
import { useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import type { Object3D } from 'three';
import type { SnapshotSlot } from '../snapshot';
import type { IndexFeed } from '../index-feed';
import type { EntityRegistry } from '../registry';
import { isAssetName, useAsset } from '../assets/useAsset';
import type { AssetName } from '../assets/generated';

/** clone(true) shares geometry and the token materials: one GPU buffer set per asset. Hidden until posed. */
function instantiate(scene: Object3D, name: string): Object3D {
  const o = scene.clone(true);
  o.name = name;
  o.visible = false;
  return o;
}

interface ViewProps {
  slot: SnapshotSlot;
  asset: AssetName;
  registry: EntityRegistry;
}

function EntityView({ slot, asset, registry }: ViewProps) {
  const { gltf, info } = useAsset(asset);
  const object = useMemo(() => instantiate(gltf.scene, slot.callSign), [gltf, slot.callSign]);
  useLayoutEffect(() => {
    registry.add({ id: slot.id, slot: slot.slot, object, info });
    return () => registry.remove(slot.id, object);
  }, [object, info, registry, slot]);
  return <primitive object={object} />;
}

export function EntityViews({ feed, registry }: { feed: IndexFeed; registry: EntityRegistry }) {
  const index = useSyncExternalStore(feed.subscribe, feed.get);
  return (
    <group name="ENTITIES">
      {index.slots.map((s) =>
        isAssetName(s.asset) ? <EntityView key={s.id} slot={s} asset={s.asset} registry={registry} /> : null,
      )}
    </group>
  );
}
