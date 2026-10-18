// Anomalies A1–A4 and director (BALANCING §8). Rates in 1/s, probabilities unitless, `…TS` = T-offset, s.

export type AnomalyId = 'A1' | 'A2' | 'A3' | 'A4';

export const anomalies = {
  A1: {
    /** Range fouled: 0.12 per hour inside the window. */
    ratePerS: 0.12 / 3_600,
    windowStartTS: -7_200,
    windowEndTS: 0,
    intruderDistanceMinM: 4_000,
    intruderDistanceMaxM: 12_000,
    clearAfterInterceptS: 300,
  },
  /** Upper-wind spike = a weather front arriving inside load → T-0 (see weather.front). */
  A2: { windowEndTS: 0 },
  A3: { probabilityPerLoad: 0.1, fixDurationS: 1_200 },
  A4: { perEngineAscent: 6e-4, perEngineBoostback: 1.5e-3 },
  /** Base probability of a catastrophic ascent failure, per flight. Never scheduled by the director. */
  catastrophicAscentPerFlight: 0.004,
  /** GO on MARGINAL multiplies the matching category's probabilities by this. */
  marginalRiskMultiplier: 2.0,
  director: {
    guaranteeOne: true,
    /** If no anomaly fired by this T-offset, schedule one. */
    deadlineTS: -1_800,
    /** A3 only eligible while the load has not finished; renormalise. */
    weights: { A1: 0.3, A2: 0.25, A3: 0.2, A4: 0.25 } satisfies Record<AnomalyId, number>,
  },
};
