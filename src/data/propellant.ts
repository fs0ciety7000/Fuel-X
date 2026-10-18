// Tank farm and propellant (BALANCING §2). SI: kg, kg/s, s; boil-off as fraction of mass per second (1/s).

export type Fluid = 'LOX' | 'CH4' | 'LN2';
export type Propellant = 'LOX' | 'CH4';

export const propellant = {
  farm: {
    loxTankCount: 3,
    loxTankCapKg: 1_800_000,
    ch4TankCount: 2,
    ch4TankCapKg: 750_000,
    /** LN2 sphere (purge/chill): ambient in the MVP, static level. */
    ln2TankCapKg: 600_000,
    /** Unusable bottom fraction per tank (unitless). */
    heelFraction: 0.03,
    /** Farm boil-off, fraction of tank mass per second: LOX 0.20 %/day, CH4 0.10 %/day. */
    boilOffFractionPerS: { LOX: 2.3e-8, CH4: 1.2e-8 } satisfies Record<Propellant, number>,
  },
  /** MVP start inventories (main D1 lever): usable margin ≈ 88 t LOX / 17 t CH4 after a nominal load. */
  mvpStart: { farmLoxKg: 4_150_000, farmCh4Kg: 1_140_000 },
  /** Vehicle load rates, kg/s (≈ 44 min booster, ≈ 43 min ship). */
  loadRateKgPerS: {
    booster: { LOX: 1_000, CH4: 280 } satisfies Record<Propellant, number>,
    ship: { LOX: 450, CH4: 125 } satisfies Record<Propellant, number>,
  },
  /** Load-rate multiplier while degraded by the A3 GSE leak (unitless). */
  degradedLoadFactor: 0.5,
  /** Loaded-vehicle boil-off (replaced by topping from the farm), 1/s: LOX 0.06 %/min, CH4 0.04 %/min. */
  vehicleBoilOffFractionPerS: { LOX: 1.0e-5, CH4: 6.7e-6 } satisfies Record<Propellant, number>,
  /** Fraction of loaded propellant lost on a scrub detank (unitless). */
  scrubDetankLossFraction: 0.15,
  /** PROPELLANT station goes MARGINAL when the farm can top for less than this, s. */
  stationMarginalBelowToppingS: 3_600,
};
