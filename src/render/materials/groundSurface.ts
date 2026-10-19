// Ground surface under the point cloud (5.3): one shader colors land / sand / concrete / sea from the same terrain
// GLSL as the dots, so pads and roads read as clean concrete, the shoreline carries a moving foam band, and a
// world-anchored dot screen (round jittered dots, cells ≥ 3 px, two LODs cross-faded) prints the fine dither the
// 300 k points can't reach: darker scrub dots + white flecks on land, crest streaks on the sea (cells stretched
// along the crests), dotted breaker lines in the foam band. Unlit token colors (the sun reads on the clay; the
// ground stays paper-like), linear fog to paper. Pure function of (world position, uTime): frozen time = static.
import { tokens } from '@tokens/tokens';
import { Color, ShaderChunk, ShaderMaterial, UniformsLib, UniformsUtils, Vector3, Vector4 } from 'three';
import type { Texture } from 'three';
import { CONCRETE_FIELD_GLSL } from '../world/concrete-field';

export interface GroundSurfaceUniforms {
  [name: string]: { value: unknown };
  uTime: { value: number };
  uOrigin: { value: Vector3 };
  uConcreteTex: { value: Texture | null };
  uConcreteXf: { value: Vector4 };
}

const VERT = /* glsl */ `
uniform vec3 uOrigin;
varying vec2 vW;
${ShaderChunk.fog_pars_vertex}
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xz + uOrigin.xz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  ${ShaderChunk.fog_vertex}
}
`;

/** Smallest dot cell on screen, px (cells span [DOT_PX, 2 × DOT_PX]). */
const DOT_PX = 3;
/** Sea streak/foam cells: finer, so crests read as dense hairlines rather than drops. */
const SEA_DOT_PX = 2;

const f = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n));

/** Sea streak cells are this many times longer along the crests (z) than across. */
const STREAK = 3;

const FRAG = (terrain: string, beachM: number, foamM: number): string => /* glsl */ `
uniform float uTime;
uniform vec3 uSeaBase;
uniform vec3 uSeaPoints;
uniform vec3 uGroundBase;
uniform vec3 uGroundPoints;
uniform vec3 uConcrete;
varying vec2 vW;
${ShaderChunk.fog_pars_fragment}
${terrain}
${CONCRETE_FIELD_GLSL}

// One jittered round dot per cell of size c (m), radius rr × c, AA over fp (m/px). x = coverage, y = the cell's
// hash in [0, 1] (the caller turns it into presence / class), so one lookup serves two dot classes.
vec2 dotCell(vec2 g, float c, float rr, float fp, int salt) {
  vec2 q = g / c;
  vec2 id = floor(q);
  ivec2 ic = ivec2(id) + ivec2(salt * 7919, salt * 104729);
  float h = fxHash(ic);
  float j = fxHash(ic + ivec2(17, 3));
  vec2 ctr = 0.5 + (vec2(j, fract(j * 97.0)) - 0.5) * (1.0 - rr);
  float d = length(q - id - ctr) * c;
  float r = rr * c;
  return vec2(1.0 - smoothstep(r - 0.5 * fp, r + 0.5 * fp, d), h);
}

vec2 dotClasses(vec2 cell, float p1, float p2) {
  return cell.x * vec2(step(cell.y, p1), step(p1, cell.y) * step(cell.y, p1 + p2));
}

// World-anchored dot screen: power-of-two cells >= px pixels, the two nearest LODs cross-faded (no popping).
// Returns the coverage of class 1 (probability p1) and class 2 (probability p2).
vec2 dots2(vec2 g, float fp, float px, float p1, float p2, float rr, int salt) {
  float lv = log2(fp * px);
  float L = max(ceil(lv), -4.0);
  float fr = clamp(L - lv, 0.0, 1.0);
  float c0 = exp2(L);
  vec2 a = dotClasses(dotCell(g, 2.0 * c0, rr, fp, salt + 1), p1, p2);
  vec2 b = dotClasses(dotCell(g, c0, rr, fp, salt), p1, p2);
  return mix(a, b, fr);
}

float dots(vec2 g, float fp, float px, float p, float rr, int salt) {
  return dots2(g, fp, px, p, 0.0, rr, salt).x;
}

void main() {
  vec2 w = vW;
  vec2 fw = fwidth(w);
  float fp = max(max(fw.x, fw.y), 1e-3);
  // Sea streak space (derivatives taken here, in uniform control flow).
  vec2 sw = vec2(w.x, w.y * ${f(1 / STREAK)});
  float sfp = max(max(fw.x, ${f(1 / STREAK)} * fw.y), 1e-3);
  float land = fxLandSdf(w);
  float isLand = smoothstep(-0.75 * fp, 0.75 * fp, land);
  vec3 col;

  if (isLand > 0.0) {
    // Land: scrub patches (denser darker dots) + white flecks; sand band; clean concrete lots/roads.
    float n = 0.7 * fxNoise(w / 230.0) + 0.3 * fxNoise(w / 55.0);
    float scrubN = smoothstep(0.32, 0.72, n);
    vec3 ground = mix(uGroundBase, uGroundPoints, 0.1 * scrubN);
    vec2 d = dots2(w, fp, ${f(DOT_PX)}, mix(0.18, 0.62, scrubN), 0.16, 0.34, 1);
    ground = mix(ground, uGroundPoints, 0.85 * d.x);
    ground = mix(ground, uSeaPoints, 0.9 * d.y);
    float sand = 1.0 - smoothstep(${(beachM - 2).toFixed(1)}, ${(beachM + 2).toFixed(1)}, land);
    if (sand > 0.0) ground = mix(ground, mix(uConcrete, uGroundPoints, 0.35 * dots(w, fp, ${f(DOT_PX)}, 0.12, 0.3, 5)), sand);
    float cd = fxConcrete(w);
    ground = mix(ground, uConcrete, 1.0 - smoothstep(-0.5 * fp, 0.5 * fp, cd));
    col = ground;
  }
  if (isLand < 1.0) {
    // Sea: base + crest lightening + white streaks on crests (cells STREAK× longer along the crest lines) + foam.
    float seaD = max(-land, 0.0);
    float wave = fxWaves(w, uTime);
    float crest = smoothstep(0.15, 0.95, wave);
    vec3 sea = mix(uSeaBase, uSeaPoints, 0.14 * crest);
    // Waves shorter than ~4 px alias into noise: fade the crest bias with the pixel footprint.
    float waveVis = 1.0 - smoothstep(2.0, 6.0, fp);
    sea = mix(sea, uSeaPoints, 0.9 * dots(sw, sfp, ${f(SEA_DOT_PX)}, 0.1 + waveVis * 0.45 * crest * crest, 0.3, 7));
    if (seaD < ${f(foamM)}) {
      float foam = fxFoam(seaD, w, uTime);
      float swash = 1.0 - smoothstep(0.0, 12.0, seaD);
      float foamDots = dots(w, fp, ${f(SEA_DOT_PX)}, 0.25 + 0.75 * foam, 0.42, 9);
      sea = mix(sea, uSeaPoints, max(max(foamDots * foam, 0.8 * foam), swash));
    }
    col = isLand > 0.0 ? mix(sea, col, isLand) : sea;
  }

  gl_FragColor = vec4(col, 1.0);
  ${ShaderChunk.fog_fragment}
  #include <colorspace_fragment>
}
`;

export function createGroundSurfaceMaterial(
  terrainGlsl: string,
  beachM: number,
  foamM: number,
): ShaderMaterial & { uniforms: GroundSurfaceUniforms } {
  const w = tokens.world;
  const uniforms = UniformsUtils.merge([
    UniformsLib.fog,
    {
      uTime: { value: 0 },
      uOrigin: { value: new Vector3() },
      uConcreteTex: { value: null },
      uConcreteXf: { value: new Vector4(0, 0, 1, 1) },
      uSeaBase: { value: new Color(w.seaBase) },
      uSeaPoints: { value: new Color(w.seaPoints) },
      uGroundBase: { value: new Color(w.groundBase) },
      uGroundPoints: { value: new Color(w.groundPoints) },
      uConcrete: { value: new Color(w.padConcrete) },
    },
  ]);
  const m = new ShaderMaterial({
    name: 'MAT_GroundSurface',
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG(terrainGlsl, beachM, foamM),
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 4,
  });
  return m as ShaderMaterial & { uniforms: GroundSurfaceUniforms };
}
