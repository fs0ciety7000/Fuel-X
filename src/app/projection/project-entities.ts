// Entity view models: inspector per kind (DESIGN_SYSTEM §6.11), list rows for the Vehicles / Tanks / Tasks / Range
// tabs (§6.13–6.16) and in-world label states (§6.20). Positions are render-owned (RenderSync), never projected.
import type {
  ActionVM,
  DisplayValue,
  InspectorVM,
  LabelVM,
  ListRowVM,
  ListsVM,
  MetricVM,
  Severity,
  StatusVM,
  TankRowVM,
  TaskRowVM,
} from '@bridge/projection-types';
import { DIVERT_PROFILE, DT_S, pathLengthM } from '@sim/index';
import { classNames, flightProfile as fp, logistics as ld, mvpFlight, propellant as pd } from '@data/index';
import type { Entity, EntityOf, Id, Kind, RouteState } from '@sim/types';
import type { Ctx } from './context';
import { entitiesOf, entity, tClockAt } from './context';
import { action } from './project-decision';
import type { StationVM } from '@bridge/projection-types';
import {
  degrees,
  dv,
  fixed,
  km,
  kmh,
  metres,
  missing,
  mps,
  num,
  ofTotal,
  pct,
  prob,
  tClock,
  tonnes,
  words,
} from './format';
import { FLUID_LABEL, PHASE_LABEL, entityStatus, kindLabel } from './labels';

type Booster = EntityOf<'booster'>;
type Ship = EntityOf<'ship'>;
type Stage = Booster | Ship;

const CATCH_T_S = fp.booster.find((k) => k.event === 'CATCH')?.tS ?? 415;
const SPLASH_T_S = DIVERT_PROFILE[DIVERT_PROFILE.length - 1]?.tS ?? fp.divert.splashdownTS;

const VEHICLE_KINDS: readonly Kind[] = ['booster', 'ship', 'transporter', 'crane', 'tanker', 'van'];
const RANGE_KINDS: readonly Kind[] = ['boat', 'wxStation'];

function routeFraction(r: RouteState | null): number {
  if (!r) return 0;
  const len = pathLengthM(r.pathId);
  return len > 0 ? Math.min(1, (r.movedTicks * r.speedMPerS * DT_S) / len) : 0;
}

/** Ground / sea speed, m/s (scripted motion: the route or leg speed while moving). */
export function speedMPerS(e: Entity): number | null {
  switch (e.kind) {
    case 'booster':
    case 'ship':
      return e.flight && !e.flight.done ? e.flight.speedMPerS : 0;
    case 'transporter':
      return (e.fsm.state === 'MOVING' || e.fsm.state === 'RETURNING') && e.route && routeFraction(e.route) < 1
        ? e.route.speedMPerS
        : 0;
    case 'tanker':
      return (e.fsm.state === 'INBOUND' || e.fsm.state === 'OUTBOUND') && e.route && routeFraction(e.route) < 1
        ? e.route.speedMPerS
        : 0;
    case 'van':
      return (e.fsm.state === 'TO_PAD' || e.fsm.state === 'TO_SAFE') && e.route && routeFraction(e.route) < 1
        ? e.route.speedMPerS
        : 0;
    case 'boat':
      if (e.leg && e.leg.movedTicks < e.leg.totalTicks) return e.leg.speedMPerS;
      return e.route && e.fsm.state === 'PATROL' ? e.route.speedMPerS : 0;
    default:
      return null;
  }
}

function propFraction(p: Stage['prop']): number {
  const cap = p.loxCapKg + p.ch4CapKg;
  return cap > 0 ? (p.loxKg + p.ch4Kg) / cap : 0;
}

const asStage = (e: Entity | null): Stage | null => (e?.kind === 'booster' || e?.kind === 'ship' ? e : null);

const flying = (e: Entity): boolean => (e.kind === 'booster' || e.kind === 'ship') && !!e.flight && !e.flight.done;

const metric = (key: string, label: string, value: DisplayValue, severity: Severity = 'neutral'): MetricVM => ({
  key,
  label,
  value,
  severity,
});
const text = (s: string): DisplayValue => ({ text: s, unit: '', si: null });

// --- Inspector ---------------------------------------------------------------------------------------------

interface InspectorBody {
  sub: string;
  metrics: MetricVM[];
  progress: InspectorVM['progress'];
  chart: InspectorVM['chart'];
  actions: ActionVM[];
}

function progress(label: string, fraction: number): InspectorVM['progress'] {
  const f = Math.max(0, Math.min(1, fraction));
  return { label, value: pct(f), fraction: f };
}

function stageBody(c: Ctx, e: Stage, decisionActions: ActionVM[]): InspectorBody {
  const cd = c.cd;
  const f = e.flight && !e.flight.done ? e.flight : null;
  const metrics: MetricVM[] = [
    metric('clock', 'MISSION CLOCK', text(cd ? tClock(cd.tClockTicks) : '—')),
    metric('altitude', 'ALTITUDE', km(f ? f.altitudeM : e.pos.y)),
    metric('velocity', 'VELOCITY', kmh(f ? f.speedMPerS : 0)),
    metric('prop', 'PROPELLANT', pct(propFraction(e.prop))),
    metric(
      'engines',
      'ENGINES LIT',
      dv(e.engines.lit, ofTotal(e.engines.lit, e.engines.total), ''),
      e.engines.failed > 0 ? 'danger' : 'neutral',
    ),
    metric('heading', 'HEADING', f ? degrees(f.headingRad) : missing('°')),
    metric('downrange', 'DOWNRANGE', km(f ? f.downrangeM : null)),
  ];
  let prog: InspectorVM['progress'] = null;
  if (e.kind === 'booster') {
    const tower = cd ? entity(c, c.world.prep[cd.id]?.towerId) : null;
    metrics.push(metric('arms', 'CATCH ARMS', text(tower?.kind === 'tower' ? tower.arms : '—')));
    const r = e.recovery;
    metrics.push(metric('landingProp', 'LANDING PROP', tonnes(r ? r.landingPropKg : null)));
    metrics.push(metric('towerWind', 'TOWER WIND', mps(r ? r.towerWindMPerS : c.world.weather.towerWindMPerS)));
    metrics.push(metric('catchP', 'CATCH P', prob(r && f ? r.p : null), r && r.p < 0.65 && f ? 'warn' : 'neutral'));
    metrics.push(metric('wear', 'WEAR', pct(e.wear)));
    if (e.flight && !e.flight.done) {
      const divert = r?.mode === 'DIVERT';
      prog = progress(
        divert ? 'FLIGHT TO SPLASHDOWN' : 'FLIGHT TO TOWER CATCH',
        e.flight.profileTimeS / (divert ? SPLASH_T_S : CATCH_T_S),
      );
    }
  } else {
    if (e.flight && !e.flight.done) prog = progress('FLIGHT TO SECO', e.flight.profileTimeS / fp.ship.secoTS);
  }
  if (!prog && (e.fsm.state === 'LOADING' || e.fsm.state === 'DETANKING')) {
    prog = progress(e.fsm.state === 'LOADING' ? 'PROPELLANT LOAD' : 'DETANK', propFraction(e.prop));
  }
  if (!prog && e.fsm.state === 'STACKING' && cd) {
    const t = entity(c, c.world.prep[cd.id]?.towerId);
    if (t?.kind === 'tower' && t.task?.stageId === e.id) prog = progress('STACKING', t.task.elapsedTicks / t.task.durationTicks);
  }
  const alt = c.env.spark.values(`alt:${e.id}`);
  const actions: ActionVM[] = [];
  if (e.kind === 'booster' && cd?.phase.state === 'Standby' && cd.boosterId === e.id) {
    actions.push(action('START_ROLLOUT', 'START ROLLOUT', { t: 'StartRollout', boosterId: e.id }));
  }
  if (e.kind === 'booster') actions.push(...decisionActions);
  const isCd = cd && (cd.boosterId === e.id || cd.shipId === e.id);
  return {
    sub: [kindLabel(e), isCd ? mvpFlight.name : '', e.kind === 'booster' ? `${e.flights} FLIGHTS` : '']
      .filter(Boolean)
      .join(' · '),
    metrics,
    progress: prog,
    chart: alt.some((v) => v !== null)
      ? { label: 'ALTITUDE · KM', spark: { values: alt as (number | null)[], unit: 'M', min: 0, max: 160_000, threshold: null } }
      : null,
    actions,
  };
}

function inspectorBody(c: Ctx, e: Entity, decisionActions: ActionVM[]): InspectorBody {
  const base: InspectorBody = { sub: kindLabel(e), metrics: [], progress: null, chart: null, actions: [] };
  const speed = speedMPerS(e);
  switch (e.kind) {
    case 'booster':
    case 'ship':
      return stageBody(c, e, decisionActions);
    case 'tower':
      base.metrics = [
        metric('arms', 'CATCH ARMS', text(e.arms)),
        metric('carriage', 'CARRIAGE', metres(e.carriageM)),
        metric('qd', 'QD ARM', text(words(e.qd))),
        metric('interlock', 'INTERLOCK', text(e.interlock === 'NONE' ? 'CLEAR' : words(e.interlock))),
        metric('towerWind', 'TOWER WIND', mps(c.world.weather.towerWindMPerS)),
      ];
      if (e.task) {
        const st = entity(c, e.task.stageId);
        base.progress = progress(`STACKING ${st?.callSign ?? ''}`.trim(), e.task.elapsedTicks / e.task.durationTicks);
      }
      return base;
    case 'pad': {
      const b = entity(c, e.boosterId);
      base.metrics = [metric('mount', 'ON MOUNT', text(b?.callSign ?? 'CLEAR'))];
      return base;
    }
    case 'tank': {
      const frac = e.capKg > 0 ? e.massKg / e.capKg : 0;
      base.sub = `${kindLabel(e)} · ${FLUID_LABEL[e.fluid]}`;
      base.metrics = [
        metric('fill', 'FILL', pct(frac)),
        metric('mass', 'MASS', tonnes(e.massKg)),
        metric('cap', 'CAPACITY', tonnes(e.capKg)),
        metric('boiledOff', 'BOILED OFF', tonnes(e.boiledOffKg, 1)),
      ];
      return base;
    }
    case 'tanker': {
      base.sub = `${kindLabel(e)} · ${e.fluid === 'LOX' ? classNames.loxTanker : classNames.ch4Tanker} · ${e.chartered ? 'CHARTERED' : 'FLEET'}`;
      base.metrics = [
        metric('speed', 'SPEED', kmh(speed)),
        metric('cargo', 'CARGO', tonnes(e.cargoKg)),
        metric('fluid', 'FLUID', text(e.fluid)),
        metric('order', 'ORDER', text(e.order?.id ?? '—')),
        metric('gate', 'GATE ETA', text(e.order ? tClock(tClockAt(c, e.order.gateEtaTick)) : '—')),
      ];
      if (e.fsm.state === 'OFFLOADING' && e.capKg > 0) base.progress = progress('OFFLOAD', 1 - e.cargoKg / e.capKg);
      else if (e.route && (e.fsm.state === 'INBOUND' || e.fsm.state === 'OUTBOUND'))
        base.progress = progress(e.fsm.state === 'INBOUND' ? 'TO GATE' : 'OUTBOUND', routeFraction(e.route));
      return base;
    }
    case 'transporter': {
      const cargo = entity(c, e.cargo);
      base.sub = `${kindLabel(e)} · ${classNames.transporter}`;
      base.metrics = [metric('speed', 'SPEED', kmh(speed)), metric('cargo', 'CARGO', text(cargo?.callSign ?? 'EMPTY'))];
      if (e.route && (e.fsm.state === 'MOVING' || e.fsm.state === 'RETURNING' || e.fsm.state === 'WIND_HOLD'))
        base.progress = progress(e.fsm.state === 'RETURNING' ? 'RETURN TO YARD' : 'ROLLOUT TO OLM-1', routeFraction(e.route));
      return base;
    }
    case 'crane': {
      base.sub = `${kindLabel(e)} · ${classNames.crane}`;
      const st = entity(c, e.task?.stageId);
      base.metrics = [metric('load', 'LOAD', text(st?.callSign ?? '—'))];
      if (e.task) base.progress = progress('LIFT', e.task.elapsedTicks / e.task.durationTicks);
      return base;
    }
    case 'van':
      base.metrics = [metric('speed', 'SPEED', kmh(speed))];
      if (e.route && (e.fsm.state === 'TO_PAD' || e.fsm.state === 'TO_SAFE'))
        base.progress = progress(e.fsm.state === 'TO_PAD' ? 'TO PAD' : 'TO SAFE AREA', routeFraction(e.route));
      return base;
    case 'boat': {
      const tgt = entity(c, e.targetId);
      base.metrics = [metric('speed', 'SPEED', kmh(speed)), metric('target', 'TARGET', text(tgt?.callSign ?? '—'))];
      if (e.leg && e.leg.totalTicks > 0 && e.leg.movedTicks < e.leg.totalTicks)
        base.progress = progress(e.fsm.state === 'INTERCEPT' ? 'INTERCEPT' : 'TRANSIT', e.leg.movedTicks / e.leg.totalTicks);
      return base;
    }
    case 'wxStation': {
      const w = c.world.weather;
      base.sub = `${kindLabel(e)} · ${classNames.weatherStation}`;
      const fromRad = (w as { windFromRad?: number }).windFromRad;
      base.metrics = [
        metric('groundWind', 'GROUND WIND', mps(w.groundWindMPerS)),
        metric('gust', 'GUST', mps(w.groundGustMPerS)),
        metric('upperWind', 'UPPER WIND', mps(w.upperWindMPerS)),
        metric('windFrom', 'WIND FROM', degrees(typeof fromRad === 'number' ? fromRad : null)),
      ];
      base.chart = {
        label: 'WEATHER MARGIN',
        spark: { values: c.env.spark.values('weatherMargin') as (number | null)[], unit: '', min: -1, max: 1, threshold: 0 },
      };
      return base;
    }
    case 'building':
      return base;
  }
}

export function inspectorVM(c: Ctx, decisionActions: ActionVM[]): InspectorVM | null {
  const id = c.view.selectedId ?? c.view.followId;
  const e = entity(c, id);
  if (!e) return null;
  const body = inspectorBody(c, e, decisionActions);
  const cls = e.kind === 'booster' ? classNames.booster : e.kind === 'ship' ? classNames.ship : '';
  return {
    id: e.id,
    callSign: e.callSign,
    kind: e.kind,
    kindLabel: kindLabel(e),
    className: cls,
    sub: body.sub,
    status: entityStatus(e),
    selected: c.view.selectedId === e.id,
    following: c.view.followId === e.id,
    metrics: body.metrics,
    progress: body.progress,
    chart: body.chart,
    actions: body.actions,
  };
}

// --- Lists ---------------------------------------------------------------------------------------------------

function rowKey(c: Ctx, e: Entity): { key: DisplayValue; keyLabel: string; sub: string } {
  const cdPhase = c.cd ? PHASE_LABEL[c.cd.phase.state] : '';
  switch (e.kind) {
    case 'booster':
    case 'ship':
      if (flying(e)) return { key: km(e.flight?.altitudeM), keyLabel: 'ALT', sub: cdPhase };
      return { key: pct(propFraction(e.prop), 0), keyLabel: 'PROP', sub: cdPhase };
    case 'tanker':
      return { key: tonnes(e.cargoKg), keyLabel: e.fluid, sub: e.order ? `ORDER ${e.order.id}` : 'FLEET' };
    case 'wxStation':
      return { key: mps(c.world.weather.groundWindMPerS), keyLabel: 'GND', sub: 'WIND' };
    default: {
      const v = speedMPerS(e);
      return { key: kmh(v), keyLabel: '', sub: e.kind === 'transporter' && e.cargo ? `CARGO ${entity(c, e.cargo)?.callSign ?? ''}` : '' };
    }
  }
}

const hiddenState = (e: Entity): boolean =>
  (e.kind === 'tanker' && e.fsm.state === 'OFFMAP') || (e.kind === 'ship' && e.fsm.state === 'OFF_SCENE');

function listRow(c: Ctx, e: Entity): ListRowVM {
  const k = rowKey(c, e);
  return {
    id: e.id,
    callSign: e.callSign,
    kind: e.kind,
    kindLabel: kindLabel(e),
    status: entityStatus(e),
    sub: k.sub,
    key: k.key,
    keyLabel: k.keyLabel,
    selected: c.view.selectedId === e.id,
    followed: c.view.followId === e.id,
  };
}

function tankRow(c: Ctx, e: EntityOf<'tank'>, stations: readonly StationVM[]): TankRowVM {
  const frac = e.capKg > 0 ? e.massKg / e.capKg : 0;
  const prp = stations.find((s) => s.id === 'PROPELLANT');
  const low =
    prp && prp.status !== 'GO' && prp.driver === (e.fluid === 'LOX' ? 'FARM_RESERVE_LOX' : e.fluid === 'CH4' ? 'FARM_RESERVE_CH4' : '');
  const rate = e.fluid === 'LN2' ? null : pd.farm.boilOffFractionPerS[e.fluid];
  const boilPctPerH = rate === null || e.capKg <= 0 ? null : -((e.massKg * rate * 3600) / e.capKg);
  return {
    id: e.id,
    callSign: e.callSign,
    fluid: e.fluid,
    fluidLabel: FLUID_LABEL[e.fluid],
    fill: pct(frac, 0),
    fraction: frac,
    mass: tonnes(e.massKg),
    boilOff: num(boilPctPerH, 4, '%/H', 100),
    severity: low ? (prp.status === 'NO_GO' ? 'danger' : 'warn') : 'neutral',
    selected: c.view.selectedId === e.id,
  };
}

const TASK_STATE: Record<'QUEUED' | 'ACTIVE' | 'PAUSED' | 'DONE', StatusVM> = {
  QUEUED: { code: 'QUEUED', label: 'QUEUED', glyph: 'pending', severity: 'info' },
  ACTIVE: { code: 'ACTIVE', label: 'ACTIVE', glyph: 'current', severity: 'active' },
  PAUSED: { code: 'PAUSED', label: 'WIND HOLD', glyph: 'holding', severity: 'warn' },
  DONE: { code: 'DONE', label: 'DONE', glyph: 'done', severity: 'ok' },
};

function task(
  id: string,
  label: string,
  state: keyof typeof TASK_STATE,
  fraction: number,
  who: Entity | null,
  eta = '',
  actions: ActionVM[] = [],
): TaskRowVM {
  const f = Math.max(0, Math.min(1, fraction));
  return {
    id,
    label,
    assignee: who?.callSign ?? '',
    assigneeId: who?.id ?? null,
    state: TASK_STATE[state],
    progress: pct(f, 0),
    fraction: f,
    eta,
    actions,
  };
}

function tasks(c: Ctx, orderActions: ActionVM[]): TaskRowVM[] {
  const cd = c.cd;
  const out: TaskRowVM[] = [];
  if (!cd) return out;
  const prep = c.world.prep[cd.id];
  const crane = entity(c, prep?.craneId);
  const sp = entity(c, prep?.transporterId);
  const tower = entity(c, prep?.towerId);
  for (const stageId of [cd.boosterId, cd.shipId]) {
    const st = entity(c, stageId);
    if (st?.kind !== 'booster' && st?.kind !== 'ship') continue;
    const s = st.fsm.state;
    // Rollout: crane lift (first half) then the transporter drive (second half).
    if (s === 'IN_YARD') {
      const lifting = crane?.kind === 'crane' && crane.task?.stageId === st.id ? crane.task : null;
      const actions =
        st.kind === 'booster' && cd.phase.state === 'Standby'
          ? [action('START_ROLLOUT', 'START ROLLOUT', { t: 'StartRollout', boosterId: st.id })]
          : [];
      out.push(
        task(`rollout:${st.id}`, `ROLLOUT ${st.callSign}`, lifting ? 'ACTIVE' : 'QUEUED', lifting ? (0.5 * lifting.elapsedTicks) / lifting.durationTicks : 0, lifting ? crane : null, '', actions),
      );
    } else if (s === 'ON_TRANSPORTER') {
      const paused = sp?.kind === 'transporter' && sp.fsm.state === 'WIND_HOLD';
      const f = sp?.kind === 'transporter' ? routeFraction(sp.route) : 0;
      out.push(task(`rollout:${st.id}`, `ROLLOUT ${st.callSign}`, paused ? 'PAUSED' : 'ACTIVE', 0.5 + 0.5 * f, sp));
    } else {
      out.push(task(`rollout:${st.id}`, `ROLLOUT ${st.callSign}`, 'DONE', 1, null));
    }
    // Stack on OLM-1 by TOWER-1.
    const stacking = tower?.kind === 'tower' && tower.task?.stageId === st.id ? tower.task : null;
    const done = !['IN_YARD', 'ON_TRANSPORTER', 'STACKING'].includes(s);
    const stackActions =
      st.kind === 'booster' && cd.inputs.rolloutComplete && !prep?.stackRequested
        ? [action('STACK', 'STACK', { t: 'Stack', padId: cd.padId })]
        : [];
    out.push(
      task(
        `stack:${st.id}`,
        `STACK ${st.callSign}`,
        done ? 'DONE' : stacking ? (tower?.kind === 'tower' && tower.fsm.state === 'WIND_HOLD' ? 'PAUSED' : 'ACTIVE') : 'QUEUED',
        done ? 1 : stacking ? stacking.elapsedTicks / stacking.durationTicks : 0,
        tower,
        '',
        stackActions,
      ),
    );
  }
  // Propellant load (both stages).
  const b = asStage(entity(c, cd.boosterId));
  const sh = asStage(entity(c, cd.shipId));
  if (b && sh) {
    const cap = b.prop.loxCapKg + b.prop.ch4CapKg + sh.prop.loxCapKg + sh.prop.ch4CapKg;
    const m = b.prop.loxKg + b.prop.ch4Kg + sh.prop.loxKg + sh.prop.ch4Kg;
    const loading = b.fsm.state === 'LOADING' || sh.fsm.state === 'LOADING';
    const paused = loading && c.world.logistics.loadRateFactor === 0;
    out.push(
      task(
        'load',
        'PROPELLANT LOAD',
        cd.inputs.loadComplete ? 'DONE' : paused ? 'PAUSED' : loading ? 'ACTIVE' : 'QUEUED',
        cap > 0 ? m / cap : 0,
        null,
      ),
    );
  }
  // D1 command row + deliveries in flight.
  out.push({ ...task('order', 'ORDER DELIVERY', 'QUEUED', 0, null, '', orderActions), state: TASK_STATE.QUEUED });
  for (const t of entitiesOf(c, 'tanker')) {
    if (!t.order) continue;
    const st = t.fsm.state;
    const frac = st === 'OFFLOADING' && t.capKg > 0 ? 1 - t.cargoKg / t.capKg : st === 'OUTBOUND' ? 1 : 0;
    const state = st === 'OUTBOUND' ? 'DONE' : st === 'GATE_WAIT' ? 'PAUSED' : st === 'OFFMAP' ? 'QUEUED' : 'ACTIVE';
    const row = task(
      `delivery:${t.order.id}`,
      `DELIVERY ${t.order.id} · ${t.fluid}${t.order.rush ? ' RUSH' : ''}`,
      state,
      frac,
      t,
      st === 'OFFMAP' || st === 'INBOUND' || st === 'GATE_WAIT' ? tClock(tClockAt(c, t.order.gateEtaTick)) : '',
    );
    out.push(st === 'GATE_WAIT' ? { ...row, state: { ...TASK_STATE.PAUSED, label: 'GATE WAIT' } } : row);
  }
  return out;
}

/** D1 order buttons (Tasks tab); disabled once the road closes. */
export function orderActions(c: Ctx): ActionVM[] {
  const closed = c.world.logistics.roadClosed || !c.preLiftoff;
  const mk = (fluid: 'LOX' | 'CH4', rush: boolean): ActionVM => {
    const d = rush ? ld.delivery.rush : ld.delivery.standard;
    return action(
      `ORDER_${fluid}_${rush ? 'RUSH' : 'STANDARD'}`,
      `${fluid} ${rush ? 'RUSH' : 'STD'}`,
      { t: 'OrderDelivery', fluid, rush },
      {
        enabled: !closed,
        reason: c.preLiftoff ? 'ROAD_CLOSED' : 'NO_COUNT',
        consequences: [`FEE ${fixed(d.feeCrPerTruck / 1e6, 2)} M CR`, `LEAD ${fixed(d.leadTimeS / 3600, 1)} H`],
      },
    );
  };
  return [mk('LOX', false), mk('LOX', true), mk('CH4', false), mk('CH4', true)];
}

const badge = (sevs: readonly Severity[]): { warn: number; danger: number } => ({
  warn: sevs.filter((s) => s === 'warn').length,
  danger: sevs.filter((s) => s === 'danger').length,
});

export function listsVM(c: Ctx, stations: readonly StationVM[], orders: ActionVM[]): ListsVM {
  const vehicles: ListRowVM[] = [];
  const range: ListRowVM[] = [];
  const tanks: TankRowVM[] = [];
  for (const id of c.world.entities.order) {
    const e = c.world.entities.byId[id];
    if (!e) continue;
    if (e.kind === 'tank') tanks.push(tankRow(c, e, stations));
    else if (VEHICLE_KINDS.includes(e.kind) && !hiddenState(e)) vehicles.push(listRow(c, e));
    else if (RANGE_KINDS.includes(e.kind)) range.push(listRow(c, e));
  }
  const taskRows = tasks(c, orders);
  const events = c.env.events as ListsVM['events'];
  return {
    vehicles,
    tanks,
    tasks: taskRows,
    range,
    events,
    badges: {
      vehicles: badge(vehicles.map((r) => r.status.severity)),
      tanks: badge(tanks.map((r) => r.severity)),
      tasks: badge(taskRows.map((r) => r.state.severity)),
      range: badge(range.map((r) => r.status.severity)),
      events: badge(events.slice(0, 20).map((r) => r.severity)),
    },
  };
}

// --- Labels --------------------------------------------------------------------------------------------------

export function labelsVM(c: Ctx, alertEntityIds: ReadonlySet<Id>): LabelVM[] {
  const out: LabelVM[] = [];
  for (const id of c.world.entities.order) {
    const e = c.world.entities.byId[id];
    if (!e || hiddenState(e) || (e.kind === 'booster' && e.fsm.state === 'LOST')) continue;
    if (c.env.hidden?.(id)) continue;
    const st = entityStatus(e);
    const selected = c.view.selectedId === id;
    const followed = c.view.followId === id;
    const alert = alertEntityIds.has(id) || st.severity === 'danger' || st.severity === 'warn';
    const severity: Severity = alertEntityIds.has(id) && st.severity !== 'danger' ? 'warn' : st.severity;
    out.push({
      id,
      callSign: e.callSign,
      kind: e.kind,
      glyph: alert && severity === 'danger' ? 'danger' : alert ? 'warn' : st.glyph,
      severity,
      selected,
      followed,
      priority: selected ? 5 : alert ? 4 : followed ? 3 : flying(e) ? 2 : e.kind === 'tank' || e.kind === 'van' ? 0 : 1,
    });
  }
  return out;
}
