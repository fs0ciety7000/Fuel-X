// Weather (BALANCING §8). Ornstein–Uhlenbeck series, seeded. SI: m/s, s, m.

export const weather = {
  groundWind: { meanMPerS: 7, sdMPerS: 2.5, tauS: 1_800, fromDeg: 210 },
  upperWind: { meanMPerS: 35, sdMPerS: 10, tauS: 3_600, altitudeM: 12_000 },
  launchLimit: { groundWindMPerS: 13, upperWindMPerS: 60 },
  front: {
    /** Probability that a front occurs in a run (unitless); drives A2. */
    probabilityPerRun: 0.35,
    upperWindBoostMPerS: 18,
    rampS: 1_800,
    durationMinS: 2_400,
    durationMaxS: 5_400,
  },
  forecast: {
    /** Forecast error growth: 1.0 m/s per hour of lead time, expressed per second of lead. */
    errorGrowthMPerSPerS: 1.0 / 3_600,
    horizonS: 10_800,
  },
};
