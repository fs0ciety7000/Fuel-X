// The projection before the first projector run (and the base for UI fixtures): every field present, all missing.
import type { DisplayValue, SparkVM, StatusVM, UiProjection } from './projection-types';

/** A missing value in a fixed slot: `—`, state neutral (DESIGN_SYSTEM §4). */
export function missing(unit = ''): DisplayValue {
  return { text: '—', unit, si: null };
}

const NONE: StatusVM = { code: 'NONE', label: '—', glyph: 'idle', severity: 'neutral' };
const spark = (unit: string, max: number): SparkVM => ({ values: [], unit, min: 0, max, threshold: null });

export function emptyProjection(): UiProjection {
  return {
    version: 1,
    seq: 0,
    tick: 0,
    simTimeS: 0,
    clock: {
      utc: '—',
      utcS: 0,
      tClock: '—',
      tClockS: null,
      phase: null,
      phaseLabel: '—',
      holding: false,
      holdReason: null,
      holdLabel: '',
      windowOpenUtc: '',
      windowCloseUtc: '',
      windowState: 'NONE',
      windowRemaining: missing(),
    },
    timeScale: {
      requested: 1,
      effective: 0,
      maxAllowed: 100,
      paused: false,
      forced1x: false,
      lockReason: null,
      lockLabel: '',
      lagging: false,
      effectiveRate: missing('×'),
      readout: 'SIM —',
      skip: { enabled: false, target: '', reason: 'NOT_READY' },
    },
    economy: { money: missing('M CR'), reputation: missing('REP') },
    range: {
      status: null,
      label: 'RANGE —',
      state: NONE,
      reason: '',
      goCount: 0,
      total: 5,
      stations: [],
      weather: {
        groundWind: missing('M/S'),
        groundGust: missing('M/S'),
        towerWind: missing('M/S'),
        upperWind: missing('M/S'),
        windFrom: missing('°'),
        upperForecastPeak: missing('M/S'),
        groundLimit: missing('M/S'),
        upperLimit: missing('M/S'),
        marginSpark: spark('', 1),
      },
    },
    alerts: { open: 0, unacked: 0, maxSeverity: 'none', label: '0 ALERTS', items: [] },
    flight: null,
    countdown: null,
    decision: null,
    inspector: null,
    lists: {
      vehicles: [],
      tanks: [],
      tasks: [],
      range: [],
      events: [],
      badges: {
        vehicles: { warn: 0, danger: 0 },
        tanks: { warn: 0, danger: 0 },
        tasks: { warn: 0, danger: 0 },
        range: { warn: 0, danger: 0 },
        events: { warn: 0, danger: 0 },
      },
    },
    labels: [],
    sites: [],
    debrief: null,
    view: { siteId: 'LC-1', selectedId: null, followId: null, selected: null, follow: null, tab: 'vehicles' },
  };
}
