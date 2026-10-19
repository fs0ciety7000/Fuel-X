// Range / stations / weather / alerts view models (GDD §4.5, AC 10; DESIGN_SYSTEM §6.4, §6.5, §6.24).
import type { AlertsVM, EventVM, GlyphId, RangeVM, StationVM, ValueVM, WeatherVM } from '@bridge/projection-types';
import { STATIONS, peakUpperForecast } from '@sim/index';
import { maritimeHazardAreaName, weather as wxData } from '@data/index';
import type { GoStatus, Station, StationReading, World } from '@sim/types';
import type { Ctx } from './context';
import { entitiesOf, entity } from './context';
import { MISSING, degrees, dv, hms, hours, hoursMinutes, km, missing, mps, num, ofTotal, utc } from './format';
import { DRIVER_LABEL, GO_LABEL, STATION_CODE, STATION_LABEL, goStatus } from './labels';
import { DT_S } from '@sim/index';

const RANK: Record<GoStatus, number> = { GO: 0, MARGINAL: 1, NO_GO: 2 };

/** Current station readings of the countdown (live range system), or null. */
export function readings(c: Ctx): Record<Station, StationReading> | null {
  return c.cd ? (c.world.range[c.cd.id]?.stations ?? null) : null;
}

function source(c: Ctx, s: Station, r: StationReading): { id: string; callSign: string } | null {
  const pick = (id: string | null | undefined): { id: string; callSign: string } | null => {
    const e = entity(c, id);
    return e ? { id: e.id, callSign: e.callSign } : null;
  };
  switch (s) {
    case 'WEATHER':
      for (const e of entitiesOf(c, 'wxStation')) return pick(e.id);
      return null;
    case 'RANGE':
      for (const b of entitiesOf(c, 'boat')) {
        if (r.driver === 'INTRUDER' && b.role === 'intruder') return pick(b.id);
        if (r.driver === 'PICKET_REPOSITIONING' && b.role === 'picket' && b.fsm.state !== 'PATROL') return pick(b.id);
      }
      return null;
    case 'PROPELLANT': {
      const fluid = r.driver === 'FARM_RESERVE_CH4' ? 'CH4' : 'LOX';
      return pick(c.world.logistics.farm[fluid][0]);
    }
    case 'VEHICLE':
      return pick(c.cd?.boosterId);
    case 'PAD_CREW':
      if (r.driver === 'CREW_IN_HAZARD') {
        for (const v of entitiesOf(c, 'van')) if (v.fsm.state === 'AT_PAD' || v.fsm.state === 'TO_SAFE') return pick(v.id);
      }
      return null;
  }
}

function values(s: Station, r: StationReading): { value: ValueVM; limit: ValueVM } {
  switch (s) {
    case 'WEATHER':
      return { value: mps(r.value), limit: mps(r.limit) };
    case 'RANGE':
      return r.driver === 'INTRUDER'
        ? { value: dv(r.value, hms(r.value), ''), limit: missing() }
        : { value: missing(), limit: missing() };
    case 'PROPELLANT':
      return { value: hours(r.value), limit: hours(r.limit) };
    case 'VEHICLE':
      return { value: num(r.value, 2, ''), limit: num(r.limit, 2, '') };
    case 'PAD_CREW':
      return r.driver === 'CREW_IN_HAZARD'
        ? { value: km(r.value, 2), limit: km(r.limit, 2) }
        : { value: hoursMinutes(r.value), limit: hoursMinutes(r.limit) };
  }
}

function detail(s: Station, r: StationReading, v: ValueVM, src: string | null): string {
  const val = `${v.text} ${v.unit}`.trim();
  switch (r.driver) {
    case 'NOMINAL':
      switch (s) {
        case 'WEATHER':
          return `UPPER ${val}`;
        case 'RANGE':
          return 'PICKETS ON STATION';
        case 'PROPELLANT':
          return `RESERVE ${val}`;
        case 'VEHICLE':
          return `HEALTH ${val}`;
        case 'PAD_CREW':
          return `SHIFT ${val}`;
      }
      return '';
    case 'GROUND_WIND':
      return `GND ${val}`;
    case 'UPPER_WIND':
      return `UPPER ${val}`;
    case 'FORECAST_UPPER_WIND':
      return `FCST UPPER ${val}`;
    case 'INTRUDER':
      return `${src ?? 'UNKNOWN'} IN ${maritimeHazardAreaName}${r.value > 0 ? ` · INTERCEPT ${val}` : ' · ESCORTED'}`;
    case 'PICKET_REPOSITIONING':
      return `${src ?? 'PICKET'} REPOSITIONING`;
    case 'FARM_RESERVE_LOX':
      return `LOX ${val} RESERVE`;
    case 'FARM_RESERVE_CH4':
      return `CH4 ${val} RESERVE`;
    case 'GSE_LEAK':
      return `GSE LEAK · HEALTH ${val}`;
    case 'VEHICLE_HEALTH':
      return `HEALTH ${val}`;
    case 'CREW_IN_HAZARD':
      return `${src ?? 'CREW'} IN HAZARD · ${val}`;
    case 'CREW_SHIFT':
      return `SHIFT ${val}`;
  }
}

export function stationVMs(c: Ctx): StationVM[] {
  const rs = readings(c);
  if (!rs) return [];
  return STATIONS.map((s) => {
    const r = rs[s];
    const src = source(c, s, r);
    const { value, limit } = values(s, r);
    const st = goStatus(r.status);
    const vm: StationVM = {
      id: s,
      code: STATION_CODE[s],
      label: STATION_LABEL[s],
      status: r.status,
      state: st.severity,
      glyph: st.glyph,
      driver: DRIVER_LABEL[r.driver],
      driverCode: r.driver,
      value,
      limit,
      detail: detail(s, r, value, src?.callSign ?? null),
      sourceId: src?.id ?? null,
      sourceCode: src?.callSign ?? null,
    };
    return vm;
  });
}

export function aggregate(stations: readonly StationVM[]): GoStatus | null {
  if (stations.length === 0) return null;
  return stations.reduce<GoStatus>((a, s) => (s.status !== 'PENDING' && RANK[s.status] > RANK[a] ? s.status : a), 'GO');
}

export function weatherVM(c: Ctx): WeatherVM {
  const w = c.world.weather;
  const L = wxData.launchLimit;
  const fromRad = (w as { windFromRad?: number }).windFromRad;
  return {
    groundWind: mps(w.groundWindMPerS),
    groundGust: mps(w.groundGustMPerS),
    towerWind: mps(w.towerWindMPerS),
    upperWind: mps(w.upperWindMPerS),
    windFrom: degrees(typeof fromRad === 'number' ? fromRad : null),
    upperForecastPeak:
      c.cd && c.preLiftoff ? mps(peakUpperForecast(c.world as World, c.cd.windowCloseTick)) : missing('M/S'),
    groundLimit: mps(L.groundWindMPerS),
    upperLimit: mps(L.upperWindMPerS),
    marginSeries: c.env.spark.values('weatherMargin') as (number | null)[],
  };
}

export function rangeVM(c: Ctx, stations: StationVM[]): RangeVM {
  const status = aggregate(stations);
  const worst = stations.find((s) => s.status === status && status !== 'GO');
  const st = status ? goStatus(status) : null;
  return {
    aggregate: status ?? 'NONE',
    state: st?.severity ?? 'neutral',
    glyph: st?.glyph ?? 'idle',
    label: status ? `RANGE ${GO_LABEL[status]}` : `RANGE ${MISSING}`,
    reason: worst ? `${worst.label} · ${worst.detail ?? ''}` : null,
    goCount: stations.filter((s) => s.status === 'GO').length,
    total: STATIONS.length,
    stations,
    weather: weatherVM(c),
  };
}

// --- Alerts (condition-based: an alert lives while its condition holds; ack is a view intent) ---------------

interface AlertSpec {
  id: string;
  severity: 'warn' | 'danger';
  text: string;
  entityId: string | null;
}

export function alertsVM(c: Ctx, stations: readonly StationVM[]): AlertsVM {
  const specs: AlertSpec[] = [];
  const cd = c.cd;
  if (cd && c.preLiftoff) {
    for (const s of stations) {
      if (s.status === 'GO') continue;
      specs.push({
        id: `station:${s.id}`,
        severity: s.status === 'NO_GO' ? 'danger' : 'warn',
        text: `${s.label} ${s.status === 'PENDING' ? 'PENDING' : GO_LABEL[s.status]} · ${s.detail ?? ''}`,
        entityId: s.sourceId,
      });
    }
    if (cd.clock.state === 'Holding' && cd.hold) {
      specs.push({ id: 'hold', severity: 'warn', text: `COUNT HOLDING · ${cd.hold.reason.replace(/_/g, ' ')}`, entityId: null });
    }
  }
  if (cd && c.world.anomalies[cd.id]?.leak.active) {
    specs.push({ id: 'leak', severity: 'danger', text: 'GSE LEAK · OLM-1 QUICK DISCONNECT', entityId: cd.padId });
  }
  for (const b of entitiesOf(c, 'booster')) {
    if (b.flight && !b.flight.done && b.engines.failed > 0) {
      specs.push({
        id: `engines:${b.id}`,
        severity: 'danger',
        text: `${b.callSign} ENGINE OUT · ${ofTotal(b.engines.lit, b.engines.total)}`,
        entityId: b.id,
      });
    }
    const r = b.recovery;
    if (r && r.decisionRequiredTick !== null && r.mode === null && r.result === null) {
      specs.push({ id: `catch:${b.id}`, severity: 'warn', text: `${b.callSign} CATCH DECISION OPEN`, entityId: b.id });
    }
    if (b.fsm.state === 'LOST') specs.push({ id: `lost:${b.id}`, severity: 'danger', text: `${b.callSign} LOST`, entityId: b.id });
  }
  for (const t of entitiesOf(c, 'tower')) {
    if (t.fsm.state === 'DAMAGED') specs.push({ id: `damaged:${t.id}`, severity: 'danger', text: `${t.callSign} DAMAGED`, entityId: t.id });
  }
  if (cd?.scrubReason === 'WINDOW_CLOSED') {
    specs.push({ id: 'window', severity: 'danger', text: `WINDOW MISSED · ${cd.contractId}`, entityId: null });
  }

  const prevItems = c.prev?.alerts.items ?? [];
  const acked = c.view.ackedAlerts;
  const items: EventVM[] = specs.map((s) => {
    const since = prevItems.find((x) => x.id === s.id)?.tick ?? c.tick;
    const glyph: GlyphId = s.severity === 'danger' ? 'danger' : 'warn';
    const e = entity(c, s.entityId);
    return {
      id: s.id,
      time: utc(c.utc0 + since * DT_S),
      tClock: '',
      tick: since,
      code: s.id.split(':')[0]?.toUpperCase() ?? 'ALERT',
      state: s.severity,
      glyph,
      entityId: s.entityId,
      entityCode: e?.callSign ?? null,
      message: s.text,
      acked: acked.includes(s.id),
    };
  });
  const fresh = items.filter((i) => !i.acked).length;
  const n = items.length;
  return {
    open: n,
    fresh,
    state: items.some((i) => i.state === 'danger') ? 'danger' : n ? 'warn' : 'neutral',
    label: `${n} ${n === 1 ? 'ALERT' : 'ALERTS'}${fresh > 0 && fresh < n ? ` · ${fresh} NEW` : ''}`,
    items,
  };
}
