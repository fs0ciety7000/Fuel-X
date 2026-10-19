// Exhaust plumes (5.6): one Points draw for every burning stage (booster + ship). Static buffers built once from the
// BOOSTER / SHIP engine sockets (ASSETS_GUIDE: SOCKET_Engine_NN at each bell exit, pointing down = local −Y):
//   - jets: 48 sprites per engine, a short hot cone at the bell (exhaustCore → exhaustGlow), dropped per engine
//     when its rank ≥ lit (engine-out / boostback 13 / landing 3 are visible engine by engine);
//   - body: the merged plume along the stage's −Y axis, radius/length from `plumeShape` (altitude, engines lit).
// Everything moves in the vertex shader from `uTime` (VisualClock: frozen under freezeVisuals) and the per-stage
// model matrix (scene space, floating origin applied on the CPU in float64). CPU per frame: 2 matrices + 8 floats.
import { tokens } from '@tokens/tokens';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Matrix4,
  Points,
  ShaderChunk,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector4,
} from 'three';
import type { Quaternion, Vector3 } from 'three';
import { mulberry32 } from '../world/rng';
import { FX_COMMON_FRAG, FX_COMMON_VERT } from './glsl';
import { FX_CAPACITY, engineRanks, plumeShape } from './params';

/** Engine socket rest positions (asset space, Y-up) of one stage, socket order. */
export interface StageEngines {
  engines: readonly Vector3[];
  /** Body sprite count. */
  body: number;
}

const VERT = /* glsl */ `
attribute vec4 aSeed;
attribute vec3 aInfo; // stage (0 booster, 1 ship), rank, kind (0 jet, 1 body)
uniform float uTime;
uniform mat4 uStage0;
uniform mat4 uStage1;
uniform vec4 uShape0; // length, r0, rEnd, jet
uniform vec4 uShape1;
uniform vec4 uMisc0;  // lit, sizeScale, keep, engine-plane y
uniform vec4 uMisc1;
varying float vCore;
${FX_COMMON_VERT}
${ShaderChunk.fog_pars_vertex}

void main() {
  bool booster = aInfo.x < 0.5;
  vec4 misc = booster ? uMisc0 : uMisc1;
  vec4 shape = booster ? uShape0 : uShape1;
  mat4 M = booster ? uStage0 : uStage1;
  float lit = misc.x;
  if (lit < 0.5) { fxCull(); return; }
  float jet = aInfo.z < 0.5 ? 1.0 : 0.0;
  if (jet > 0.5 && aInfo.y >= lit - 0.5) { fxCull(); return; }
  if (jet < 0.5 && aSeed.w > misc.z) { fxCull(); return; }

  float ang = 6.2831853 * aSeed.z;
  vec3 local;
  float size;
  float fade;
  if (jet > 0.5) {
    float ph = fract(uTime * (2.4 + 0.8 * aSeed.w) + aSeed.x);
    float r = (0.35 + 0.55 * ph) * sqrt(aSeed.y);
    local = position + vec3(cos(ang) * r, -ph * shape.w, sin(ang) * r);
    size = (0.9 + 1.1 * ph) * misc.y;
    fade = 1.0 - ph * ph;
    vCore = ph < 0.6 ? 1.0 : 0.0;
  } else {
    float ph = fract(uTime * (0.9 + 0.5 * aSeed.w) + aSeed.x);
    float s = pow(ph, 0.8);
    float R = mix(shape.y, shape.z, sqrt(ph));
    float rr = sqrt(aSeed.y);
    float wob = 0.15 * sin(uTime * 7.0 + aSeed.z * 40.0);
    local = vec3(cos(ang) * R * rr, misc.w - s * shape.x, sin(ang) * R * rr) * (1.0 + wob * ph);
    size = (2.2 + 4.0 * ph) * misc.y;
    fade = pow(1.0 - ph, 0.75);
    vCore = (ph < 0.22 && rr < 0.55) ? 1.0 : 0.0;
  }
  vec3 p = (M * vec4(local, 1.0)).xyz;
  fxProject(p, size);
  vFade = fade;
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  ${ShaderChunk.fog_vertex}
}
`;

const FRAG = /* glsl */ `
uniform vec3 uCore;
uniform vec3 uGlow;
varying float vCore;
${FX_COMMON_FRAG}
${ShaderChunk.fog_pars_fragment}
void main() {
  fxDot(0.5);
  gl_FragColor = vec4(vCore > 0.5 ? uCore : uGlow, 1.0);
  ${ShaderChunk.fog_fragment}
  #include <colorspace_fragment>
}
`;

export interface PlumeUniforms {
  [name: string]: { value: unknown };
  uTime: { value: number };
  uPxScale: { value: number };
  uMaxPx: { value: number };
  uStage0: { value: Matrix4 };
  uStage1: { value: Matrix4 };
  uShape0: { value: Vector4 };
  uShape1: { value: Vector4 };
  uMisc0: { value: Vector4 };
  uMisc1: { value: Vector4 };
}

/** Builds the static buffers: per stage, jets for each engine socket then the body sprites. */
export function buildPlumeBuffers(stages: readonly [StageEngines, StageEngines], seed = 0x9e3779b9) {
  const rng = mulberry32(seed);
  let n = 0;
  for (const s of stages) n += s.engines.length * FX_CAPACITY.jetPerEngine + s.body;
  const position = new Float32Array(n * 3);
  const aSeed = new Float32Array(n * 4);
  const aInfo = new Float32Array(n * 3);
  let k = 0;
  const put = (x: number, y: number, z: number, stage: number, rank: number, kind: number): void => {
    position.set([x, y, z], k * 3);
    aSeed.set([rng(), rng(), rng(), rng()], k * 4);
    aInfo.set([stage, rank, kind], k * 3);
    k++;
  };
  stages.forEach((s, stage) => {
    const ranks = engineRanks(s.engines.length);
    s.engines.forEach((e, i) => {
      for (let j = 0; j < FX_CAPACITY.jetPerEngine; j++) put(e.x, e.y, e.z, stage, ranks[i] ?? i, 0);
    });
    for (let j = 0; j < s.body; j++) put(0, 0, 0, stage, 0, 1);
  });
  return { position, aSeed, aInfo, count: n };
}

/** Engine-plane height (mean socket y) and cluster radius (max socket distance from the axis + bell), m. */
export function engineCluster(engines: readonly Vector3[]): { planeY: number; radiusM: number } {
  if (engines.length === 0) return { planeY: 0, radiusM: 1 };
  let y = 0;
  let r = 0;
  for (const e of engines) {
    y += e.y;
    r = Math.max(r, Math.hypot(e.x, e.z));
  }
  return { planeY: y / engines.length, radiusM: r + 0.65 };
}

interface StageState {
  planeY: number;
  radiusM: number;
  engines: number;
}

export class PlumeFx {
  readonly points: Points;
  readonly uniforms: PlumeUniforms;
  readonly capacity: number;
  private readonly stages: [StageState, StageState];

  constructor(booster: readonly Vector3[], ship: readonly Vector3[]) {
    const buf = buildPlumeBuffers([
      { engines: booster, body: FX_CAPACITY.boosterBody },
      { engines: ship, body: FX_CAPACITY.shipBody },
    ]);
    this.capacity = buf.count;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(buf.position, 3));
    geo.setAttribute('aSeed', new BufferAttribute(buf.aSeed, 4));
    geo.setAttribute('aInfo', new BufferAttribute(buf.aInfo, 3));
    const w = tokens.world;
    this.uniforms = UniformsUtils.merge([
      UniformsLib.fog,
      {
        uTime: { value: 0 },
        uPxScale: { value: 1000 },
        uMaxPx: { value: 96 },
        uStage0: { value: new Matrix4() },
        uStage1: { value: new Matrix4() },
        uShape0: { value: new Vector4() },
        uShape1: { value: new Vector4() },
        uMisc0: { value: new Vector4() },
        uMisc1: { value: new Vector4() },
        uCore: { value: new Color(w.exhaustCore) },
        uGlow: { value: new Color(w.exhaustGlow) },
      },
    ]) as PlumeUniforms;
    const mat = new ShaderMaterial({
      name: 'MAT_FxPlume',
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      fog: true,
    });
    this.points = new Points(geo, mat);
    this.points.name = 'FX_Plume';
    this.points.frustumCulled = false;
    this.points.visible = false;
    const b = engineCluster(booster);
    const s = engineCluster(ship);
    this.stages = [
      { ...b, engines: booster.length },
      { ...s, engines: ship.length },
    ];
  }

  /**
   * One stage's emitter for this frame. `pos` is the scene-space origin (absolute − floating origin), `altitudeM`
   * above site ground; `lit` = engines burning (0 hides the stage's sprites).
   */
  setStage(index: 0 | 1, pos: Vector3, quat: Quaternion, lit: number, altitudeM: number, one: Vector3): void {
    const st = this.stages[index];
    const u = this.uniforms;
    const misc = index === 0 ? u.uMisc0.value : u.uMisc1.value;
    if (lit <= 0) {
      misc.set(0, 1, 0, st.planeY);
      return;
    }
    const sh = plumeShape(lit, st.engines, st.radiusM, altitudeM);
    (index === 0 ? u.uStage0.value : u.uStage1.value).compose(pos, quat, one);
    (index === 0 ? u.uShape0.value : u.uShape1.value).set(sh.lengthM, sh.r0M, sh.rEndM, sh.jetM);
    misc.set(lit, sh.sizeScale, sh.keep, st.planeY);
  }

  /** Live sprite upper bound for the stats (jets of lit engines + kept body share). */
  liveEstimate(): number {
    const a = this.uniforms.uMisc0.value;
    const b = this.uniforms.uMisc1.value;
    const jet = FX_CAPACITY.jetPerEngine;
    const na = a.x < 0.5 ? 0 : a.x * jet + FX_CAPACITY.boosterBody * a.z;
    const nb = b.x < 0.5 ? 0 : b.x * jet + FX_CAPACITY.shipBody * b.z;
    return Math.round(na + nb);
  }

  frame(timeS: number, pxScale: number): void {
    const u = this.uniforms;
    u.uTime.value = timeS;
    u.uPxScale.value = pxScale;
    this.points.visible = u.uMisc0.value.x > 0.5 || u.uMisc1.value.x > 0.5;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as ShaderMaterial).dispose();
  }
}
