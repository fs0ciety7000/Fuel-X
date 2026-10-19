// Concrete distance field (5.3): the lots + roads SDF (`fxConcreteSdf`, ~20 boxes/capsules) baked once per site
// into a half-float texture on the GPU, so the ground surface (every pixel) and the point cloud (every vertex) pay
// one bilinear fetch instead of the loop. Bilinear interpolation of a distance field keeps straight edges exact;
// corners round at texel scale (2 m). Outside the baked domain the field reads "far from concrete".
import {
  ClampToEdgeWrapping,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector4,
  WebGLRenderTarget,
} from 'three';
import type { Texture, WebGLRenderer } from 'three';
import type { TerrainSpec } from './terrain';

/** Texel size (m) and margin around the lots/roads bbox (m). */
export const CONCRETE_FIELD = { texelM: 2, padM: 64, maxPx: 4096, clampM: 256 } as const;

export interface FieldDomain {
  x0: number;
  z0: number;
  widthPx: number;
  heightPx: number;
  texelM: number;
}

/** Baked domain: bbox of every lot and road, padded, snapped to whole texels (deterministic). */
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
  const t0 = CONCRETE_FIELD.texelM;
  const span = Math.max(x1 - x0, z1 - z0) + 2 * p;
  const texelM = Math.max(t0, span / CONCRETE_FIELD.maxPx);
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

/** Uniform transform for `fxConcrete`: (x0, z0, 1 / width m, 1 / height m). */
export function fieldTransform(d: FieldDomain): Vector4 {
  return new Vector4(d.x0, d.z0, 1 / (d.widthPx * d.texelM), 1 / (d.heightPx * d.texelM));
}

/** GLSL sampling the baked field (needs `uConcreteTex`, `uConcreteXf`). */
export const CONCRETE_FIELD_GLSL = /* glsl */ `
uniform sampler2D uConcreteTex;
uniform vec4 uConcreteXf;
float fxConcrete(vec2 w) {
  vec2 uv = (w - uConcreteXf.xy) * uConcreteXf.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return ${CONCRETE_FIELD.clampM.toFixed(1)};
  return texture2D(uConcreteTex, uv).r;
}
`;

const BAKE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const bakeFrag = (terrain: string, d: FieldDomain): string => /* glsl */ `
varying vec2 vUv;
${terrain}
void main() {
  vec2 w = vec2(${d.x0.toFixed(1)}, ${d.z0.toFixed(1)}) + vUv * vec2(${(d.widthPx * d.texelM).toFixed(1)}, ${(d.heightPx * d.texelM).toFixed(1)});
  float s = clamp(fxConcreteSdf(w), -${CONCRETE_FIELD.clampM.toFixed(1)}, ${CONCRETE_FIELD.clampM.toFixed(1)});
  gl_FragColor = vec4(s, 0.0, 0.0, 1.0);
}
`;

export interface ConcreteField {
  readonly texture: Texture;
  readonly transform: Vector4;
  dispose(): void;
}

/** Renders the field once into a half-float target. Restores the renderer's target. */
export function bakeConcreteField(gl: WebGLRenderer, spec: TerrainSpec, terrainGlsl: string): ConcreteField {
  const d = concreteFieldDomain(spec);
  const rt = new WebGLRenderTarget(d.widthPx, d.heightPx, {
    type: HalfFloatType,
    format: RGBAFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    wrapS: ClampToEdgeWrapping,
    wrapT: ClampToEdgeWrapping,
    depthBuffer: false,
    generateMipmaps: false,
  });
  rt.texture.name = 'TEX_ConcreteField';
  const mat = new ShaderMaterial({ vertexShader: BAKE_VERT, fragmentShader: bakeFrag(terrainGlsl, d) });
  const quad = new Mesh(new PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const scene = new Scene();
  scene.add(quad);
  const cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = gl.getRenderTarget();
  const autoReset = gl.info.autoReset;
  gl.info.autoReset = false; // the bake must not show up in (or reset) the frame's stats
  gl.setRenderTarget(rt);
  gl.render(scene, cam);
  gl.setRenderTarget(prev);
  gl.info.autoReset = autoReset;
  quad.geometry.dispose();
  mat.dispose();
  return {
    texture: rt.texture,
    transform: fieldTransform(d),
    dispose: () => rt.dispose(),
  };
}
