// Contract and window (BALANCING §5). Money in cr, mass in kg, times in s (`…TS` = signed T-offset).

export interface ContractDef {
  readonly id: string;
  readonly customer: string;
  readonly payloadLabel: string;
  readonly orbitLabel: string;
  /** Window opens at this offset from the *planned* T-0 (planned T-0 = open + 15 min). */
  readonly windowOpenTS: number;
  readonly windowDurationS: number;
  readonly payloadMassKg: number;
  readonly priceCr: number;
  readonly penaltyWindowMissedCr: number;
  readonly penaltyPayloadLostCr: number;
  readonly rebookDelayS: number;
}

export const mvpContract: ContractDef = {
  id: 'NRL-3',
  customer: 'NORRLAND RELAY',
  payloadLabel: '14 RELAY SATELLITES',
  orbitLabel: 'LEO',
  windowOpenTS: -900,
  windowDurationS: 5_400,
  payloadMassKg: 95_000,
  priceCr: 62_000_000,
  penaltyWindowMissedCr: 15_000_000,
  penaltyPayloadLostCr: 40_000_000,
  rebookDelayS: 86_400,
};

/** Contracts by id. */
export const contracts: Readonly<Record<string, ContractDef>> = { [mvpContract.id]: mvpContract };
