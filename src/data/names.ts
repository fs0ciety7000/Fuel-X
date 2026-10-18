// Names, call-signs and lore (GDD §5.1, §11, §12). All names are original; no seabird names.

export const org = { name: 'CALDER ORBITAL', short: 'CALDER', code: 'CDO' } as const;

export const region = { name: 'VARNE COAST', prevailingWindFromDeg: 210 } as const;

export type SiteId = 'LC-1' | 'LC-2' | 'TS-1' | 'BY-1';
export type SiteStatus = 'ACTIVE' | 'UNDER_CONSTRUCTION' | 'OPERATIONAL';

export interface SiteDef {
  readonly id: SiteId;
  readonly name: string;
  readonly role: string;
  /** Status at campaign start (GDD §11). Only LC-1 is playable in the MVP. */
  readonly status: SiteStatus;
  readonly playableInMvp: boolean;
}

export const sites: readonly SiteDef[] = [
  { id: 'LC-1', name: 'BRACKWATER', role: 'ORBITAL PAD', status: 'ACTIVE', playableInMvp: true },
  { id: 'LC-2', name: 'COBBLE REACH', role: 'ORBITAL PAD', status: 'UNDER_CONSTRUCTION', playableInMvp: false },
  { id: 'TS-1', name: 'FLINT HOLLOW', role: 'SUBORBITAL TEST STAND', status: 'OPERATIONAL', playableInMvp: false },
  { id: 'BY-1', name: 'KILNMOOR WORKS', role: 'BUILD YARD', status: 'OPERATIONAL', playableInMvp: false },
];

/** Vehicle class names (lore) keyed by technical role. */
export const classNames = {
  booster: 'BULWARK',
  ship: 'VESPER',
  transporter: 'MULE',
  crane: 'DERRICK',
  loxTanker: 'RIME',
  ch4Tanker: 'FEN',
  picket: 'PICKET',
  recovery: 'GRAPPLE',
  weatherStation: 'VANE',
} as const;

/** Call-sign prefixes (GDD §5.1). Serials are zero-padded to 2 digits and never reused. */
export const callSignPrefix = {
  booster: 'B-',
  ship: 'S-',
  tower: 'TOWER-',
  mount: 'OLM-',
  loxTank: 'LOX-',
  ch4Tank: 'CH4-',
  ln2Tank: 'LN2-',
  loxTanker: 'LX-',
  ch4Tanker: 'MX-',
  transporter: 'SP-',
  crane: 'CR-',
  crewVan: 'CV-',
  picket: 'PK-',
  recovery: 'RV-',
  weatherStation: 'WX-',
  intruder: 'UNK-',
  highBay: 'HB-',
  megaBay: 'MB-',
  tentHangar: 'TH-',
} as const;

/** The MVP flight (GDD §12): flight number per org, booster/ship pair shown as `B-09 / S-21`. */
export const mvpFlight = {
  name: 'LC-1 FLIGHT 7',
  number: 7,
  siteId: 'LC-1',
  booster: 'B-09',
  ship: 'S-21',
  tower: 'TOWER-1',
  mount: 'OLM-1',
  /** Prep assets: CR-77 lifts the stages onto SP-41, which carries them yard → OLM-1. */
  transporter: 'SP-41',
  crane: 'CR-77',
  contractId: 'NRL-3',
} as const;

/** Intruder call-sign used by anomaly A1. */
export const intruderCallSign = 'UNK-01';

/** Maritime hazard area name used in comms lines (`UNK-01 IN AREA BRAVO`). */
export const maritimeHazardAreaName = 'AREA BRAVO';
