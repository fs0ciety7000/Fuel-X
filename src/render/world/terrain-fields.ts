// Baked terrain fields (5.3): the static parts of the terrain GLSL rendered once per site into half-float textures
// on the GPU, so the ground surface (every pixel, up to ~4.7 M at DPR 1.5) and the point cloud (every vertex) pay
// texture fetches instead of the analytic loops:
//  - concrete (R16F, 2 m texels over the lots/roads bbox): `fxConcreteSdf`, ~20 boxes/capsules per evaluation;
//  - land (RG16F, ~12 m texels over 24 km around the site): R = `fxLandSdf` (coast waves + headland + noise + bay),
//    G = `fxScrubNoise` (2 octaves). Outside its domain the shader falls back to the analytic functions.
// Bilinear interpolation of a distance field keeps straight edges exact and smooth curves within a fraction of a
// texel; concrete corners round at texel scale (2 m).
import {
  ClampToEdgeWrapping,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RedFormat,
  RGFormat,
  Scene,
  ShaderMaterial,
  Vector4,
  WebGLRenderTarget,
} from 'three';
import type { PixelFormat, Texture, WebGLRenderer } from 'three';
import type { TerrainSpec } from './terrain';

/** Concrete field: texel (m), margin around the lots/roads bbox (m), max texture side, clamp distance (m). */
export const CONCRETE_FIELD = { texelM: 2, padM: 64, maxPx: 4096, clampM: 256 } as const;
/** Land field: square domain of `sizeM` centred on `centre` (site metres), `px`² texels, clamp distance (m). */
export const LAND_FIELD = { centre: [-2_000, 0] as const, sizeM: 24_000, px: 2048, clampM: 512 } as const;

export interface FieldDomain {
  x0: number;
  z0: number;
  widthPx: number;
  heightPx: number;
  texelM: number;
}

/** Concrete domain: bbox of every lot and road, padded, snapped to whole texels (deterministic). */
export function concreteFieldDomain(spec: TerrainSpec): FieldDomain {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  const add = (x: number, z: number, r: number): void => {
    x0 = Math.min(x0, x - r);
    x1 = Math.max(x1, x + r);
    z0 = Math.min(z0, z - r);
    z1 = Math.max(z1, z + r);
  };
  for (const l of spec.lots) {
    add(l.cx - l.hx, l.cz - l.hz, 0);
    add(l.cx + l.hx, l.cz + l.hz, 0);
  }
  for (const r of spec.roads) {
    add(r.ax, r.az, r.half);
    add(r.bx, r.bz, r.half);
  }
  const p = CONCRETE_FIELD.padM;
  const span = Math.max(x1 - x0, z1 - z0) + 2 * p;
  const texelM = Math.max(CONCRETE_FIELD.texelM, span / CONCRETE_FIELD.maxPx);
  const fx0 = Math.floor((x0 - p) / texelM) * texelM;
  const fz0 = Math.floor((z0 - p) / texelM) * texelM;
  return {
    x0: fx0,
    z0: fz0,
    widthPx: Math.ceil((x1 + p - fx0) / texelM),
    heightPx: Math.ceil((z1 + p - fz0) / texelM),
    texelM,
  };
}

export function landFieldDomain(): FieldDomain {
  const { centre, sizeM, px } = LAND_FIELD;
  return { x0: centre[0] - sizeM / 2, z0: centre[1] - sizeM / 2, widthPx: px, heightPx: px, texelM: sizeM / px };
}

/** Uniform transform for a field: (x0, z0, 1 / width m, 1 / height m). */
export function fieldTransform(d: FieldDomain): Vector4 {
  return new Vector4(d.x0, d.z0, 1 / (d.widthPx * d.texelM), 1 / (d.heightPx * d.texelM));
}

/**
 * GLSL sampling the baked fields (after the terrain GLSL). Needs `uConcreteTex/Xf`, `uLandTex/Xf`.
 * `fxLand(w)` = (land SDF m, scrub noise [0, 1]); `fxConcrete(w)` = concrete SDF m (far outside its domain).
 */
export const TERRAIN_FIELDS_GLSL = /* glsl */ `
uniform sampler2D uConcreteTex;
uniform vec4 uConcreteXf;
uniform sampler2D uLandTex;
uniform vec4 uLandXf;
bool fxInside(vec2 uv) { return uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0; }
float fxConcrete(vec2 w) {
  vec2 uv = (w - uConcreteXf.xy) * uConcreteXf.zw;
  return fxInside(uv) ? texture2D(uConcreteTex, uv).r : ${CONCRETE_FIELD.clampM.toFixed(1)};
}
vec2 fxLand(vec2 w) {
  vec2 uv = (w - uLandXf.xy) * uLandXf.zw;
  if (fxInside(uv)) return texture2D(uLandTex, uv).rg;
  return vec2(fxLandSdf(w), fxScrubNoise(w));
}
`;

const BAKE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const bakeFrag = (terrain: string, d: FieldDomain, body: string): string => /* glsl */ `
varying vec2 vUv;
${terrain}
void main() {
  vec2 w = vec2(${d.x0.toFixed(1)}, ${d.z0.toFixed(1)}) + vUv * vec2(${(d.widthPx * d.texelM).toFixed(1)}, ${(d.heightPx * d.texelM).toFixed(1)});
  ${body}
}
`;

function bake(gl: WebGLRenderer, d: FieldDomain, format: PixelFormat, frag: string, name: string): WebGLRenderTarget {
  const rt = new WebGLRenderTarget(d.widthPx, d.heightPx, {
    type: HalfFloatType,
    format,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    wrapS: ClampToEdgeWrapping,
    wrapT: ClampToEdgeWrapping,
    depthBuffer: false,
    generateMipmaps: false,
  });
  rt.texture.name = name;
  const mat = new ShaderMaterial({ vertexShader: BAKE_VERT, fragmentShader: frag });
  const quad = new Mesh(new PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const scene = new Scene();
  scene.add(quad);
  const cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = gl.getRenderTarget();
  const autoReset = gl.info.autoReset;
  gl.info.autoReset = false; // the bake must not reset the frame's stats
  gl.setRenderTarget(rt);
  gl.render(scene, cam);
  gl.setRenderTarget(prev);
  gl.info.autoReset = autoReset;
  quad.geometry.dispose();
  mat.dispose();
  return rt;
}

export interface TerrainFields {
  readonly concrete: Texture;
  readonly concreteXf: Vector4;
  readonly land: Texture;
  readonly landXf: Vector4;
  dispose(): void;
}

/** Renders both fields once (restores the renderer's target). Deterministic: pure functions of the spec. */
export function bakeTerrainFields(gl: WebGLRenderer, spec: TerrainSpec, terrainGlsl: string): TerrainFields {
  const cd = concreteFieldDomain(spec);
  const cc = CONCRETE_FIELD.clampM.toFixed(1);
  const concrete = bake(
    gl,
    cd,
    RedFormat,
    bakeFrag(terrainGlsl, cd, `gl_FragColor = vec4(clamp(fxConcreteSdf(w), -${cc}, ${cc}), 0.0, 0.0, 1.0);`),
    'TEX_ConcreteField',
  );
  const ld = landFieldDomain();
  const lc = LAND_FIELD.clampM.toFixed(1);
  const land = bake(
    gl,
    ld,
    RGFormat,
    bakeFrag(terrainGlsl, ld, `gl_FragColor = vec4(clamp(fxLandSdf(w), -${lc}, ${lc}), fxScrubNoise(w), 0.0, 1.0);`),
    'TEX_LandField',
  );
  return {
    concrete: concrete.texture,
    concreteXf: fieldTransform(cd),
    land: land.texture,
    landXf: fieldTransform(ld),
    dispose: () => {
      concrete.dispose();
      land.dispose();
    },
  };
}
