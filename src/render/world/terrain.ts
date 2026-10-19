// Render-side terrain of a site (5.3): coastline, bay, concrete lots and roads. The sim has no coastline (site-lc1
// only says "open sea east, coast ≈ x +400 m, the bay west, the yard on the spit"), so the shape lives here,
// derived from the site layout: lots wrap the placements, roads follow the land paths. One spec feeds both the GLSL
// (point cloud + ground surface shaders) and a TS mirror used by tests and future gameplay-free queries.
// Coordinates: absolute site metres, w = (x east, z south).
import { lc1Layout } from '@data/site-lc1';
import type { Placement, SitePath, V3 } from '@data/site-lc1';

export interface CoastWave {
  amp: number;
  wavelength: number;
  phase: number;
}

export interface TerrainSpec {
  coast: {
    /** Mean coastline x (m): land west, sea east. */
    baseX: number;
    waves: readonly CoastWave[];
    /** Gaussian bulges of the coast toward the sea (headlands): amp (m), centre z, sigma (m). */
    bulges: readonly { amp: number; z: number; sigma: number }[];
    /** Small-scale irregularity: value-noise amplitude (m) and feature size (m). */
    noiseAmp: number;
    noiseScale: number;
  };
  /** Back bay (water) as a wobbly ellipse; null = none. */
  bay: { cx: number; cz: number; rx: number; rz: number; wobble: number; lobes: number; phase: number } | null;
  /** Concrete lots (no dots, padConcrete): centre + half extents, m. */
  lots: readonly { cx: number; cz: number; hx: number; hz: number }[];
  /** Roads: segment a→b and half width, m. */
  roads: readonly { ax: number; az: number; bx: number; bz: number; half: number }[];
  /** Sand band on the land side of the shoreline, m. */
  beachM: number;
  /** Breaker/foam band on the sea side of the shoreline, m. */
  foamM: number;
}

// --- Derivation from the site layout --------------------------------------------------------------------------

const LOT_MARGIN = { pad: 8, tanks: 40, yard: 60, wx: 8, stop: 25 } as const;
const ROAD_HALF = { transporter: 9, road: 5 } as const;

function bbox(ps: readonly V3[], margin: number): { cx: number; cz: number; hx: number; hz: number } {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const p of ps) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    z0 = Math.min(z0, p.z);
    z1 = Math.max(z1, p.z);
  }
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hx: (x1 - x0) / 2 + margin, hz: (z1 - z0) / 2 + margin };
}

/** PAD apron half size (ASSETS_GUIDE §2: apron 120 × 120). */
const PAD_APRON_HALF = 60;

function siteLots(placements: readonly Placement[], pts: typeof lc1Layout.points): TerrainSpec['lots'] {
  const lots: { cx: number; cz: number; hx: number; hz: number }[] = [];
  for (const p of placements) {
    if (p.kind === 'pad') {
      const h = PAD_APRON_HALF + LOT_MARGIN.pad;
      lots.push({ cx: p.pos.x, cz: p.pos.z, hx: h, hz: h });
    } else if (p.kind === 'wxStation') {
      lots.push({ cx: p.pos.x, cz: p.pos.z, hx: LOT_MARGIN.wx, hz: LOT_MARGIN.wx });
    }
  }
  const tanks = placements.filter((p) => p.kind === 'tank').map((p) => p.pos);
  lots.push(bbox([...tanks, pts.loxOffloadBay, pts.ch4OffloadBay], LOT_MARGIN.tanks));
  // Yard = everything parked/built on the spit west of the pad at scenario start (not off-map tankers).
  const yardKinds = new Set(['building', 'transporter', 'crane', 'booster', 'ship']);
  const yard = placements.filter((p) => yardKinds.has(p.kind) && p.pos.x < -1_000).map((p) => p.pos);
  lots.push(bbox([...yard, pts.yardPickup], LOT_MARGIN.yard));
  for (const stop of [pts.crewSafeArea, pts.tankerGate]) {
    lots.push({ cx: stop.x, cz: stop.z, hx: LOT_MARGIN.stop, hz: LOT_MARGIN.stop });
  }
  lots.push(bbox([pts.crewPadParking, { x: -80, y: 0, z: 140 }], 12));
  return lots;
}

function siteRoads(paths: Record<string, SitePath>, isLand: (x: number, z: number) => boolean): TerrainSpec['roads'] {
  const roads: { ax: number; az: number; bx: number; bz: number; half: number }[] = [];
  const key = (ax: number, az: number, bx: number, bz: number): string =>
    ax < bx || (ax === bx && az <= bz) ? `${ax},${az},${bx},${bz}` : `${bx},${bz},${ax},${az}`;
  const seen = new Map<string, number>();
  for (const [id, path] of Object.entries(paths).sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!path.points.every((p) => isLand(p.x, p.z))) continue; // sea patrols
    const half = id.startsWith('sp.') ? ROAD_HALF.transporter : ROAD_HALF.road;
    for (let i = 0; i + 1 < path.points.length; i++) {
      const a = path.points[i] as V3;
      const b = path.points[i + 1] as V3;
      if (a.x === b.x && a.z === b.z) continue;
      const k = key(a.x, a.z, b.x, b.z);
      const prev = seen.get(k);
      if (prev !== undefined) {
        const r = roads[prev];
        if (r) r.half = Math.max(r.half, half);
        continue;
      }
      seen.set(k, roads.length);
      roads.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, half });
    }
  }
  return roads;
}

const LC1_COAST: TerrainSpec['coast'] = {
  baseX: 400,
  waves: [
    { amp: 55, wavelength: 5_200, phase: 0.7 },
    { amp: 22, wavelength: 1_900, phase: 2.1 },
    { amp: 7, wavelength: 610, phase: 4.4 },
  ],
  // Headland under the picket dock (600, 2 500).
  bulges: [{ amp: 210, z: 2_500, sigma: 900 }],
  noiseAmp: 6,
  noiseScale: 140,
};

// The spit: a back bay north-west of the yard leaves an ~800 m neck between bay and sea at z ≈ −2.4 km.
const LC1_BAY: TerrainSpec['bay'] = { cx: -2_600, cz: -2_500, rx: 2_200, rz: 1_600, wobble: 45, lobes: 5, phase: 1.3 };

function buildLc1(): TerrainSpec {
  const base = { coast: LC1_COAST, bay: LC1_BAY, lots: [], roads: [], beachM: 16, foamM: 110 };
  const land = (x: number, z: number): boolean => landSdf(base, x, z) > 0;
  return {
    ...base,
    lots: siteLots(lc1Layout.placements, lc1Layout.points),
    roads: siteRoads(lc1Layout.paths, land),
  };
}

const SPECS = new Map<string, TerrainSpec>();

/** Terrain spec of a site (only LC-1 exists; unknown codes fall back to it). */
export function terrainSpec(siteId: string): TerrainSpec {
  const id = siteId === 'LC-1' ? siteId : 'LC-1';
  let s = SPECS.get(id);
  if (!s) {
    s = buildLc1();
    SPECS.set(id, s);
  }
  return s;
}

// --- TS mirror of the GLSL (same integer hash, same formulas) -------------------------------------------------

const HASH_OFFSET = 1 << 20;

function pcg(v: number): number {
  const s = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0;
  const w = Math.imul(((s >>> ((s >>> 28) + 4)) ^ s) >>> 0, 277803737) >>> 0;
  return ((w >>> 22) ^ w) >>> 0;
}

/** Hash of an integer cell → [0, 1]. Mirrors `fxHash` in GLSL. */
export function hash2(cx: number, cz: number): number {
  const a = pcg((cx + HASH_OFFSET) >>> 0);
  return pcg((a ^ ((cz + HASH_OFFSET) >>> 0)) >>> 0) / 4294967295;
}

/** Smooth value noise → [0, 1]. Mirrors `fxNoise`. */
export function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function coastX(spec: Pick<TerrainSpec, 'coast'>, z: number): number {
  const c = spec.coast;
  let x = c.baseX;
  for (const w of c.waves) x += w.amp * Math.sin((z * 2 * Math.PI) / w.wavelength + w.phase);
  for (const b of c.bulges) x += b.amp * Math.exp(-(((z - b.z) / b.sigma) ** 2));
  x += c.noiseAmp * (2 * valueNoise(0.5, z / c.noiseScale) - 1);
  return x;
}

/** Approximate signed distance to the shoreline, m: > 0 on land, < 0 at sea. */
export function landSdf(spec: Pick<TerrainSpec, 'coast' | 'bay'>, x: number, z: number): number {
  let d = coastX(spec, z) - x;
  const b = spec.bay;
  if (b) {
    const qx = (x - b.cx) / b.rx;
    const qz = (z - b.cz) / b.rz;
    const e =
      (Math.hypot(qx, qz) - 1) * Math.min(b.rx, b.rz) + b.wobble * Math.sin(b.lobes * Math.atan2(qz, qx) + b.phase);
    d = Math.min(d, e);
  }
  return d;
}

/** Signed distance to the nearest concrete lot or road, m (< 0 inside). */
export function concreteSdf(spec: TerrainSpec, x: number, z: number): number {
  let d = Infinity;
  for (const l of spec.lots) {
    const qx = Math.abs(x - l.cx) - l.hx;
    const qz = Math.abs(z - l.cz) - l.hz;
    d = Math.min(d, Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0));
  }
  for (const r of spec.roads) {
    const px = x - r.ax;
    const pz = z - r.az;
    const bx = r.bx - r.ax;
    const bz = r.bz - r.az;
    const t = Math.min(1, Math.max(0, (px * bx + pz * bz) / (bx * bx + bz * bz)));
    d = Math.min(d, Math.hypot(px - bx * t, pz - bz * t) - r.half);
  }
  return d;
}

export type GroundClass = 'sea' | 'beach' | 'concrete' | 'scrub';

export function classify(spec: TerrainSpec, x: number, z: number): GroundClass {
  const l = landSdf(spec, x, z);
  if (l <= 0) return 'sea';
  if (concreteSdf(spec, x, z) < 0) return 'concrete';
  return l < spec.beachM ? 'beach' : 'scrub';
}

// --- GLSL ------------------------------------------------------------------------------------------------------

const f = (n: number): string => {
  const s = Number.isInteger(n) ? n.toFixed(1) : String(+n.toFixed(5));
  return s.includes('.') || s.includes('e') ? s : `${s}.0`;
};

/** Sea waves: wavelength (m), direction of travel (onshore = −x), weight. Deep-water dispersion ω = √(g k). */
const SEA_WAVES = [
  { l: 64, dx: -1, dz: 0.1, w: 0.4 },
  { l: 41, dx: -0.94, dz: -0.34, w: 0.28 },
  { l: 26, dx: -0.9, dz: 0.44, w: 0.2 },
  { l: 15, dx: -0.7, dz: -0.71, w: 0.12 },
] as const;

/**
 * Shared GLSL: hash/noise, `fxLandSdf`, `fxConcreteSdf`, `fxWaves` (sea height ∈ ~[−1, 1]) and `fxFoam`
 * (breaker lines ∈ [0, 1] from the sea-side shore distance). Pure functions of (w, t): frozen t = static frame.
 */
export function terrainGlsl(spec: TerrainSpec): string {
  const c = spec.coast;
  const coastTerms = [
    ...c.waves.map((w) => `${f(w.amp)} * sin(z * ${f((2 * Math.PI) / w.wavelength)} + ${f(w.phase)})`),
    ...c.bulges.map((b) => `${f(b.amp)} * exp(-fxSq((z - ${f(b.z)}) / ${f(b.sigma)}))`),
    `${f(c.noiseAmp)} * (2.0 * fxNoise(vec2(0.5, z / ${f(c.noiseScale)})) - 1.0)`,
  ].join(' + ');
  const b = spec.bay;
  const bay = b
    ? `vec2 q = (w - vec2(${f(b.cx)}, ${f(b.cz)})) / vec2(${f(b.rx)}, ${f(b.rz)});
  float e = (length(q) - 1.0) * ${f(Math.min(b.rx, b.rz))} + ${f(b.wobble)} * sin(${f(b.lobes)} * atan(q.y, q.x) + ${f(b.phase)});
  d = min(d, e);`
    : '';
  const lots = spec.lots.map((l) => `vec4(${f(l.cx)}, ${f(l.cz)}, ${f(l.hx)}, ${f(l.hz)})`).join(',\n  ');
  const roads = spec.roads.map((r) => `vec4(${f(r.ax)}, ${f(r.az)}, ${f(r.bx)}, ${f(r.bz)})`).join(',\n  ');
  const halves = spec.roads.map((r) => f(r.half)).join(', ');
  const waves = SEA_WAVES.map((s) => {
    const k = (2 * Math.PI) / s.l;
    const n = Math.hypot(s.dx, s.dz);
    return `${f(s.w)} * sin(dot(w, vec2(${f((s.dx / n) * k)}, ${f((s.dz / n) * k)})) - t * ${f(Math.sqrt(9.81 * k))})`;
  }).join(' + ');
  return /* glsl */ `
uint fxPcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float fxHash(ivec2 c) {
  uint a = fxPcg(uint(c.x + ${HASH_OFFSET}));
  return float(fxPcg(a ^ uint(c.y + ${HASH_OFFSET}))) / 4294967295.0;
}
float fxNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 fr = p - i;
  vec2 u = fr * fr * (3.0 - 2.0 * fr);
  ivec2 c = ivec2(i);
  float a = fxHash(c);
  float b = fxHash(c + ivec2(1, 0));
  float cc = fxHash(c + ivec2(0, 1));
  float d = fxHash(c + ivec2(1, 1));
  return a + (b - a) * u.x + (cc - a) * u.y + (a - b - cc + d) * u.x * u.y;
}
float fxSq(float v) { return v * v; }
float fxLandSdf(vec2 w) {
  float z = w.y;
  float d = ${f(c.baseX)} + ${coastTerms} - w.x;
  ${bay}
  return d;
}
const int FX_LOTS_N = ${spec.lots.length};
const vec4 FX_LOTS[FX_LOTS_N] = vec4[FX_LOTS_N](
  ${lots}
);
const int FX_ROADS_N = ${spec.roads.length};
const vec4 FX_ROADS[FX_ROADS_N] = vec4[FX_ROADS_N](
  ${roads}
);
const float FX_ROAD_HALF[FX_ROADS_N] = float[FX_ROADS_N](${halves});
float fxConcreteSdf(vec2 w) {
  float d = 1e9;
  for (int i = 0; i < FX_LOTS_N; i++) {
    vec4 l = FX_LOTS[i];
    vec2 q = abs(w - l.xy) - l.zw;
    d = min(d, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0));
  }
  for (int i = 0; i < FX_ROADS_N; i++) {
    vec4 r = FX_ROADS[i];
    vec2 p = w - r.xy;
    vec2 ba = r.zw - r.xy;
    float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, 1.0);
    d = min(d, length(p - ba * h) - FX_ROAD_HALF[i]);
  }
  return d;
}
float fxWaves(vec2 w, float t) {
  return ${waves} + 0.5 * (fxNoise(w / 90.0 + vec2(t * 0.03, 0.0)) - 0.5);
}
float fxFoam(float seaD, vec2 w, float t) {
  float n = fxNoise(vec2(w.y / 45.0, w.x / 45.0 + t * 0.05));
  float fr = fract(seaD / 17.0 + t * 0.16 + 0.6 * n);
  float line = smoothstep(0.55, 0.85, fr) * (1.0 - smoothstep(0.85, 1.0, fr));
  float env = 1.0 - smoothstep(8.0, ${f(spec.foamM)}, seaD);
  float swash = 1.0 - smoothstep(0.0, 7.0 + 5.0 * n, seaD);
  return clamp(max(line * env * (0.45 + 0.55 * n), swash), 0.0, 1.0);
}
`;
}
