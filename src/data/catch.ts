// Catch model (BALANCING §7, §13): p = erf(tol / (σ·√2)), one seeded roll at the catch event. SI: m, m/s, kg.

export const catchModel = {
  /** Catch-arm lateral tolerance, m. */
  armsToleranceM: 1.8,
  sigmaBaseM: 0.6,
  sigmaPerEngineOutM: 1.0,
  /** σ increase per m/s of tower wind above `sigmaWindRefMPerS`, m per (m/s). */
  sigmaWindCoefMPerMPerS: 0.15,
  /** Reference **tower** wind (≈ ground 8.5 m/s × towerFactor 1.3), m/s. */
  sigmaWindRefMPerS: 11,
  /** σ increase when landing propellant < `lowPropRefKg`, m. */
  sigmaLowPropM: 0.4,
  /** A boostback engine-out (≈ 55 t at landing) is low-prop, an ascent one (≈ 65 t) is not, kg. */
  lowPropRefKg: 60_000,
  /** Forced divert above this tower wind, m/s. */
  towerWindLimitCatchMPerS: 20,
  /**
   * Policy without player input: catch if p ≥ this (unitless), the LEAN band floor — AUTO catches CLEAR and LEAN,
   * diverts CONTESTED and AGAINST (BALANCING §15 P3, GDD AC 19). Hands-off sweep: diverted 10–25 %, failed ≤ 8 % of
   * flights (AC 3c, re-targeted in §15; was 0.70 for the old 15 % floor, §13.5).
   */
  autoCatchThreshold: 0.65,
  /** Display / assert only (profile is scripted), m/s. */
  maxVerticalSpeedMPerS: 2,
  /** Decision-strip bands, UI only (not read by the sim): CLEAR ≥ clear · LEAN ≥ lean · CONTESTED ≥ contested · AGAINST. */
  bands: { clear: 0.9, lean: 0.65, contested: 0.45 },
};
