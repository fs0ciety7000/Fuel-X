// Instance pools for repeated single-mesh props (ASSETS_GUIDE §4 TANK_* / VAN, ARCHITECTURE §13.2 "instanced when
// > 3 copies"): one InstancedMesh per asset × LOD × primitive. Entities of a pooled asset register a bare Object3D
// that RenderSync poses like any other; ViewSystem copies those poses into the instance matrices each frame and
// picks each instance's LOD on projected height.
import { Group, InstancedMesh, Matrix4, Mesh, Vector3 } from 'three';
import type { BufferGeometry, Camera, Material, Object3D } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ASSETS } from '../assets/generated';
import type { AssetName } from '../assets/generated';
import type { EntityHandle } from '../registry';
import { LOD_HIDDEN, lodSize, pickLod, projectedFraction } from './lod';

/** Assets drawn through the pools (no animated parts, ≤ 2 materials, one leaf mesh). */
export const POOLED_ASSETS: ReadonlySet<AssetName> = new Set<AssetName>(['tank_v', 'tank_h', 'tank_sphere', 'van']);

export function isPooled(name: AssetName): boolean {
  return POOLED_ASSETS.has(name);
}

interface Prim {
  geometry: BufferGeometry;
  material: Material | Material[];
  local: Matrix4;
}

interface Level {
  prims: Prim[];
  meshes: InstancedMesh[];
  count: number;
}

const m4 = new Matrix4();
const m5 = new Matrix4();
const one = new Vector3(1, 1, 1);
const rel = new Vector3();

class Pool {
  readonly levels: Level[];
  readonly size: number;
  private capacity = 0;
  readonly lod = new Map<string, number>();

  constructor(
    readonly name: AssetName,
    gltfs: readonly GLTF[],
    private readonly group: Group,
    private readonly cast: boolean,
  ) {
    this.size = lodSize(ASSETS[name].bounds);
    this.levels = gltfs.map((g) => {
      g.scene.updateMatrixWorld(true);
      const prims: Prim[] = [];
      g.scene.traverse((o: Object3D) => {
        if (o instanceof Mesh) prims.push({ geometry: o.geometry, material: o.material, local: o.matrixWorld.clone() });
      });
      return { prims, meshes: [], count: 0 };
    });
  }

  private ensure(n: number): void {
    if (n <= this.capacity) return;
    const cap = Math.max(8, 2 ** Math.ceil(Math.log2(n)));
    for (const lv of this.levels) {
      for (const m of lv.meshes) {
        this.group.remove(m);
        m.dispose();
      }
      lv.meshes = lv.prims.map((p) => {
        const im = new InstancedMesh(p.geometry, p.material, cap);
        im.name = `POOL_${this.name}`;
        im.count = 0;
        im.frustumCulled = false; // instances span the whole site; a few draw calls at most
        im.castShadow = this.cast;
        im.receiveShadow = true;
        this.group.add(im);
        return im;
      });
    }
    this.capacity = cap;
  }

  update(handles: readonly EntityHandle[], camera: Camera, origin: Vector3, fovDeg: number): void {
    this.ensure(handles.length);
    for (const lv of this.levels) lv.count = 0;
    for (const h of handles) {
      const o = h.object;
      if (!o.visible) continue;
      rel.copy(o.position).sub(origin);
      const frac = projectedFraction(this.size, rel.distanceTo(camera.position), fovDeg);
      const level = pickLod(frac, this.lod.get(h.id) ?? 0, this.levels.length);
      this.lod.set(h.id, level);
      if (level === LOD_HIDDEN) continue;
      const lv = this.levels[level];
      if (!lv) continue;
      m4.compose(o.position, o.quaternion, one);
      for (let k = 0; k < lv.meshes.length; k++) {
        const im = lv.meshes[k];
        const p = lv.prims[k];
        if (im && p) im.setMatrixAt(lv.count, m5.multiplyMatrices(m4, p.local));
      }
      lv.count++;
    }
    for (const lv of this.levels) {
      for (const im of lv.meshes) {
        im.count = lv.count;
        im.instanceMatrix.needsUpdate = true;
      }
    }
  }
}

export class InstancePools {
  readonly group = new Group();
  private readonly pools = new Map<AssetName, Pool>();

  constructor() {
    this.group.name = 'POOLS';
  }

  has(name: AssetName): boolean {
    return this.pools.has(name);
  }

  register(name: AssetName, gltfs: readonly GLTF[], cast: boolean): void {
    if (!this.pools.has(name)) this.pools.set(name, new Pool(name, gltfs, this.group, cast));
  }

  /** `byAsset`: live pooled handles grouped by asset. */
  update(byAsset: ReadonlyMap<AssetName, EntityHandle[]>, camera: Camera, origin: Vector3, fovDeg: number): void {
    for (const [name, pool] of this.pools) pool.update(byAsset.get(name) ?? [], camera, origin, fovDeg);
  }
}
