// Sea + ground (5.3): replaces the 5.1 placeholder planes. Three objects, three draw calls (+ one bake at mount):
//  - GROUND_Surface: re-centred subdivided quad, terrain shader (land / sand / concrete / sea / foam + speckle);
//  - GROUND_Points: one instanced point cloud, 5 LOD levels × 59 536 points = 297.7 k (ARCHITECTURE §13.1), static
//    buffers, everything animated in the vertex shader from `uTime` (frozen by freezeVisuals);
//  - GROUND_ShadowCatcher: ink at low opacity where the sun's shadow map falls (unchanged from 5.1).
// Point placement is a seeded stratified-jitter unit tile (no Math.random), wrapped in the shader onto a lattice
// anchored in absolute site metres, so dots never swim with the camera or the floating origin.
import { tokens } from '@tokens/tokens';
import {
  BufferAttribute,
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  ShadowMaterial,
  Vector3,
} from 'three';
import type { Camera, Texture, Vector4, WebGLRenderer } from 'three';
import type { FrameShared } from '../frame';
import { createGroundSurfaceMaterial } from '../materials/groundSurface';
import { createPointCloudMaterial } from '../materials/pointCloud';
import { FOG } from '../systems/EnvironmentSystem';
import { bakeTerrainFields } from './terrain-fields';
import type { TerrainFields } from './terrain-fields';
import { mulberry32 } from './rng';
import { terrainGlsl, terrainSpec } from './terrain';

/** Point cloud layout. `side²` points per level; `levels` instances; tiles = unitM × 2^level. */
export const CLOUD = {
  side: 244,
  levels: 5,
  unitM: 1,
  /** Level coverage radius (3D distance to the camera) = cover × tile. */
  cover: 0.62,
  /** Tile centre is pushed ahead of the camera by ahead × tile (the area behind the camera is never seen). */
  ahead: 0.2,
  seed: 0x5eed_c10d,
} as const;

export const CLOUD_POINTS = CLOUD.side * CLOUD.side * CLOUD.levels;

/** Ground sits a hair under y = 0 so assets resting on 0 (aprons, kerbs) always win the depth test. */
const GROUND_Y = -0.05;
const SHADOW_OPACITY = 0.16;
const SEGMENTS = 24;

/**
 * Seeded unit tile: stratified jitter on a side × side grid (blue-ish noise, no clumps). Per point: position
 * (u, v, keep-rank h) and aRand (class/colour roll). Same seed → identical buffers.
 */
export function buildCloudPattern(side: number, seed: number): { position: Float32Array; rand: Float32Array } {
  const rng = mulberry32(seed);
  const n = side * side;
  const position = new Float32Array(n * 3);
  const rand = new Float32Array(n);
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const k = j * side + i;
      position[k * 3] = (i + rng()) / side;
      position[k * 3 + 1] = (j + rng()) / side;
      position[k * 3 + 2] = rng();
      rand[k] = rng();
    }
  }
  return { position, rand };
}

/**
 * LOD base level for a camera height (m above ground): the finest level's inner band (r < cover/2 × tile) lies
 * within the camera height, i.e. below any visible ground, so switching levels never pops a visible dot.
 */
export function cloudBaseLevel(cameraHeightM: number): number {
  const h = Math.max(cameraHeightM, 4);
  return Math.floor(Math.log2(h / ((CLOUD.cover / 2) * CLOUD.unitM)));
}

function unitQuad(): PlaneGeometry {
  return new PlaneGeometry(1, 1, SEGMENTS, SEGMENTS).rotateX(-Math.PI / 2).translate(0.5, 0, 0);
}

export class WorldGround {
  readonly surface: Mesh;
  readonly points: Points;
  readonly catcher: Mesh;
  private readonly surfaceMat;
  private readonly cloudMat;
  private readonly field: TerrainFields;
  private readonly surfaceLow;
  private readonly camAbs = new Vector3();
  private readonly dir = new Vector3();

  constructor(
    private readonly shared: FrameShared,
    siteId: string,
    gl: WebGLRenderer,
  ) {
    const spec = terrainSpec(siteId);
    const glsl = terrainGlsl(spec);
    this.field = bakeTerrainFields(gl, spec, glsl);

    this.surfaceMat = createGroundSurfaceMaterial(glsl, spec.beachM, spec.foamM);
    this.bindFields(this.surfaceMat.uniforms);
    // Low-fx variant shares the uniforms object; its program compiles only if lowFx is ever switched on.
    this.surfaceLow = createGroundSurfaceMaterial(glsl, spec.beachM, spec.foamM, true);
    this.surfaceLow.uniforms = this.surfaceMat.uniforms;
    this.surface = new Mesh(unitQuad(), this.surfaceMat);
    this.surface.name = 'GROUND_Surface';
    this.surface.renderOrder = -2;

    const { position, rand } = buildCloudPattern(CLOUD.side, CLOUD.seed);
    const geo = new InstancedBufferGeometry();
    geo.setAttribute('position', new BufferAttribute(position, 3));
    geo.setAttribute('aRand', new BufferAttribute(rand, 1));
    const levels = new Float32Array(CLOUD.levels);
    for (let i = 0; i < CLOUD.levels; i++) levels[i] = i;
    geo.setAttribute('aLevel', new InstancedBufferAttribute(levels, 1));
    geo.instanceCount = CLOUD.levels;
    this.cloudMat = createPointCloudMaterial(glsl, spec.beachM);
    const u = this.cloudMat.uniforms;
    u.uUnit.value = CLOUD.unitM;
    u.uSide.value = CLOUD.side;
    u.uCover.value = CLOUD.cover;
    u.uAhead.value = CLOUD.ahead;
    u.uLevels.value = CLOUD.levels;
    this.bindFields(u);
    this.points = new Points(geo, this.cloudMat);
    this.points.name = 'GROUND_Points';
    this.points.renderOrder = -1;

    this.catcher = new Mesh(
      unitQuad(),
      new ShadowMaterial({
        color: new Color(tokens.color.ink),
        opacity: SHADOW_OPACITY,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 2,
      }),
    );
    this.catcher.name = 'GROUND_ShadowCatcher';
    this.catcher.receiveShadow = true;
    this.catcher.renderOrder = -1;
    for (const o of [this.surface, this.points, this.catcher]) o.frustumCulled = false;
  }

  private bindFields(u: {
    uConcreteTex: { value: Texture | null };
    uConcreteXf: { value: Vector4 };
    uLandTex: { value: Texture | null };
    uLandXf: { value: Vector4 };
  }): void {
    u.uConcreteTex.value = this.field.concrete;
    u.uConcreteXf.value.copy(this.field.concreteXf);
    u.uLandTex.value = this.field.land;
    u.uLandXf.value.copy(this.field.landXf);
  }

  /** Per frame: re-centre the planes, feed the shaders camera/origin/LOD/time. Allocation-free. `lowFx`: flat
   * ground, no point cloud (software GL). */
  frame(camera: Camera, gl: WebGLRenderer, timeS: number, lowFx = false): void {
    const s = this.shared;
    this.surface.material = lowFx ? this.surfaceLow : this.surfaceMat;
    this.points.visible = !lowFx;
    const o = s.origin;
    const t = s.targetAbs;
    const r = Math.max(FOG.minFarM, s.camDist * FOG.farFactor) * 1.5;
    const y = GROUND_Y - o.y;
    const cx = Math.round(t.x / 1000) * 1000;
    const cz = Math.round(t.z / 1000) * 1000;
    this.surface.position.set(cx - r - o.x, y, cz - o.z);
    this.surface.scale.set(2 * r, 1, 2 * r);
    const c = Math.min(4_000, Math.max(400, s.camDist * 2));
    this.catcher.position.set(t.x - c - o.x, y, t.z - o.z);
    this.catcher.scale.set(2 * c, 1, 2 * c);

    this.surfaceMat.uniforms.uTime.value = timeS;
    this.surfaceMat.uniforms.uOrigin.value.copy(o);

    const u = this.cloudMat.uniforms;
    this.camAbs.copy(camera.position).add(o);
    u.uCamAbs.value.copy(this.camAbs);
    u.uOrigin.value.copy(o);
    u.uTime.value = timeS;
    u.uBaseLevel.value = cloudBaseLevel(this.camAbs.y);
    camera.getWorldDirection(this.dir);
    const len = Math.hypot(this.dir.x, this.dir.z);
    if (len > 1e-4) u.uFwd.value.set(this.dir.x / len, this.dir.z / len);
    if (camera instanceof PerspectiveCamera) {
      const hPx = gl.domElement.height;
      u.uPxScale.value = hPx / (2 * Math.tan(((camera.fov / 2) * Math.PI) / 180));
    }
  }

  dispose(): void {
    this.surface.geometry.dispose();
    this.surfaceMat.dispose();
    this.surfaceLow.dispose();
    this.points.geometry.dispose();
    this.cloudMat.dispose();
    this.catcher.geometry.dispose();
    (this.catcher.material as ShadowMaterial).dispose();
    this.field.dispose();
  }
}
