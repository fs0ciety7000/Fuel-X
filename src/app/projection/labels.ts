// Display vocabulary for the projection: codes → uppercase words, glyph ids and semantic states (DESIGN_SYSTEM §2.3,
// §7). English only (i18n-ready: every label is keyed by a machine code). Data tables, no logic beyond lookups.
import type { GlyphId, Severity } from '@bridge/projection-types';
import type {
  AnomalyId,
  BoatRole,
  DebriefOutcome,
  Entity,
  GoStatus,
  HoldReason,
  Kind,
  LedgerItem,
  Phase,
  PollId,
  Station,
  StationDriver,
} from '@sim/types';
import { words } from './format';

/** Glyph + word + semantic state of a status (chips, rows, labels); mapped onto the VM shapes by the projectors. */
export interface StatusVM {
  code: string;
  label: string;
  glyph: GlyphId;
  severity: Severity;
}

export const KIND_LABEL: Record<Kind, string> = {
  booster: 'BOOSTER',
  ship: 'SHIP',
  tower: 'TOWER',
  pad: 'LAUNCH MOUNT',
  tank: 'TANK',
  tanker: 'TANKER',
  transporter: 'TRANSPORTER',
  crane: 'CRANE',
  van: 'CREW VAN',
  boat: 'BOAT',
  wxStation: 'WEATHER STATION',
  building: 'BUILDING',
};

export const BOAT_ROLE_LABEL: Record<BoatRole, string> = {
  picket: 'PICKET',
  recovery: 'RECOVERY VESSEL',
  intruder: 'UNKNOWN VESSEL',
};

export const PHASE_LABEL: Record<Phase, string> = {
  Standby: 'STANDBY',
  Rollout: 'ROLLOUT',
  Stack: 'STACK',
  PropellantLoad: 'PROPELLANT LOAD',
  TerminalCount: 'TERMINAL COUNT',
  Liftoff: 'LIFTOFF',
  Boostback: 'BOOSTBACK',
  TowerCatch: 'TOWER CATCH',
  Divert: 'DIVERT',
  Safing: 'SAFING',
  Scrubbed: 'SCRUBBED',
  Debrief: 'DEBRIEF',
};

export const POLL_LABEL: Record<PollId, string> = {
  load: 'LOAD POLL',
  terminal: 'TERMINAL POLL',
  final: 'FINAL POLL',
};

export const HOLD_LABEL: Record<HoldReason, string> = {
  MANUAL: 'HOLD · MANUAL',
  POLL: 'HOLD · POLL',
  NO_GO: 'HOLD · NO-GO',
  LOAD_INCOMPLETE: 'HOLD · LOAD INCOMPLETE',
  LEAK_FIX: 'HOLD · LEAK FIX',
};

export const STATION_CODE: Record<Station, string> = {
  WEATHER: 'WX',
  RANGE: 'RNG',
  PROPELLANT: 'PRP',
  VEHICLE: 'VEH',
  PAD_CREW: 'CRW',
};

export const STATION_LABEL: Record<Station, string> = {
  WEATHER: 'WEATHER',
  RANGE: 'RANGE',
  PROPELLANT: 'PROPELLANT',
  VEHICLE: 'VEHICLE',
  PAD_CREW: 'PAD/CREW',
};

export const DRIVER_LABEL: Record<StationDriver, string> = {
  NOMINAL: 'NOMINAL',
  GROUND_WIND: 'GROUND WIND',
  UPPER_WIND: 'UPPER WIND',
  FORECAST_UPPER_WIND: 'FORECAST UPPER WIND',
  INTRUDER: 'INTRUDER IN AREA',
  PICKET_REPOSITIONING: 'PICKET REPOSITIONING',
  FARM_RESERVE_LOX: 'FARM RESERVE LOX',
  FARM_RESERVE_CH4: 'FARM RESERVE CH4',
  GSE_LEAK: 'GSE LEAK',
  VEHICLE_HEALTH: 'VEHICLE HEALTH',
  CREW_IN_HAZARD: 'CREW IN HAZARD AREA',
  CREW_SHIFT: 'CREW SHIFT',
};

export const GO_LABEL: Record<GoStatus, string> = { GO: 'GO', MARGINAL: 'MARGINAL', NO_GO: 'NO-GO' };

export function goStatus(s: GoStatus): StatusVM {
  switch (s) {
    case 'GO':
      return { code: s, label: 'GO', glyph: 'ok', severity: 'ok' };
    case 'MARGINAL':
      return { code: s, label: 'MARGINAL', glyph: 'warn', severity: 'warn' };
    case 'NO_GO':
      return { code: s, label: 'NO-GO', glyph: 'danger', severity: 'danger' };
  }
}

export const FLUID_LABEL: Record<'LOX' | 'CH4' | 'LN2', string> = {
  LOX: 'LIQUID OXYGEN',
  CH4: 'LIQUID METHANE',
  LN2: 'LIQUID NITROGEN',
};

export const OUTCOME_LABEL: Record<DebriefOutcome, string> = {
  CAUGHT: 'BOOSTER CAUGHT',
  DIVERTED: 'BOOSTER DIVERTED',
  CATCH_FAILED: 'CATCH FAILED',
  SCRUBBED: 'SCRUBBED',
};

export const OUTCOME_STATUS: Record<DebriefOutcome, StatusVM> = {
  CAUGHT: { code: 'CAUGHT', label: 'CAUGHT', glyph: 'caught', severity: 'ok' },
  DIVERTED: { code: 'DIVERTED', label: 'DIVERTED', glyph: 'warn', severity: 'warn' },
  CATCH_FAILED: { code: 'CATCH_FAILED', label: 'CATCH FAILED', glyph: 'danger', severity: 'danger' },
  SCRUBBED: { code: 'SCRUBBED', label: 'SCRUBBED', glyph: 'danger', severity: 'danger' },
};

export const LEDGER_LABEL: Record<LedgerItem, string> = {
  HAULAGE_FEE: 'HAULAGE FEES',
  PROPELLANT_PURCHASE: 'PROPELLANT PURCHASED',
  PROPELLANT_LOST: 'PROPELLANT LOST',
  CONTRACT_PRICE: 'CONTRACT PRICE',
  SHIP_EXPENDED: 'SHIP EXPENDED',
  BOOSTER_REFURB: 'BOOSTER REFURBISHMENT',
  BOOSTER_LOST: 'BOOSTER LOST',
  TOWER_REPAIR: 'TOWER REPAIR',
  TOWER_DOWNTIME: 'TOWER DOWNTIME',
  WINDOW_MISSED: 'WINDOW MISSED',
  OPS_COST: 'OPERATIONS',
};

export const ANOMALY_LABEL: Record<AnomalyId, string> = {
  A1: 'RANGE FOULED',
  A2: 'UPPER-WIND SPIKE',
  A3: 'GSE LEAK',
  A4: 'ENGINE OUT',
};

/** Reason codes (CommandRejected, blockers) → words; unknown codes fall back to `words(code)`. */
export const REASON_LABEL: Record<string, string> = {
  STACK_NOT_COMPLETE: 'STACK NOT COMPLETE',
  NOT_IN_PROPELLANT_LOAD: 'NOT IN PROPELLANT LOAD',
  WINDOW_NOT_OPEN_AT_T0: 'WINDOW NOT OPEN AT T-0',
  STATION_NO_GO: 'A STATION IS NO-GO',
  LOAD_INCOMPLETE: 'LOAD INCOMPLETE',
  LEAK_FIX_IN_PROGRESS: 'LEAK FIX IN PROGRESS',
  NOT_HOLDING: 'COUNT IS RUNNING',
  ROAD_CLOSED: 'ROAD CLOSED',
};
export const reasonLabel = (code: string | null): string => (code ? (REASON_LABEL[code] ?? words(code)) : '');

type S = [GlyphId, Severity];
const IDLE: S = ['idle', 'neutral'];

/** FSM state → glyph + severity per kind (DESIGN_SYSTEM §2.3 / §7). */
const STATE_STYLE: Partial<Record<Kind, Record<string, S>>> = {
  booster: {
    IN_YARD: IDLE,
    ON_TRANSPORTER: ['driving', 'active'],
    STACKING: ['current', 'active'],
    STACKED: ['stacked', 'ok'],
    LOADING: ['fueling', 'active'],
    LOADED: ['stacked', 'ok'],
    DETANKING: ['fueling', 'warn'],
    ASCENT: ['ascent', 'active'],
    BOOSTBACK: ['boostback', 'active'],
    DESCENT: ['descent', 'active'],
    DIVERTED: ['descent', 'warn'],
    CAUGHT_SAFING: ['caught', 'ok'],
    LOST: ['danger', 'danger'],
  },
  ship: {
    IN_YARD: IDLE,
    ON_TRANSPORTER: ['driving', 'active'],
    STACKING: ['current', 'active'],
    STACKED: ['stacked', 'ok'],
    LOADING: ['fueling', 'active'],
    LOADED: ['stacked', 'ok'],
    DETANKING: ['fueling', 'warn'],
    ASCENT: ['ascent', 'active'],
    SEPARATED: ['ascent', 'active'],
    SECO: ['ok', 'ok'],
    OFF_SCENE: ['offline', 'disabled'],
    LOST: ['danger', 'danger'],
  },
  tower: {
    IDLE: IDLE,
    STACKING: ['current', 'active'],
    WIND_HOLD: ['holding', 'warn'],
    CATCH_READY: ['ok', 'ok'],
    CATCHING: ['current', 'active'],
    DAMAGED: ['danger', 'danger'],
  },
  tanker: {
    OFFMAP: ['offline', 'disabled'],
    INBOUND: ['driving', 'active'],
    GATE_WAIT: ['holding', 'warn'],
    OFFLOADING: ['fueling', 'active'],
    OUTBOUND: ['driving', 'active'],
  },
  transporter: {
    IDLE: IDLE,
    LOADING: ['current', 'active'],
    MOVING: ['driving', 'active'],
    WIND_HOLD: ['holding', 'warn'],
    AT_PAD: ['parked', 'ok'],
    RETURNING: ['driving', 'active'],
  },
  crane: { IDLE: IDLE, LIFTING: ['current', 'active'] },
  van: {
    PARKED: ['parked', 'neutral'],
    TO_PAD: ['driving', 'active'],
    AT_PAD: ['parked', 'neutral'],
    TO_SAFE: ['driving', 'active'],
  },
  boat: {
    DOCKED: ['parked', 'neutral'],
    PATROL: ['patrol', 'active'],
    INTERCEPT: ['patrol', 'warn'],
    ESCORT: ['patrol', 'active'],
    RETURNING: ['patrol', 'active'],
    ON_STATION: ['holding', 'ok'],
    IN_AREA: ['danger', 'danger'],
    INTERCEPTED: ['warn', 'warn'],
    LEAVING: ['patrol', 'neutral'],
  },
};

const STATE_WORDS: Record<string, string> = {
  CAUGHT_SAFING: 'CAUGHT, SAFING',
  OFFMAP: 'OFF-SITE',
  OFF_SCENE: 'OFF-SCENE',
};

/** FSM state of an entity, or a derived state for kinds without one. */
export function entityStateCode(e: Entity): string {
  switch (e.kind) {
    case 'pad':
      return e.boosterId ? 'OCCUPIED' : 'CLEAR';
    case 'tank':
      return 'STORING';
    case 'wxStation':
    case 'building':
      return 'NOMINAL';
    default:
      return e.fsm.state;
  }
}

/** Ambient transporter duty (SP-42, 7.3): its states read as the yard ⇄ tank-farm loop, prefixed `AMBIENT · `. */
const AMBIENT_TRANSPORTER_WORDS: Record<string, string> = {
  IDLE: 'IN YARD',
  MOVING: 'TO FARM',
  AT_PAD: 'AT FARM',
  RETURNING: 'TO YARD',
  WIND_HOLD: 'WIND HOLD',
};

/** Background vehicle (no tasks, not the player's): SP-42's duty loop. */
export const isAmbient = (e: Entity): boolean => e.kind === 'transporter' && e.role === 'ambient';

export function entityStatus(e: Entity): StatusVM {
  const code = entityStateCode(e);
  const style = STATE_STYLE[e.kind]?.[code] ?? (code === 'OCCUPIED' ? (['stacked', 'ok'] as S) : IDLE);
  const label = isAmbient(e)
    ? `AMBIENT · ${AMBIENT_TRANSPORTER_WORDS[code] ?? words(code)}`
    : (STATE_WORDS[code] ?? words(code));
  return { code, label, glyph: style[0], severity: style[1] };
}

export function kindLabel(e: Entity): string {
  return e.kind === 'boat' ? BOAT_ROLE_LABEL[e.role] : KIND_LABEL[e.kind];
}
