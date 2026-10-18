// Economy (BALANCING §9). Money in cr, durations in s, reputation in points (0–100).

export const economy = {
  startMoneyCr: 30_000_000,
  startReputation: 50,
  priceCrPerKg: { LOX: 0.15, CH4: 0.5 },
  shipExpendedCostCr: 20_000_000,
  boosterReplacementCostCr: 40_000_000,
  boosterRefurbNominalCr: 1_500_000,
  boosterRefurbNominalS: 259_200,
  towerRepairCostCr: 25_000_000,
  towerRepairDowntimeS: 1_814_400,
  /** 1 000 000 cr per day. */
  opsCostCrPerS: 1_000_000 / 86_400,
  reputationDelta: { success: 8, windowMissed: -10, payloadLost: -30, towerDamaged: -15 },
};
