// Point-cloud material (5.3): sea + scrub ground as one GPU-animated dot field. Positions come from a static unit
// tile; the vertex shader wraps each point onto a world-anchored lattice per LOD level (tile = unit × 2^level), keeps
// it with the probability of its level's distance band (3D distance to the camera → constant screen density), and
// classifies it with the shared terrain GLSL: concrete lots/roads → dropped, land → scrub/fleck dots, beach → sand,
// sea → white crest dots that ride the waves, foam band → dense breaker dots. Colors from tokens; linear fog to paper.
import { tokens } from '@tokens/tokens';
import { Color, ShaderChunk, ShaderMaterial, UniformsLib, UniformsUtils, Vector2, Vector3 } from 'three';

export interface PointCloudUniforms {
  [name: string]: { value: unknown };
  uTime: { value: number };
  uBaseLevel: { value: number };
  uUnit: { value: number };
  uSide: { value: number };
  uCover: { value: number };
  uAhead: { value: number };
  uLevels: { value: number };
  uPxScale: { value: number };
  uCamAbs: { value: Vector3 };
  uOrigin: { value: Vector3 };
  uFwd: { value: Vector2 };
}

const VERT = (terrain: string, beachM: number): string => /* glsl */ `
attribute float aRand;
attribute float aLevel;
uniform float uTime;
uniform float uBaseLevel;
uniform float uUnit;
uniform float uSide;
uniform float uCover;
uniform float uAhead;
uniform float uLevels;
uniform float uPxScale;
uniform vec3 uCamAbs;
uniform vec3 uOrigin;
uniform vec2 uFwd;
uniform vec3 uScrub;
uniform vec3 uFleck;
uniform vec3 uSand;
uniform vec3 uFoam;
varying vec3 vColor;
varying float vSize;
${ShaderChunk.fog_pars_vertex}
${terrain}

float band(float r, float R) { return 1.0 - smoothstep(0.55 * R, R, r); }

void cull() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = 0.0;
  vSize = 0.0;
  vColor = vec3(0.0);
}

void main() {
  float T = uUnit * exp2(uBaseLevel + aLevel);
  float R = uCover * T;
  vec2 C = uCamAbs.xz + uFwd * (uAhead * T);
  vec2 w = position.xy * T;
  w += T * floor((C - w) / T + 0.5);

  float land = fxLandSdf(w);
  float h = position.z;
  float y = 0.0;
  float size = 0.45;
  vec3 col;
  if (land > 0.0) {
    if (fxConcreteSdf(w) < 1.5) { cull(); return; }
    if (land < ${beachM.toFixed(1)}) {
      if (aRand > 0.55) { cull(); return; }
      col = uSand;
      size = 0.35;
    } else {
      float n = 0.7 * fxNoise(w / 230.0) + 0.3 * fxNoise(w / 55.0);
      float scrub = mix(0.3, 0.97, smoothstep(0.32, 0.72, n));
      col = aRand < scrub ? uScrub : uFleck;
      size = aRand < scrub ? 0.5 : 0.38;
    }
    y = 0.15 + 0.5 * aRand;
  } else {
    float seaD = -land;
    float wave = fxWaves(w, uTime);
    float foam = fxFoam(seaD, w, uTime);
    float crest = smoothstep(0.25, 0.9, wave);
    float keep = max(0.04 + 0.8 * crest * crest, foam);
    if (aRand > keep) { cull(); return; }
    col = uFoam;
    size = 0.3 + 0.35 * foam;
    y = 0.12 + 0.35 * wave;
  }

  vec3 abs3 = vec3(w.x, y, w.y);
  float r = distance(abs3, uCamAbs);
  float own = band(r, R);
  float inner = aLevel > 0.5 ? band(r, 0.5 * R) : 0.0;
  if (h >= own * (1.0 - inner)) { cull(); return; }

  vec4 mvPosition = viewMatrix * vec4(abs3 - uOrigin, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float px = size * (T / uSide) * uPxScale / max(-mvPosition.z, 1.0);
  gl_PointSize = clamp(px, 1.0, 9.0);
  vSize = gl_PointSize;
  vColor = col;
  ${ShaderChunk.fog_vertex}
}
`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vSize;
${ShaderChunk.fog_pars_fragment}
void main() {
  if (vSize > 2.5) {
    vec2 p = gl_PointCoord - 0.5;
    if (dot(p, p) > 0.25) discard;
  }
  gl_FragColor = vec4(vColor, 1.0);
  ${ShaderChunk.fog_fragment}
  #include <colorspace_fragment>
}
`;

export function createPointCloudMaterial(
  terrainGlsl: string,
  beachM: number,
): ShaderMaterial & {
  uniforms: PointCloudUniforms;
} {
  const w = tokens.world;
  const uniforms = UniformsUtils.merge([
    UniformsLib.fog,
    {
      uTime: { value: 0 },
      uBaseLevel: { value: 10 },
      uUnit: { value: 1 },
      uSide: { value: 245 },
      uCover: { value: 0.62 },
      uAhead: { value: 0.2 },
      uLevels: { value: 5 },
      uPxScale: { value: 1000 },
      uCamAbs: { value: new Vector3() },
      uOrigin: { value: new Vector3() },
      uFwd: { value: new Vector2(0, -1) },
      uScrub: { value: new Color(w.groundPoints) },
      uFleck: { value: new Color(w.seaPoints) },
      uSand: { value: new Color(w.padConcrete) },
      uFoam: { value: new Color(w.seaPoints) },
    },
  ]);
  const m = new ShaderMaterial({
    name: 'MAT_PointCloud',
    uniforms,
    vertexShader: VERT(terrainGlsl, beachM),
    fragmentShader: FRAG,
    fog: true,
  });
  return m as ShaderMaterial & { uniforms: PointCloudUniforms };
}
