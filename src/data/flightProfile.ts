// Nominal flight profile (BALANCING §6): keyframes interpolated by the flight system. SI: s, m, m/s, kg.
// `null` = not specified by BALANCING (the flight system interpolates across it).

export type FlightEvent =
  | 'LIFTOFF'
  | 'MAX_Q'
  | 'MECO'
  | 'HOT_STAGING'
  | 'BOOSTBACK_START'
  | 'BOOSTBACK_END'
  | 'APOGEE'
  | 'LANDING_BURN'
  | 'CATCH';

export interface BoosterKeyframe {
  readonly event: FlightEvent;
  /** Mission time T+, s. */
  readonly tS: number;
  readonly altitudeM: number;
  /** Ground distance from OLM-1 along the launch heading, m (sim addition 3.6, see BALANCING §6). */
  readonly downrangeM: number;
  readonly speedMPerS: number | null;
  readonly boosterPropKg: number;
}

export const flightProfile = {
  booster: [
    { event: 'LIFTOFF', tS: 0, altitudeM: 0, downrangeM: 0, speedMPerS: 0, boosterPropKg: 3_400_000 },
    { event: 'MAX_Q', tS: 62, altitudeM: 12_000, downrangeM: 4_000, speedMPerS: 450, boosterPropKg: 2_100_000 },
    { event: 'MECO', tS: 155, altitudeM: 68_000, downrangeM: 60_000, speedMPerS: 1_550, boosterPropKg: 240_000 },
    { event: 'HOT_STAGING', tS: 160, altitudeM: 71_000, downrangeM: 66_000, speedMPerS: 1_540, boosterPropKg: 235_000 },
    {
      event: 'BOOSTBACK_START',
      tS: 165,
      altitudeM: 74_000,
      downrangeM: 70_000,
      speedMPerS: null,
      boosterPropKg: 230_000,
    },
    /** Speed reversed (heading back to the site). */
    { event: 'BOOSTBACK_END', tS: 215, altitudeM: 85_000, downrangeM: 72_000, speedMPerS: 900, boosterPropKg: 110_000 },
    { event: 'APOGEE', tS: 250, altitudeM: 95_000, downrangeM: 60_000, speedMPerS: 600, boosterPropKg: 108_000 },
    /** Landing burn ignition = catch decision deadline. */
    { event: 'LANDING_BURN', tS: 380, altitudeM: 1_200, downrangeM: 0, speedMPerS: 280, boosterPropKg: 90_000 },
    /** Catch point height above the pad; vertical speed ≤ 1 m/s. */
    { event: 'CATCH', tS: 415, altitudeM: 60, downrangeM: 0, speedMPerS: 1, boosterPropKg: 60_000 },
  ] satisfies readonly BoosterKeyframe[],
  /** Launch azimuth: compass heading of the ground track, rad (east, over the sea; sim addition 3.6). */
  launchHeadingRad: Math.PI / 2,
  ship: {
    /** Ship SECO: contract fulfilment event; the ship then leaves the scene. */
    secoTS: 515,
    secoAltitudeM: 150_000,
    secoSpeedMPerS: 7_300,
    /** Sim additions 3.6 (designer to review): ground distance and propellant left at SECO. */
    secoDownrangeM: 1_300_000,
    secoPropKg: 80_000,
  },
  divert: {
    /**
     * Offshore splashdown T+, s. Until a CATCH is committed the booster aims at the divert point (offset
     * ramps 0 → offshoreDistanceM over boostback start → landing burn); a CATCH shifts the aim back to the
     * tower by the catch time.
     */
    splashdownTS: 420,
    /** Offshore aim point distance from OLM-1, m. */
    offshoreDistanceM: 8_000,
  },
  /** Below this landing propellant, divert is forced, kg. */
  landingMinPropKg: 30_000,
  engineOut: {
    ascentMecoDelayS: 4,
    ascentLandingPropPenaltyKg: 25_000,
    boostbackLandingPropPenaltyKg: 35_000,
  },
  /** Acceptance tolerances (GDD AC 16), s. */
  tolerance: { mecoS: 2, catchS: 5 },
};
