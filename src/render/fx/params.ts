// Pure FX parameters and rules (5.6): no three.js, unit-tested in Node. Particles are stateless — every sprite's
// position is a function of (static seed, emitter uniforms, time) evaluated in the vertex shader — so these numbers
// fully describe what is drawn for a given sim state and visual time (freezeVisuals → identical frames).

/** Sprite capacity per system (ARCHITECTURE §13.1: ≤ 20 k live sprites, ≤ 4 systems). Live ≤ capacity. */
export const FX_CAPACITY = {
  /** Per engine jet (core cone at the bell exit). */
  jetPerEngine: 48,
  boosterBody: 5_200,
  shipBody: 1_800,
  steamBillow: 3_600,
  trenchBillow: 1_400,
  waterSpray: 800,
  wakePerBoat: 500,
  /** Wake / foam emitters (boats + recovery vessel + intruder). */
  boats: 8,
} as const;

/** Zone ring instances (selection 2 + recovery 4 + hazard 1, + spare). */
export const ZONE_CAPACITY = 8;

/**
 * Lighting order of a stage's engines (index = socket number − 1 → rank). An engine is lit iff `rank < lit`:
 * the sim reports only *how many* engines burn (`litFrac`), so the renderer decides which. Booster: 01–03 centre
 * and 04–13 inner light first (boostback 13, landing 3), the outer ring 14–33 last; an engine-out (lit 32, 31 …)
 * darkens outer engines spread around the ring instead of a clump. Ship: socket order.
 */
export function engineRanks(count: number): number[] {
  if (count !== 33) return Array.from({ length: count }, (_, i) => i);
  const ranks: number[] = [];
  for (let i = 0; i < 13; i++) ranks.push(i);
  // outer ring k = 0..19 (sockets 14–33): drop order spreads around the ring (stride 10, then 5, …)
  const drop = [0, 10, 5, 15, 3, 13, 8, 18, 1, 11, 6, 16, 4, 14, 9, 19, 2, 12, 7, 17];
  for (let k = 0; k < 20; k++) ranks.push(32 - drop.indexOf(k));
  return ranks;
}

/** Lit engine count from the interpolated `litFrac` channel. */
export function litCount(litFrac: number, engines: number): number {
  return Math.round(Math.min(1, Math.max(0, litFrac)) * engines);
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export interface PlumeShape {
  /** Plume body length along the thrust axis, m. */
  lengthM: number;
  /** Body radius at the engine plane, m. */
  r0M: number;
  /** Body radius at the plume end, m. */
  rEndM: number;
  /** Jet (per-engine core cone) length, m. */
  jetM: number;
  /** Sprite size scale (grows with the expansion at altitude). */
  sizeScale: number;
  /** Share of body sprites kept (fewer engines → fewer sprites), [0, 1]. */
  keep: number;
}

/**
 * Plume envelope for `lit` of `engines` engines at `altitudeM` above site ground. Sea level: tight, short plume;
 * the plume lengthens and balloons with altitude (ambient pressure drops), saturating by ~40 km. Engine-outs shrink
 * the body radius (≈ √ of the burning nozzle area) and thin the sprite count, so a lost engine is visible.
 */
export function plumeShape(lit: number, engines: number, clusterRadiusM: number, altitudeM: number): PlumeShape {
  const frac = engines > 0 ? clamp01(lit / engines) : 0;
  const a = clamp01(altitudeM / 40_000);
  const area = Math.sqrt(frac);
  const r0 = Math.max(0.9, clusterRadiusM * area);
  return {
    lengthM: (30 + 70 * area) * (1 + 5 * a),
    r0M: r0,
    rEndM: r0 * (1.6 + 8 * a),
    jetM: 7 + 10 * a,
    sizeScale: 1 + 2.2 * a,
    keep: lit > 0 ? 0.3 + 0.7 * frac : 0,
  };
}

/** Deluge / steam timeline on the pad, in T-clock seconds (`ANIM.pad.delugeS`). */
export const DELUGE = {
  /** Water on through the deluge sockets (T-3 s … T+10 s). */
  waterFromS: -3,
  waterToS: 10,
  /** Steam billows are born over this window after T-0 (most early). */
  birthToS: 9,
  /** Everything is gone by this T+ (fade 14 → 22 s: "dissipating over ~20 s"). */
  fadeFromS: 14,
  endS: 22,
} as const;

/** The pad FX run (any sprite can be alive) at T-clock `tS`. */
export function delugeActive(tS: number): boolean {
  return tS >= DELUGE.waterFromS && tS <= DELUGE.endS;
}

/** Wake length behind a boat moving at `speedMPerS` (≈ 45 s of foam, capped), m. */
export function wakeLengthM(speedMPerS: number): number {
  return Math.min(600, Math.abs(speedMPerS) * 45);
}

/** Recovery-zone ring radii around the vessel, m (display ranges, not sim data). */
export const RECOVERY_RINGS_M = [150, 300, 450] as const;
/** Outward sweep period of the active recovery zone, s (linear, mechanical). */
export const RECOVERY_SWEEP_S = 4;
/** Ring stroke widths, CSS px at DPR 1 (scaled by the drawing-buffer ratio). */
export const ZONE_STROKE_PX = { strong: 2, fine: 1.25 } as const;

/** Selection ring radius from asset bounds (horizontal half-extent + margin), m. */
export function selectionRadiusM(bounds: {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}): number {
  const half = Math.max(-bounds.min[0], bounds.max[0], -bounds.min[2], bounds.max[2]);
  return Math.max(6, half * 1.2 + 2);
}
