// Ground surface under the point cloud (5.3): one shader colors land / sand / concrete / sea from the same terrain
// GLSL as the dots, so pads and roads read as clean concrete, the shoreline carries a moving foam band, and a
// world-anchored speckle (cells ≥ 2 px, two LODs blended) prints the fine dither the 300 k points can't reach.
// Unlit token colors (the sun reads on the clay; the ground stays paper-like), linear fog to paper.
import { tokens } from '@tokens/tokens';
import { Color, ShaderChunk, ShaderMaterial, UniformsLib, UniformsUtils, Vector3 } from 'three';

export interface GroundSurfaceUniforms {
  [name: string]: { value: unknown };
  uTime: { value: number };
  uOrigin: { value: Vector3 };
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

const FRAG = (terrain: string, beachM: number): string => /* glsl */ `
uniform float uTime;
uniform vec3 uSeaBase;
uniform vec3 uSeaPoints;
uniform vec3 uGroundBase;
uniform vec3 uGroundPoints;
uniform vec3 uConcrete;
varying vec2 vW;
${ShaderChunk.fog_pars_fragment}
${terrain}

/** World-anchored speckle: 1 where a cell (≥ 2 px, power-of-two metres) is "on", LODs cross-faded. */
float speckle(vec2 w, float fp, float density, int salt) {
  float lv = log2(fp * 2.0);
  float L = max(ceil(lv), -6.0);
  float fr = clamp(L - lv, 0.0, 1.0);
  float c0 = exp2(L);
  ivec2 s = ivec2(salt * 7919, salt * 104729);
  float s0 = step(1.0 - density, fxHash(ivec2(floor(w / c0)) + s));
  float s1 = step(1.0 - density, fxHash(ivec2(floor(w / (2.0 * c0))) + s + ivec2(31, 17)));
  return mix(s1, s0, fr);
}

void main() {
  vec2 w = vW;
  float fp = max(length(fwidth(w)), 1e-3);
  float land = fxLandSdf(w);

  // Land: scrub patches + dark/light speckle; sand band; concrete lots/roads.
  float n = 0.7 * fxNoise(w / 230.0) + 0.3 * fxNoise(w / 55.0);
  float scrubN = smoothstep(0.32, 0.72, n);
  vec3 ground = mix(uGroundBase, uGroundPoints, 0.12 * scrubN);
  ground = mix(ground, uGroundPoints, 0.7 * speckle(w, fp, mix(0.12, 0.42, scrubN), 1));
  ground = mix(ground, uSeaPoints, 0.8 * speckle(w, fp, 0.1, 2));
  float sand = 1.0 - smoothstep(${(beachM - 2).toFixed(1)}, ${(beachM + 2).toFixed(1)}, land);
  ground = mix(ground, mix(uConcrete, uSeaPoints, 0.6 * speckle(w, fp, 0.2, 3)), sand);
  float cd = fxConcreteSdf(w);
  ground = mix(ground, uConcrete, 1.0 - smoothstep(-0.5 * fp, 0.5 * fp, cd));

  // Sea: base + crest lightening + white flecks on crests + breaker foam.
  float seaD = max(-land, 0.0);
  float wave = fxWaves(w, uTime);
  float crest = smoothstep(0.2, 0.95, wave);
  vec3 sea = mix(uSeaBase, uSeaPoints, 0.18 * crest);
  sea = mix(sea, uSeaPoints, 0.8 * speckle(w, fp, 0.02 + 0.35 * crest * crest, 4));
  float foam = fxFoam(seaD, w, uTime);
  sea = mix(sea, uSeaPoints, foam);

  float isLand = smoothstep(-0.75 * fp, 0.75 * fp, land);
  gl_FragColor = vec4(mix(sea, ground, isLand), 1.0);
  ${ShaderChunk.fog_fragment}
  #include <colorspace_fragment>
}
`;

export function createGroundSurfaceMaterial(
  terrainGlsl: string,
  beachM: number,
): ShaderMaterial & { uniforms: GroundSurfaceUniforms } {
  const w = tokens.world;
  const uniforms = UniformsUtils.merge([
    UniformsLib.fog,
    {
      uTime: { value: 0 },
      uOrigin: { value: new Vector3() },
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
    fragmentShader: FRAG(terrainGlsl, beachM),
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 4,
  });
  return m as ShaderMaterial & { uniforms: GroundSurfaceUniforms };
}
