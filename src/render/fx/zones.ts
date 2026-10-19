// Ground rings (5.6): selection ring under the followed entity, recovery-zone rings around the recovery vessel,
// dashed pad hazard outline — one instanced draw. A ring is a 256-segment triangle strip; per instance: centre
// (scene space), radius, stroke width in px (constant on screen: widened per vertex by its view distance), dash
// count + phase (0 = solid) and a token colour. Opaque, flat, no depth write (sits on the ground plane, never
// z-fights the apron); structures still occlude it through the depth test.
import {
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderChunk,
  ShaderMaterial,
  BufferAttribute,
  UniformsLib,
  UniformsUtils,
} from 'three';
import type { Color } from 'three';
import { ZONE_CAPACITY } from './params';

const SEGMENTS = 256;

const VERT = /* glsl */ `
attribute float aAng;
attribute float aSide;
attribute vec4 iRing;  // centre x, y, z (scene), radius m
attribute vec4 iStyle; // width px, dash count, dash phase, unused
attribute vec3 iColor;
uniform float uPxM;     // metres per px at 1 m view distance
varying float vAng;
varying vec4 vStyle;
varying vec3 vColor;
${ShaderChunk.fog_pars_vertex}
void main() {
  vec3 dir = vec3(cos(aAng), 0.0, sin(aAng));
  vec3 onRing = iRing.xyz + dir * iRing.w;
  float dist = max(length((viewMatrix * vec4(onRing, 1.0)).xyz), 1.0);
  float w = iStyle.x * uPxM * dist;
  vec3 p = onRing + dir * (aSide - 0.5) * w;
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vAng = aAng;
  vStyle = iStyle;
  vColor = iColor;
  ${ShaderChunk.fog_vertex}
}
`;

const FRAG = /* glsl */ `
varying float vAng;
varying vec4 vStyle;
varying vec3 vColor;
${ShaderChunk.fog_pars_fragment}
void main() {
  if (vStyle.y > 0.5 && fract(vAng / 6.2831853 * vStyle.y + vStyle.z) > 0.5) discard;
  gl_FragColor = vec4(vColor, 1.0);
  ${ShaderChunk.fog_fragment}
  #include <colorspace_fragment>
}
`;

function ringGeometry(): InstancedBufferGeometry {
  const n = (SEGMENTS + 1) * 2;
  const pos = new Float32Array(n * 3);
  const ang = new Float32Array(n);
  const side = new Float32Array(n);
  for (let i = 0; i <= SEGMENTS; i++) {
    const a = (i / SEGMENTS) * Math.PI * 2;
    for (let s = 0; s < 2; s++) {
      const k = i * 2 + s;
      ang[k] = a;
      side[k] = s;
    }
  }
  const index: number[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new InstancedBufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aAng', new BufferAttribute(ang, 1));
  g.setAttribute('aSide', new BufferAttribute(side, 1));
  g.setIndex(index);
  return g;
}

export class ZoneFx {
  readonly mesh: Mesh;
  private readonly ring: InstancedBufferAttribute;
  private readonly style: InstancedBufferAttribute;
  private readonly color: InstancedBufferAttribute;
  private readonly geo: InstancedBufferGeometry;
  private readonly mat: ShaderMaterial;
  private readonly pxM = { value: 0.001 };
  private n = 0;

  constructor() {
    this.geo = ringGeometry();
    this.ring = new InstancedBufferAttribute(new Float32Array(ZONE_CAPACITY * 4), 4);
    this.style = new InstancedBufferAttribute(new Float32Array(ZONE_CAPACITY * 4), 4);
    this.color = new InstancedBufferAttribute(new Float32Array(ZONE_CAPACITY * 3), 3);
    this.geo.setAttribute('iRing', this.ring);
    this.geo.setAttribute('iStyle', this.style);
    this.geo.setAttribute('iColor', this.color);
    this.geo.instanceCount = 0;
    this.mat = new ShaderMaterial({
      name: 'MAT_FxZones',
      uniforms: { ...UniformsUtils.merge([UniformsLib.fog]), uPxM: this.pxM },
      vertexShader: VERT,
      fragmentShader: FRAG,
      fog: true,
      side: DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    this.mesh = new Mesh(this.geo, this.mat);
    this.mesh.name = 'FX_Zones';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
  }

  begin(): void {
    this.n = 0;
  }

  /** Adds a ring centred at scene (x, y, z): radius m, stroke px, dash pairs (0 = solid) and phase, colour. */
  add(x: number, y: number, z: number, radiusM: number, widthPx: number, dashes: number, phase: number, c: Color) {
    if (this.n >= ZONE_CAPACITY) return;
    const i = this.n++;
    this.ring.setXYZW(i, x, y, z, radiusM);
    this.style.setXYZW(i, widthPx, dashes, phase, 0);
    this.color.setXYZ(i, c.r, c.g, c.b);
  }

  get count(): number {
    return this.n;
  }

  /** `pxM`: metres per drawing-buffer pixel at 1 m view distance. */
  end(pxM: number): void {
    this.geo.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
    this.pxM.value = pxM;
    if (this.n > 0) {
      this.ring.needsUpdate = true;
      this.style.needsUpdate = true;
      this.color.needsUpdate = true;
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
