// The projection before the first projector run (and a base for UI fixtures): every field present, all missing.
import type { UiProjection, ValueVM } from './projection-types';

/** A missing value in a fixed slot: `—` (DESIGN_SYSTEM §4). */
export function missing(unit = ''): ValueVM {
  return { text: '—', unit, value: null };
}

const badge = (): { warn: number; danger: number } => ({ warn: 0, danger: 0 });

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
      missionClock: null,
      phase: null,
      phaseLabel: '—',
      holding: false,
      holdReason: null,
      holdLabel: '',
      windowOpenAt: '',
      windowCloseAt: '',
      windowState: 'NONE',
      windowRemaining: missing(),
    },
    timeScale: {
      requested: 1,
      resumeRate: 1,
      effective: 0,
      maxAllowed: 100,
      paused: false,
      forced1x: false,
      lagging: false,
      effectiveRate: '—',
      lockReason: null,
      lockCode: null,
      lockLabel: '',
      readout: 'SIM —',
      skip: { enabled: false, target: null, reason: null, active: false },
    },
    economy: { money: missing('M CR'), reputation: missing('REP') },
    range: {
      aggregate: 'NONE',
      state: 'neutral',
      glyph: 'idle',
      label: 'RANGE —',
      reason: null,
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
        marginSeries: [],
      },
    },
    alerts: { open: 0, fresh: 0, state: 'neutral', label: '0 ALERTS', items: [] },
    flightCard: null,
    countdown: null,
    inspector: null,
    lists: {
      vehicles: [],
      tanks: [],
      tasks: [],
      range: [],
      rangeAssets: [],
      events: [],
      badges: { vehicles: badge(), tanks: badge(), tasks: badge(), range: badge(), events: badge() },
    },
    decision: null,
    debrief: null,
    labels: [],
    sites: [],
    view: { siteId: 'LC-1', selectedId: null, followId: null, selected: null, follow: null, tab: 'vehicles' },
  };
}
