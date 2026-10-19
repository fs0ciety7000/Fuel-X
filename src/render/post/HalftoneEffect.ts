// Print look for the world (5.7): a 45° halftone screen modulating the mid/dark tones plus a 4×4 ordered dither
// that kills 8-bit banding. Screen-space and time-independent (static under freezeVisuals). Paper-bright pixels
// (background, haze, white clay highlights) stay clean: dots only start below `threshold`. The HUD is DOM, so it is
// never halftoned (DESIGN_SYSTEM §2.4).
import { BlendFunction, Effect } from 'postprocessing';
import { Uniform } from 'three';

const FRAG = /* glsl */ `
uniform float strength;
uniform float cellPx;
uniform float threshold;

float bayer4(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  int idx = i.x + i.y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[idx]) + 0.5) / 16.0;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 px = uv * resolution;
  float l = dot(inputColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  float ink = clamp((threshold - l) / threshold, 0.0, 1.0);
  vec2 r = mat2(0.70710678, -0.70710678, 0.70710678, 0.70710678) * px / cellPx;
  float d = length(fract(r) - 0.5) * 1.41421356;
  float rad = sqrt(ink);
  float dotMask = 1.0 - smoothstep(rad - 0.12, rad + 0.12, d);
  // Halftone tone (dot = ink) relative to the flat tone keeps the mean, swaps flat grey for printed dots.
  float ht = 1.0 - dotMask;
  float flat_ = 1.0 - ink;
  vec3 c = inputColor.rgb * mix(1.0, (ht + 0.02) / (flat_ + 0.02), strength * ink);
  c += (bayer4(px) - 0.5) / 255.0;
  outputColor = vec4(c, inputColor.a);
}
`;

export interface HalftoneOptions {
  /** 0 = off, 1 = full halftone in the darkest tones. */
  strength?: number;
  /** Screen cell size in CSS px (scaled by the device pixel ratio). */
  cellCssPx?: number;
  /** Linear luminance below which dots appear (paper ≈ 0.9). */
  threshold?: number;
}

export class HalftoneEffect extends Effect {
  private readonly cellCssPx: number;

  constructor({ strength = 0.35, cellCssPx = 4, threshold = 0.75 }: HalftoneOptions = {}) {
    super('HalftoneEffect', FRAG, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ['strength', new Uniform(strength)],
        ['cellPx', new Uniform(cellCssPx)],
        ['threshold', new Uniform(threshold)],
      ]),
    });
    this.cellCssPx = cellCssPx;
  }

  /** Keep the screen at the same CSS size whatever the (adaptive) device pixel ratio. */
  setPixelRatio(dpr: number): void {
    const u = this.uniforms.get('cellPx');
    if (u) u.value = this.cellCssPx * dpr;
  }
}
