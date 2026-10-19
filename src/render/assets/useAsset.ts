// GLB loading (ADR 0007, ASSETS_GUIDE §7): three's GLTFLoader + MeshoptDecoder via R3F's cached useLoader,
// URLs from the generated wrappers prefixed with Vite's BASE_URL (ADR 0008: host-agnostic base path).
import { useLoader } from '@react-three/fiber';
import { Mesh, Vector3 } from 'three';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clayMaterial } from '../materials/clay';
import { ASSETS } from './generated';
import type { AssetName } from './generated';

/** Wrapper URLs are root-relative (`/models/x.glb?v=…`); the deployed base path may differ. */
export function assetUrl(url: string, base: string = import.meta.env.BASE_URL): string {
  return `${base.endsWith('/') ? base : `${base}/`}${url.replace(/^\//, '')}`;
}

const extendLoader = (loader: GLTFLoader): void => {
  loader.setMeshoptDecoder(MeshoptDecoder);
};

export function isAssetName(name: string): name is AssetName {
  return name in ASSETS;
}

/** Hero/large structures cast into the single 2048² shadow map (§13.1 ≤ 60 shadow draw calls); props don't. */
const SHADOW_CASTERS: ReadonlySet<AssetName> = new Set<AssetName>([
  'tower',
  'pad',
  'booster',
  'ship',
  'crane',
  'tank_v',
  'tank_h',
  'tank_sphere',
  'bldg_highbay',
  'hangar_tent',
  'transporter',
  'vessel_recovery',
]);

export function castsShadow(name: AssetName): boolean {
  return SHADOW_CASTERS.has(name);
}

/** Every GLB of an asset, LOD0 first (`url`, then the wrapper `lods`). */
export function assetUrls(name: AssetName): string[] {
  const a = ASSETS[name];
  return [a.url, ...a.lods].map((u) => assetUrl(u));
}

export interface AssetInfo {
  name: AssetName;
  /** Rest-pose position of each socket in asset space (Y-up), by socket node name. */
  sockets: ReadonlyMap<string, Vector3>;
}

const prepared = new WeakMap<GLTF, AssetInfo>();

/** One-time pass per loaded GLB: token materials, shadow flags, socket table. */
function prepare(name: AssetName, gltf: GLTF): AssetInfo {
  const done = prepared.get(gltf);
  if (done) return done;
  const cast = SHADOW_CASTERS.has(name);
  const sockets = new Map<string, Vector3>();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o: Object3D) => {
    if (o instanceof Mesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const next = mats.map((m) => clayMaterial(m.name, m.side));
      o.material = Array.isArray(o.material) ? next : (next[0] ?? o.material);
      o.castShadow = cast;
      o.receiveShadow = true;
    } else if (o.name.startsWith('SOCKET_')) {
      sockets.set(o.name, o.getWorldPosition(new Vector3()));
    }
  });
  const info: AssetInfo = { name, sockets };
  prepared.set(gltf, info);
  return info;
}

export function useAsset(name: AssetName): { gltf: GLTF; info: AssetInfo } {
  const gltf = useLoader(GLTFLoader, assetUrl(ASSETS[name].url), extendLoader);
  return { gltf, info: prepare(name, gltf) };
}

/** All LOD files of an asset (LOD0 first), prepared; `info` (sockets) comes from LOD0. */
export function useAssetLods(name: AssetName): { gltfs: GLTF[]; info: AssetInfo } {
  const gltfs = useLoader(GLTFLoader, assetUrls(name), extendLoader);
  const infos = gltfs.map((g) => prepare(name, g));
  return { gltfs, info: infos[0] as AssetInfo };
}

/** Suspends until every listed GLB is loaded, LODs included (all 16 assets ≈ 740 KB). */
export function useAssets(names: readonly AssetName[]): void {
  useLoader(
    GLTFLoader,
    names.flatMap((n) => assetUrls(n)),
    extendLoader,
  );
}

export const ALL_ASSETS = Object.keys(ASSETS) as AssetName[];
