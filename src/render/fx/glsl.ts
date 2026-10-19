// Shared GLSL for the FX sprites (5.6): culling, perspective sprite size, ordered dither. Opaque sprites with an
// ordered-dither cut-out instead of alpha blending: no sorting, depth-correct, and the fade reads as print screen
// (DESIGN_SYSTEM: matte, printed; no translucency).
export const FX_COMMON_VERT = /* glsl */ `
uniform float uPxScale;
uniform float uMaxPx;
varying float vFade;
varying float vSize;

void fxCull() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = 0.0;
  vFade = 0.0;
  vSize = 0.0;
}

/** Projects scene-space p as a sprite of world size sizeM. Returns view-space depth. */
float fxProject(vec3 p, float sizeM) {
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float px = sizeM * uPxScale / max(-mv.z, 0.5);
  gl_PointSize = clamp(px, 1.5, uMaxPx);
  vSize = gl_PointSize;
  return -mv.z;
}

/** Orthonormal pair perpendicular to unit d. */
void fxBasis(vec3 d, out vec3 a, out vec3 b) {
  vec3 h = abs(d.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  a = normalize(cross(d, h));
  b = cross(d, a);
}
`;

export const FX_COMMON_FRAG = /* glsl */ `
varying float vFade;
varying float vSize;

float fxBayer4(vec2 fc) {
  ivec2 p = ivec2(mod(fc, 4.0));
  int i = p.x + p.y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}

/**
 * Round sprite + dithered fade; soft in [0, 1] dissolves the rim into the dither (stipple edge instead of a hard
 * disc). Returns the point coordinate in [-1, 1]^2.
 */
vec2 fxDot(float soft) {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (vSize > 2.5 && r2 > 1.0) discard;
  float rim = vSize > 6.0 ? soft * smoothstep(0.3, 1.0, r2) : 0.0;
  if (fxBayer4(gl_FragCoord.xy) > vFade * (1.0 - rim)) discard;
  return p;
}
`;
