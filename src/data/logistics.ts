// Logistics (BALANCING §3). SI: kg, kg/s, m, m/s, s; money in cr. `…TS` = signed T-clock offset, s.

export const logistics = {
  tanker: {
    /** RIME `LX` LOX road tanker capacity, kg. */
    loxCapKg: 20_000,
    /** FEN `MX` methane (LNG) road tanker capacity, kg. */
    ch4CapKg: 16_000,
    offloadRateKgPerS: 15,
    /** On-site road speed, m/s (30 km/h). */
    speedOnSiteMPerS: 8.3,
  },
  fleet: { lx: 4, mx: 2 },
  delivery: {
    standard: { leadTimeS: 14_400, feeCrPerTruck: 6_000 },
    rush: { leadTimeS: 5_400, feeCrPerTruck: 120_000 },
  },
  /** No tanker inside the pad hazard radius from this T-offset until Safing ends (T-00:40:00). */
  roadClosureStartTS: -2_400,
  /** Road keep-out radius around OLM-1, m (game scale). */
  hazardPadRadiusM: 3_000,
  transporter: {
    /** MULE `SP` speed loaded / empty, m/s. */
    speedLoadedMPerS: 1.0,
    speedEmptyMPerS: 2.0,
  },
  /** Yard → OLM-1 route length, m. The LC-1 layout path `sp.yardToOlm1` must match it (tested). */
  routeYardToPadM: 1_800,
  /** CR-77 lifts a stage onto the transporter, s. */
  craneLoadTaskS: 1_800,
  tower: { stackBoosterS: 5_400, stackShipS: 3_600 },
  windLimit: {
    /** Gusts above this pause a stack task, m/s. */
    stackMPerS: 13,
    /** Transporter cannot move above this, m/s. */
    transporterMPerS: 15,
  },
  crewVanSpeedMPerS: 11,
  picketSpeedMPerS: 12,
  recoveryVesselSpeedMPerS: 6,
};
