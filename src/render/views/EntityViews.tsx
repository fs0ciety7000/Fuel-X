// Entity views (5.2 minimal: placement + static GLB; animated nodes, LOD and instancing arrive in 5.4).
// Views take an entity id/slot from the snapshot index and register their root with the registry — they never
// receive positions or state as props, and re-render only when the index changes (spawn / despawn / load).
import { useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import type { SnapshotSlot } from '../snapshot';
import type { IndexFeed } from '../index-feed';
import type { EntityRegistry } from '../registry';
import { isAssetName, useAsset } from '../assets/useAsset';
import type { AssetName } from '../assets/generated';

interface ViewProps {
  slot: SnapshotSlot;
  asset: AssetName;
  registry: EntityRegistry;
}

function EntityView({ slot, asset, registry }: ViewProps) {
  const { gltf, info } = useAsset(asset);
  // clone(true) shares geometry and the token materials: one GPU buffer set per asset.
  const object = useMemo(() => gltf.scene.clone(true), [gltf]);
  useLayoutEffect(() => {
    object.name = slot.callSign;
    object.visible = false; // RenderSync shows it once a pose is written
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
