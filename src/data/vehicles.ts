// Vehicles (BALANCING §1). SI units: m, kg. Wear and health are unitless fractions 0–1.

export const vehicles = {
  booster: {
    heightM: 71,
    diameterM: 9,
    dryMassKg: 250_000,
    propMassKg: 3_400_000,
    /** propMass × OF/(1+OF), rounded (BALANCING §1 derived row). */
    loxCapKg: 2_660_000,
    /** propMass × 1/(1+OF), rounded. */
    ch4CapKg: 740_000,
    engines: 33,
    boostbackEngines: 13,
    landingEngines: 3,
  },
  ship: {
    heightM: 52,
    diameterM: 9,
    dryMassKg: 120_000,
    propMassKg: 1_500_000,
    loxCapKg: 1_174_000,
    ch4CapKg: 326_000,
    engines: 6,
  },
  /** Methalox O/F ratio by mass (unitless). */
  mixtureRatioOF: 3.6,
  /** Starting state of the MVP booster B-09 (flight-proven). */
  mvpBooster: { flightCount: 4, wear: 0.22 },
  wear: {
    perNominalFlight: 0.06,
    engineOut: 0.1,
    highWindCatch: 0.04,
    /** Tower wind above which a catch counts as high-wind, m/s. */
    highWindCatchAboveMPerS: 10,
    /** reliabilityFactor = 1 + reliabilityPerWear × wear (multiplies all booster failure probabilities). */
    reliabilityPerWear: 2,
  },
  /** VEHICLE station GO threshold on vehicle health (0–1). */
  vehicleHealthGoThreshold: 0.8,
};
