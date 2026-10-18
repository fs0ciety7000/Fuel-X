// Weather (BALANCING §8). Ornstein–Uhlenbeck series, seeded. SI: m/s, s, m. `…TS` = signed T-offset, s.
export const weather = {
  groundWind: {
    meanMPerS: 7,
    sdMPerS: 2.5,
    tauS: 1_800,
    fromDeg: 210,
    /**
     * Sim addition 3.7 (game-designer to review): gust-inclusive ground wind = mean wind × this. Prep compares
     * the gust to the stack (13 m/s) / transporter (15 m/s) limits, so a 10.4 m/s wind pauses stacking.
     */
    gustFactor: 1.25,
    /**
     * Sim addition 3.7 (review): wind at the catch arms (tower top, ~145 m) = ground wind × this (power-law
     * profile). Feeds the catch model σ and the forced-divert limit.
     */
    towerFactor: 1.3,
  },
  upperWind: { meanMPerS: 35, sdMPerS: 10, tauS: 3_600, altitudeM: 12_000 },
  launchLimit: { groundWindMPerS: 13, upperWindMPerS: 60 },
  front: {
    /** Probability that a front occurs in a run (unitless); drives A2. */
    probabilityPerRun: 0.35,
    upperWindBoostMPerS: 18,
    rampS: 1_800,
    durationMinS: 2_400,
    durationMaxS: 5_400,
    /**
     * Sim addition 3.7 (review): a natural front starts ramping at a uniform T-offset in this range (scenario
     * start → window close). It only counts as anomaly A2 when it arrives during propellant load → T-0.
     */
    arrivalEarliestTS: -21_600,
    arrivalLatestTS: 4_500,
  },
  forecast: {
    /** Forecast error growth: 1.0 m/s per hour of lead time, expressed per second of lead. */
    errorGrowthMPerSPerS: 1.0 / 3_600,
    horizonS: 10_800,
  },
};
