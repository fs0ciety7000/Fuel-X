// Steam, water and foam (5.6): one Points draw for everything white (token `steam`).
//   - deluge steam billows rolling out of the launch mount, flame-trench billow out of SOCKET_FlameTrench, and the
//     water spray from SOCKET_Deluge_01..04 — all functions of the pad's T-clock channel (`ANIM.pad.delugeS`, sim
//     time interpolated by RenderSync), so a jump to T+00:00:03 shows exactly the T+3 s cloud; gone by T+22 s;
//   - wakes (Kelvin arms + turbulent centre band) behind moving boats and foam at the hull (bow wave, station-keeping
//     ring), in each boat's frame from its pose and `speedMPerS` channel, animated by the VisualClock.
// Shading: a sphere normal per sprite lit by the sun (shadow side → `shadowTint`) so white steam reads over paper.
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
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import type { Quaternion } from 'three';
import { mulberry32 } from '../world/rng';
import { FX_COMMON_FRAG, FX_COMMON_VERT } from './glsl';
import { DELUGE, FX_CAPACITY } from './params';

/** Sprite kinds in `aInfo.x`. */
export const STEAM_KIND = { billow: 0, spray: 1, trench: 2, wake: 3 } as const;

/** PAD sockets (asset space, Y-up) the pad emitters start from. */
export interface PadSockets {
  deluge: readonly Vector3[];
  trench: Vector3;
}

const MAX_BOATS = FX_CAPACITY.boats;

const VERT = /* glsl */ `
attribute vec4 aSeed;
attribute vec2 aInfo; // kind, boat index
uniform float uTime;
uniform float uPadT;
uniform mat4 uPad;
uniform vec2 uWind;   // steam drift, m/s (scene x, z)
uniform vec4 uBoat[${MAX_BOATS}];  // scene x, y, z, yaw
uniform vec4 uBoatP[${MAX_BOATS}]; // speed, stern z, bow z, half beam
varying float vShade;
${FX_COMMON_VERT}
${ShaderChunk.fog_pars_vertex}

void main() {
  int kind = int(aInfo.x + 0.5);
  vec3 p;
  float size;
  float fade;
  vShade = 1.0;
  if (kind == 3) {
    int bi = int(aInfo.y + 0.5);
    vec4 b = uBoat[bi];
    vec4 bp = uBoatP[bi];
    if (b.w < -50.0) { fxCull(); return; }
    float v = abs(bp.x);
    float wakeL = min(600.0, v * 45.0);
    float hb = bp.w;
    vec3 local;
    if (aSeed.w < 0.14 || wakeL < 4.0) {
      // hull foam: bow wave along the fore half of the hull, or a slack ring when station keeping
      float ph = fract(uTime * 0.6 + aSeed.x);
      float side = aSeed.z < 0.5 ? -1.0 : 1.0;
      float hullL = bp.z - bp.y;
      float z = bp.z - aSeed.y * hullL * (v > 0.3 ? 0.55 : 1.0);
      float taper = 1.0 - smoothstep(0.75, 1.0, (z - bp.y) / max(hullL, 1.0));
      float out_ = hb * (0.4 + 0.6 * taper) + (0.6 + v * 0.25) * ph;
      local = vec3(side * out_, 0.0, z);
      size = 1.1 + 0.9 * ph;
      fade = (1.0 - ph) * (v > 0.3 ? 1.0 : 0.55);
      if (wakeL < 4.0 && aSeed.w > 0.5) { fxCull(); return; }
    } else {
      float ph = fract(uTime * v / max(wakeL, 1.0) * (0.85 + 0.3 * aSeed.z) + aSeed.x);
      float s = ph * wakeL;
      float x;
      if (aSeed.w < 0.62) {
        float side = aSeed.w < 0.38 ? -1.0 : 1.0;
        x = side * (hb + s * 0.354) * (0.9 + 0.2 * aSeed.y); // Kelvin half-angle 19.5 deg
        size = 1.5 + 1.2 * ph;
      } else {
        x = (aSeed.y - 0.5) * hb * 2.0 * (1.0 + s / 60.0);
        size = 2.2 + 3.6 * ph;
      }
      local = vec3(x, 0.0, bp.y - s);
      fade = pow(1.0 - ph, 1.3);
    }
    float c = cos(b.w);
    float sn = sin(b.w);
    // yaw about +Y (three): x1 = c*x + s*z, z1 = -s*x + c*z
    p = vec3(b.x + c * local.x + sn * local.z, b.y + 0.75, b.z - sn * local.x + c * local.z);
  } else {
    float T = uPadT;
    vec3 local;
    if (kind == 1) {
      if (T < ${DELUGE.waterFromS.toFixed(1)} || T > ${DELUGE.waterToS.toFixed(1)}) { fxCull(); return; }
      float ph = fract(T * 0.9 + aSeed.x);
      float t = ph * 1.6;
      float ang = 6.2831853 * aSeed.z;
      vec2 radial = normalize(position.xz + vec2(1e-3)) * (5.0 + 5.0 * aSeed.y) + vec2(cos(ang), sin(ang)) * 2.0;
      local = position + vec3(radial.x * t, (9.0 + 6.0 * aSeed.w) * t - 4.9 * t * t, radial.y * t);
      size = 0.9;
      fade = 1.0 - ph * 0.6;
      vShade = 0.9;
    } else {
      if (T < 0.0 || T > ${DELUGE.endS.toFixed(1)}) { fxCull(); return; }
      float trench = kind == 2 ? 1.0 : 0.0;
      float tb = (trench > 0.5 ? 0.2 : 0.4) + ${DELUGE.birthToS.toFixed(1)} * pow(aSeed.x, 1.7);
      float age = T - tb;
      float life = 7.0 + 9.0 * aSeed.y;
      if (age < 0.0 || age > life) { fxCull(); return; }
      float ang;
      vec2 dir;
      float v0;
      if (trench > 0.5) {
        vec2 along = normalize(position.xz + vec2(1e-3));
        ang = (aSeed.z - 0.5) * 0.9;
        dir = vec2(along.x * cos(ang) - along.y * sin(ang), along.x * sin(ang) + along.y * cos(ang));
        v0 = 45.0 + 30.0 * aSeed.w;
      } else {
        ang = 6.2831853 * aSeed.z;
        dir = vec2(cos(ang), sin(ang));
        v0 = 30.0 + 30.0 * aSeed.w;
      }
      float tau = 3.0;
      float d = v0 * tau * (1.0 - exp(-age / tau));
      float rise = (2.0 + 2.6 * aSeed.y) * age + (trench > 0.5 ? 0.0 : 2.0);
      vec3 base = trench > 0.5 ? position : vec3(0.0, 2.5, 0.0);
      local = base + vec3(dir.x * d, rise, dir.y * d);
      size = min(48.0, (trench > 0.5 ? 7.0 : 6.0) + 3.0 * age);
      fade = (1.0 - smoothstep(0.55 * life, life, age))
        * (1.0 - smoothstep(${DELUGE.fadeFromS.toFixed(1)}, ${DELUGE.endS.toFixed(1)}, T))
        * smoothstep(0.0, 0.4, age);
    }
    p = (uPad * vec4(local, 1.0)).xyz;
    if (kind != 1) p.xz += uWind * max(T - 0.5, 0.0);
  }
  fxProject(p, size);
  vFade = fade;
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  ${ShaderChunk.fog_vertex}
}
`;

const FRAG = /* glsl */ `
uniform vec3 uSteam;
uniform vec3 uShadeCol;
uniform vec3 uSunView;
varying float vShade;
${FX_COMMON_FRAG}
${ShaderChunk.fog_pars_fragment}
void main() {
  vec2 q = fxDot(0.8);
  vec3 col = uSteam;
  if (vSize > 4.0) {
    vec3 n = vec3(q.x, -q.y, sqrt(max(0.0, 1.0 - dot(q, q))));
    float l = clamp(dot(n, uSunView), 0.0, 1.0);
    col = mix(uShadeCol, uSteam, 0.3 + 0.7 * l);
  }
  col = mix(uShadeCol, col, vShade);
  gl_FragColor = vec4(col, 1.0);
  ${ShaderChunk.fog_fragment}
  #include <colorspace_fragment>
}
`;

export interface SteamUniforms {
  [name: string]: { value: unknown };
  uTime: { value: number };
  uPadT: { value: number };
  uPad: { value: Matrix4 };
  uWind: { value: Vector2 };
  uBoat: { value: Vector4[] };
  uBoatP: { value: Vector4[] };
  uPxScale: { value: number };
  uMaxPx: { value: number };
  uSunView: { value: Vector3 };
}

export function buildSteamBuffers(pad: PadSockets, seed = 0x51ea_3000) {
  const rng = mulberry32(seed);
  const c = FX_CAPACITY;
  const n = c.steamBillow + c.trenchBillow + c.waterSpray + c.wakePerBoat * c.boats;
  const position = new Float32Array(n * 3);
  const aSeed = new Float32Array(n * 4);
  const aInfo = new Float32Array(n * 2);
  let k = 0;
  const put = (x: number, y: number, z: number, kind: number, boat: number): void => {
    position[k * 3] = x;
    position[k * 3 + 1] = y;
    position[k * 3 + 2] = z;
    for (let j = 0; j < 4; j++) aSeed[k * 4 + j] = rng();
    aInfo[k * 2] = kind;
    aInfo[k * 2 + 1] = boat;
    k++;
  };
  for (let i = 0; i < c.steamBillow; i++) put(0, 0, 0, STEAM_KIND.billow, 0);
  for (let i = 0; i < c.trenchBillow; i++) put(pad.trench.x, pad.trench.y, pad.trench.z, STEAM_KIND.trench, 0);
  const nd = Math.max(1, pad.deluge.length);
  for (let i = 0; i < c.waterSpray; i++) {
    const s = pad.deluge[i % nd];
    put(s?.x ?? 0, s?.y ?? 20, s?.z ?? 0, STEAM_KIND.spray, 0);
  }
  for (let b = 0; b < c.boats; b++) for (let i = 0; i < c.wakePerBoat; i++) put(0, 0, 0, STEAM_KIND.wake, b);
  return { position, aSeed, aInfo, count: n };
}

export class SteamFx {
  readonly points: Points;
  readonly uniforms: SteamUniforms;
  readonly capacity: number;
  private boats = 0;
  private padActive = false;
  private padLive = 0;
  private wakeLive = 0;

  constructor(pad: PadSockets) {
    const buf = buildSteamBuffers(pad);
    this.capacity = buf.count;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(buf.position, 3));
    geo.setAttribute('aSeed', new BufferAttribute(buf.aSeed, 4));
    geo.setAttribute('aInfo', new BufferAttribute(buf.aInfo, 2));
    const w = tokens.world;
    const boats: Vector4[] = [];
    const boatsP: Vector4[] = [];
    for (let i = 0; i < MAX_BOATS; i++) {
      boats.push(new Vector4(0, 0, 0, -100));
      boatsP.push(new Vector4());
    }
    this.uniforms = UniformsUtils.merge([
      UniformsLib.fog,
      {
        uTime: { value: 0 },
        uPadT: { value: 1e4 },
        uPad: { value: new Matrix4() },
        uWind: { value: new Vector2() },
        uBoat: { value: [] },
        uBoatP: { value: [] },
        uPxScale: { value: 1000 },
        uMaxPx: { value: 160 },
        uSunView: { value: new Vector3(0, 1, 0) },
        uSteam: { value: new Color(w.steam) },
        uShadeCol: { value: new Color(w.shadowTint) },
      },
    ]) as SteamUniforms;
    // arrays of vectors are kept by reference (merge would clone them per element)
    this.uniforms.uBoat.value = boats;
    this.uniforms.uBoatP.value = boatsP;
    const mat = new ShaderMaterial({
      name: 'MAT_FxSteam',
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      fog: true,
    });
    this.points = new Points(geo, mat);
    this.points.name = 'FX_Steam';
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  /** Pad emitter: scene-space pose and T-clock seconds; `windX/Z` steam drift, m/s. */
  setPad(pos: Vector3, quat: Quaternion, tS: number, windX: number, windZ: number, one: Vector3): void {
    this.uniforms.uPad.value.compose(pos, quat, one);
    this.uniforms.uPadT.value = tS;
    this.uniforms.uWind.value.set(windX, windZ);
    this.padActive = tS >= DELUGE.waterFromS && tS <= DELUGE.endS;
    const c = FX_CAPACITY;
    this.padLive = !this.padActive
      ? 0
      : (tS <= DELUGE.waterToS ? c.waterSpray : 0) + (tS >= 0 ? c.steamBillow + c.trenchBillow : 0);
  }

  clearPad(): void {
    this.uniforms.uPadT.value = 1e4;
    this.padActive = false;
    this.padLive = 0;
  }

  beginBoats(): void {
    this.boats = 0;
    this.wakeLive = 0;
  }

  /** Adds a wake / foam emitter (scene-space position, yaw about +Y, forward speed, hull sockets). */
  addBoat(x: number, y: number, z: number, yaw: number, speed: number, sternZ: number, bowZ: number, half: number) {
    if (this.boats >= MAX_BOATS) return;
    const i = this.boats++;
    this.uniforms.uBoat.value[i]?.set(x, y, z, yaw);
    this.uniforms.uBoatP.value[i]?.set(speed, sternZ, bowZ, half);
    this.wakeLive += Math.abs(speed) * 45 < 4 ? FX_CAPACITY.wakePerBoat * 0.5 : FX_CAPACITY.wakePerBoat;
  }

  /** Live sprite upper bound for the stats. */
  liveEstimate(): number {
    return Math.round(this.padLive + this.wakeLive);
  }

  frame(timeS: number, pxScale: number, sunView: Vector3): void {
    const u = this.uniforms;
    for (let i = this.boats; i < MAX_BOATS; i++) u.uBoat.value[i]?.setW(-100);
    u.uTime.value = timeS;
    u.uPxScale.value = pxScale;
    u.uSunView.value.copy(sunView);
    this.points.visible = this.padActive || this.boats > 0;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as ShaderMaterial).dispose();
  }
}
