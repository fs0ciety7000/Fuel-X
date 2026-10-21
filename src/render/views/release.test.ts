// 8.1 F6: what a view owns on the GPU is released when it leaves. Entity views free their InstancedParts buffers on
// cleanup (shared GLB geometry / materials untouched); instance pools drop the LOD entry of a handle that is gone.
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Vector3,
} from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { TANKER } from '../assets/generated';
import { createAnimBuffer } from '../registry';
import type { EntityHandle } from '../registry';
import { instantiate } from './EntityViews';
import { InstancedParts } from './instanced-parts';
import { InstancePools } from './pools';

const geometry = new BoxGeometry(1, 1, 1);
const material = new MeshBasicMaterial();

/** A fake tanker LOD scene: the linked-duplicate axle meshes the wrapper lists under `instanced`. */
function tankerScene(): Group {
  const g = new Group();
  TANKER.instanced[0].forEach((name, i) => {
    const m = new Mesh(geometry, material);
    m.name = name;
    m.position.z = i;
    g.add(m);
  });
  return g;
}

const gltf = (scene: Group): GLTF => ({ scene }) as unknown as GLTF;

function disposals(root: Object3D): { meshes: InstancedMesh[]; count: () => number } {
  const meshes: InstancedMesh[] = [];
  root.traverse((o) => {
    if (o instanceof InstancedMesh) meshes.push(o);
  });
  let n = 0;
  for (const im of meshes) im.addEventListener('dispose', () => n++);
  return { meshes, count: () => n };
}

describe('view GPU release (8.1 F6)', () => {
  it('InstancedParts.dispose frees every instanced mesh, keeps the shared geometry', () => {
    const root = tankerScene();
    const parts = new InstancedParts(root, TANKER.instanced, false);
    const d = disposals(root);
    expect(d.meshes).toHaveLength(1);
    let geometryDisposed = false;
    geometry.addEventListener('dispose', () => (geometryDisposed = true));
    parts.update();
    parts.dispose();
    expect(d.count()).toBe(1);
    expect(geometryDisposed).toBe(false);
    // Still drawable after a StrictMode re-mount: the mesh stays in the clone and updates keep working.
    expect(d.meshes[0]?.parent).toBe(root);
    expect(() => parts.update()).not.toThrow();
  });

  it("an entity view's dispose releases the instanced parts of every LOD clone", () => {
    const view = instantiate([gltf(tankerScene()), gltf(tankerScene())], 'tanker', 'TK-01');
    const d = disposals(view.root);
    expect(d.meshes).toHaveLength(2); // one InstancedMesh per LOD clone
    view.dispose();
    expect(d.count()).toBe(2);
  });

  it('instance pools drop the LOD entry of a handle that left, keep hidden live ones', () => {
    const pools = new InstancePools();
    const van = new Group();
    van.add(new Mesh(geometry, material));
    pools.register('van', [gltf(van), gltf(van.clone())], false);
    const handle = (id: string): EntityHandle => {
      const object = new Object3D();
      object.position.set(0, 0, 10);
      return {
        id,
        slot: 0,
        object,
        info: {} as EntityHandle['info'],
        asset: 'van',
        anim: createAnimBuffer(),
        lod: null,
      };
    };
    const camera = new PerspectiveCamera(30);
    const origin = new Vector3();
    const [a, b, c] = [handle('VAN-1'), handle('VAN-2'), handle('VAN-3')];
    const frame = (hs: EntityHandle[]): void => pools.update(new Map([['van', hs]]), camera, origin, 30);
    frame([a, b, c]);
    expect(pools.trackedLods('van')).toBe(3);
    c.object.visible = false; // hidden but alive: keeps its hysteresis state
    frame([a, b, c]);
    expect(pools.trackedLods('van')).toBe(3);
    frame([a, c]); // VAN-2 despawned
    expect(pools.trackedLods('van')).toBe(2);
    const d = handle('VAN-4');
    frame([a, d, c]); // one leaves, another joins in the same frame (VAN-3 hidden)
    frame([a, d]);
    expect(pools.trackedLods('van')).toBe(2);
  });
});
