// Catch model (BALANCING §7): p = erf(tol / (σ·√2)), one seeded roll at the catch event. SI: m, m/s, kg.

export const catchModel = {
  /** Catch-arm lateral tolerance, m. */
  armsToleranceM: 1.8,
  sigmaBaseM: 0.6,
  sigmaPerEngineOutM: 0.9,
  /** σ increase per m/s of tower wind above `sigmaWindRefMPerS`, m per (m/s). */
  sigmaWindCoefMPerMPerS: 0.12,
  sigmaWindRefMPerS: 8,
  /** σ increase when landing propellant < `lowPropRefKg`, m. */
  sigmaLowPropM: 0.4,
  lowPropRefKg: 50_000,
  /** Forced divert above this tower wind, m/s. */
  towerWindLimitCatchMPerS: 20,
  /** Policy without player input: catch if p ≥ this (unitless). */
  autoCatchThreshold: 0.9,
  /** Display / assert only (profile is scripted), m/s. */
  maxVerticalSpeedMPerS: 2,
};
