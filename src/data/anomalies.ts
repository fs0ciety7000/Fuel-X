// Anomalies A1–A4 and director (BALANCING §8). Rates in 1/s, probabilities unitless, `…TS` = T-offset, s.
import type { Station } from './stations';

export type AnomalyId = 'A1' | 'A2' | 'A3' | 'A4';
export const ANOMALY_IDS: readonly AnomalyId[] = ['A1', 'A2', 'A3', 'A4'];

export const anomalies = {
  A1: {
    /** Range fouled: 0.12 per hour inside the window. */
    ratePerS: 0.12 / 3_600,
    windowStartTS: -7_200,
    windowEndTS: 0,
    intruderDistanceMinM: 4_000,
    intruderDistanceMaxM: 12_000,
    clearAfterInterceptS: 300,
    /** Sim addition 3.7 (review): UNK-01 is escorted out of AREA BRAVO at this speed, m/s. */
    escortSpeedMPerS: 4,
    /** Spawn-point draws tried to meet the picket distance band before accepting the last one. */
    spawnAttempts: 32,
  },
  /** Upper-wind spike = a weather front arriving inside load → T-0 (see weather.front). */
  A2: { windowEndTS: 0 },
  A3: {
    probabilityPerLoad: 0.1,
    fixDurationS: 1_200,
    /**
     * Sim addition 3.7 (review): the leak starts when the booster LOX line reaches a uniform fraction of
     * its capacity in this band (so it always hits an active load).
     */
    onsetLoadFractionMin: 0.05,
    onsetLoadFractionMax: 0.6,
  },
  A4: {
    perEngineAscent: 6e-4,
    perEngineBoostback: 1.5e-3,
    /** Sim addition 3.7 (review): an ascent engine-out happens at a uniform mission time in this band, s. */
    ascentWindowS: [10, 150] as const,
    /** Director-scheduled A4: probability that it hits ascent rather than boostback (unitless). */
    directorAscentShare: 0.5,
  },
  /**
   * Base probability of a catastrophic ascent failure, per flight. Never scheduled by the director.
   * Not simulated yet (3.7 deviation, see BALANCING §12): kept for the campaign.
   */
  catastrophicAscentPerFlight: 0.004,
  /** GO on MARGINAL multiplies the matching category's probabilities by this. */
  marginalRiskMultiplier: 2.0,
  /**
   * Sim addition 3.7 (review): which anomaly probabilities a GO-on-MARGINAL station multiplies (GDD §7.1
   * "matching category"). Only ascent anomalies are rolled after the GO, so WEATHER (upper-wind loads) and
   * VEHICLE (soft fault) map to A4; the other stations carry no ascent risk in the MVP.
   */
  marginalCategories: {
    WEATHER: ['A4'],
    RANGE: [],
    PROPELLANT: [],
    VEHICLE: ['A4'],
    PAD_CREW: [],
  } satisfies Record<Station, readonly AnomalyId[]>,
  director: {
    guaranteeOne: true,
    /** If no anomaly fired by this T-offset, schedule one. */
    deadlineTS: -1_800,
    /** A3 only eligible while the load has not finished; renormalise. */
    weights: { A1: 0.3, A2: 0.25, A3: 0.2, A4: 0.25 } satisfies Record<AnomalyId, number>,
    /**
     * Sim addition 3.7 (review): the director draws its guaranteed anomaly at scenario start (weighted, seeded)
     * and a trigger point inside the anomaly's window before the deadline: A1 at a T-offset in
     * [A1.windowStartTS, deadlineTS], A2 (front arrives) in [a2EarliestTS, deadlineTS] during load, A3 at a
     * load fraction (A3 band), A4 during the flight. The deadline rule stays as the fallback.
     */
    a2EarliestTS: -4_500,
    /**
     * Sim addition 3.9 (review): the fallback also runs this long before the window closes, for a count that
     * never reaches the deadline (frozen at a poll, e.g. a run without any input), s.
     */
    windowCloseLeadS: 1_800,
  },
};
