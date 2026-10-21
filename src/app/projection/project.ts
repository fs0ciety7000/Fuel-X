// projectUi (ARCHITECTURE §8, ADR 0004): world (SI) + view state → display-ready UiProjection. Pure given its
// inputs: no wall clock, no mutation of the world; `prev` is only used for structural sharing and alert ages.
import type {
  ActionVM,
  ClockVM,
  CountdownVM,
  EconomyVM,
  FlightCardVM,
  PhaseVM,
  PollMarkVM,
  SiteVM,
  SkipVM,
  StationVM,
  TimeLockCode,
  TimeScaleVM,
  UiProjection,
} from '@bridge/projection-types';
import type { RateStateVM } from '@bridge/commands';
import type { ViewState } from '@bridge/stores';
import { DT_S, isPreLiftoff, propellantReserve, secondsToTicks } from '@sim/index';
import {
  contracts,
  countdown as cdData,
  flightProfile as fp,
  logistics as ld,
  mvpFlight,
  sites as siteDefs,
  propellant as pd,
  time as timeData,
} from '@data/index';
import type { Countdown, Phase, PollId, World } from '@sim/types';
import type { Ctx, ProjectEnv, TimeInputs } from './context';
import { entity, makeCtx, tClockAt } from './context';
import { credits, duration, fixed, hours, missing, num, pct, tClock, tClockS, utc, words } from './format';
import { GO_LABEL, HOLD_LABEL, PHASE_LABEL, POLL_LABEL, goStatus } from './labels';
import { countdownActions, decisionVM, orderActions } from './project-decision';
import { debriefVM } from './project-debrief';
import { inspectorVM, labelsVM, listsVM } from './project-entities';
import { aggregate, alertsVM, rangeVM, stationVMs } from './project-range';
import { share } from './share';
import { DROP_LABEL, SKIP_BLOCK_LABEL, nextSkipTarget, runEnded, skipBlocker } from '../time/rules';

export type { ProjectEnv } from './context';

// --- Clock ---------------------------------------------------------------------------------------------------

function clockVM(c: Ctx): ClockVM {
  const cd = c.cd;
  const base: ClockVM = {
    utc: utc(c.utcS),
    utcS: Math.floor(c.utcS),
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
  };
  if (!cd) return base;
  const holding = cd.clock.state === 'Holding';
  const before = c.tick < cd.windowOpenTick;
  const open = !before && c.tick < cd.windowCloseTick;
  return {
    ...base,
    tClock: tClock(cd.tClockTicks),
    tClockS: Math.trunc(cd.tClockTicks * DT_S),
    missionClock: cd.liftoffTick !== null && cd.tClockTicks >= 0 ? tClock(cd.tClockTicks) : null,
    phase: cd.phase.state,
    phaseLabel: PHASE_LABEL[cd.phase.state],
    holding,
    holdReason: holding ? (cd.hold?.reason ?? null) : null,
    holdLabel: holding && cd.hold ? HOLD_LABEL[cd.hold.reason] : '',
    windowOpenAt: utc(c.utc0 + cd.windowOpenTick * DT_S),
    windowCloseAt: utc(c.utc0 + cd.windowCloseTick * DT_S),
    windowState: before ? 'BEFORE' : open ? 'OPEN' : 'CLOSED',
    windowRemaining: before
      ? duration((cd.windowOpenTick - c.tick) * DT_S)
      : open
        ? duration((cd.windowCloseTick - c.tick) * DT_S)
        : duration(0),
  };
}

// --- Time scale ----------------------------------------------------------------------------------------------

const FORCE_1X_FROM_TICKS = secondsToTicks(timeData.force1xFromTS);
const FORCE_1X_AFTER_TICKS = secondsToTicks(timeData.force1xAfterRecoveryS);
const FLIGHT_PHASES: readonly Phase[] = ['Liftoff', 'Boostback', 'TowerCatch', 'Divert'];
const LOCK_WORDS: Record<TimeLockCode, string> = {
  TERMINAL_COUNT: 'TERMINAL COUNT',
  FLIGHT: 'FLIGHT',
  RECOVERY_SETTLE: 'RECOVERY',
  HOLD: 'HOLD',
  PHASE_CAP: '',
};

/** Mirrors the sim's `maxTimeScale` rules to name the cap (the cap value itself comes from TimeControl). */
export function lockReason(
  world: Readonly<World>,
  cd: Readonly<Countdown> | null,
  maxAllowed: number,
): TimeLockCode | null {
  if (!cd || maxAllowed >= 100) return null;
  const phase = cd.phase.state;
  if (phase === 'Safing' && world.tick - cd.phase.enteredTick < FORCE_1X_AFTER_TICKS) return 'RECOVERY_SETTLE';
  if (isPreLiftoff(phase) && cd.tClockTicks >= FORCE_1X_FROM_TICKS) return 'TERMINAL_COUNT';
  if (FLIGHT_PHASES.includes(phase)) return 'FLIGHT';
  if (cd.clock.state === 'Holding' && timeData.holdMaxTimeScale < timeData.maxTimeScaleByPhase[phase]) return 'HOLD';
  return 'PHASE_CAP';
}

function skipVM(c: Ctx): SkipVM {
  const t = c.env.time;
  const active = t.skipping ?? null;
  const target = active ?? nextSkipTarget(c.cd);
  const code = active ? null : t.skipBlocker !== undefined ? t.skipBlocker : skipBlocker(c.world, c.cd);
  const label =
    target === null ? null : target.kind === 'DEBRIEF' ? target.name : `${tClock(target.tClockTicks)} ${target.name}`;
  return {
    enabled: active === null && code === null,
    target: label,
    reason: code ? SKIP_BLOCK_LABEL[code] : null,
    active: active !== null,
    reasonCode: code,
    targetTClockS: target?.kind === 'TCLOCK' ? target.tClockTicks * DT_S : null,
    targetName: target?.name ?? null,
  };
}

/** Rate fields of the time state as printed (shared with the session port's synchronous `rateState`, 8.2). */
export function rateFields(t: Pick<TimeInputs, 'paused' | 'requested'>, ended: boolean): RateStateVM {
  const paused = t.paused || ended;
  return { requested: paused ? 0 : t.requested, resumeRate: t.requested, paused };
}

function timeScaleVM(c: Ctx): TimeScaleVM {
  const t = c.env.time;
  const ended = runEnded(c.cd);
  const reason = ended ? null : lockReason(c.world, c.cd, t.maxAllowed);
  const phaseWord = c.cd ? PHASE_LABEL[c.cd.phase.state] : '';
  const word = ended ? 'RUN ENDED' : reason ? LOCK_WORDS[reason] || phaseWord : '';
  const lockLabel = ended
    ? 'RUN ENDED'
    : !reason
      ? ''
      : t.maxAllowed === 1
        ? `1× LOCKED · ${word}`
        : `MAX ${t.maxAllowed}× · ${word}`;
  const fields = rateFields(t, ended);
  const paused = fields.paused;
  const skip = skipVM(c);
  const rate = t.lagging || skip.active ? t.effectiveRate : t.effective;
  const rateText = fixed(rate, t.lagging ? 1 : 0);
  const drop = t.drop ? { code: t.drop.code, label: `1× · ${DROP_LABEL[t.drop.code]}`, tick: t.drop.tick } : null;
  return {
    requested: fields.requested,
    resumeRate: fields.resumeRate,
    effective: ended ? 0 : t.effective,
    maxAllowed: ended ? 0 : t.maxAllowed,
    paused,
    forced1x: !ended && t.maxAllowed === 1,
    lagging: t.lagging,
    effectiveRate: `${rateText}×`,
    lockReason: ended || reason ? word : null,
    lockCode: reason,
    lockLabel,
    readout: ended
      ? 'SIM PAUSED · RUN ENDED'
      : skip.active
        ? `SIM SKIP → ${skip.target ?? ''}`.trim()
        : t.paused
          ? (t.queued ?? 0) > 0
            ? `SIM PAUSED · ${t.queued} QUEUED`
            : 'SIM PAUSED'
          : t.lagging
            ? `SIM ${rateText}× OF ${t.effective}×`
            : `SIM ${t.effective}×`,
    skip,
    drop,
    runEnded: ended,
  };
}

// --- Economy, sites ------------------------------------------------------------------------------------------

function economyVM(c: Ctx): EconomyVM {
  return { money: credits(c.world.economy.moneyCr), reputation: num(c.world.economy.reputation, 0, 'REP') };
}

function sitesVM(c: Ctx, alertCount: number): SiteVM[] {
  return siteDefs.map((d) => {
    const status = c.world.sites[d.id]?.status ?? d.status;
    const playable = d.playableInMvp;
    return {
      id: d.id,
      code: d.id,
      name: d.name,
      kind: d.role,
      status: words(status),
      state: playable ? 'ok' : 'disabled',
      glyph: status === 'UNDER_CONSTRUCTION' ? 'build' : playable ? 'ok' : 'offline',
      interactive: playable,
      current: c.view.siteId === d.id,
      alertCount: d.id === mvpFlight.siteId ? alertCount : 0,
    };
  });
}

// --- Flight card ---------------------------------------------------------------------------------------------

function flightVM(c: Ctx, stations: readonly StationVM[]): FlightCardVM | null {
  const cd = c.cd;
  if (!cd) return null;
  const b = entity(c, cd.boosterId);
  const s = entity(c, cd.shipId);
  const k = contracts[cd.contractId];
  const contract = c.world.contracts[cd.contractId];
  const lox = propellantReserve(c.world as World, cd as Countdown, 'LOX');
  const ch4 = propellantReserve(c.world as World, cd as Countdown, 'CH4');
  const binding = lox.holdS <= ch4.holdS ? 'LOX' : 'CH4';
  const reserveS = Math.min(lox.holdS, ch4.holdS);
  const propLoaded = c.env.spark.values('propLoaded');
  const loadedNow = (() => {
    let m = 0;
    let cap = 0;
    for (const e of [b, s]) {
      if (e?.kind !== 'booster' && e?.kind !== 'ship') continue;
      m += e.prop.loxKg + e.prop.ch4Kg;
      cap += e.prop.loxCapKg + e.prop.ch4CapKg;
    }
    return cap > 0 ? m / cap : null;
  })();
  const goCount = stations.filter((x) => x.status === 'GO').length;
  const agg = aggregate(stations);
  const aggSt = agg ? goStatus(agg) : null;
  const flown = cd.liftoffTick !== null;
  const status = contract?.status ?? 'ACTIVE';
  const scrubbed = cd.phase.state === 'Scrubbed' || cd.scrubReason !== null;
  const limit = pd.stationMarginalBelowToppingS;
  return {
    countdownId: cd.id,
    boosterId: cd.boosterId,
    shipId: cd.shipId,
    title: cd.flightName,
    nextLaunch: {
      key: 'nextLaunch',
      label: scrubbed ? 'SCRUBBED' : flown ? 'FLOWN' : 'NEXT LAUNCH',
      value: { text: tClock(cd.tClockTicks), unit: '', value: cd.tClockTicks * DT_S },
      state: scrubbed ? 'danger' : cd.clock.state === 'Holding' ? 'warn' : 'neutral',
    },
    vehicles: `${b?.callSign ?? '—'} / ${s?.callSign ?? '—'}`,
    propellant: {
      key: 'propellant',
      label: 'PROPELLANT LOADED',
      value: pct(loadedNow),
      state: 'neutral',
      series: propLoaded as (number | null)[],
      seriesLabel: 'VEHICLE LOADED, LAST 2 MIN',
    },
    farmReserve: c.preLiftoff ? Math.max(0, Math.min(1, reserveS / limit)) : null,
    farmReserveTime: c.preLiftoff ? hours(reserveS) : missing('H'),
    farmReserveFluid: c.preLiftoff ? binding : null,
    stations: {
      key: 'stations',
      label: 'STATIONS GO',
      value: { text: `${goCount} OF 5`, unit: '', value: goCount },
      state: aggSt?.severity ?? 'neutral',
      segments: { value: goCount, max: 5, label: `STATIONS GO ${goCount} OF 5`, states: stations.map((x) => x.state) },
    },
    range: {
      key: 'range',
      label: 'RANGE',
      value: { text: agg ? GO_LABEL[agg] : '—', unit: '', value: null },
      state: aggSt?.severity ?? 'neutral',
      series: c.env.spark.values('weatherMargin') as (number | null)[],
      threshold: 0,
      seriesLabel: 'WEATHER MARGIN',
    },
    contract: {
      id: cd.contractId,
      customer: k?.customer ?? '',
      status: words(status),
      state: status === 'FULFILLED' ? 'ok' : status === 'WINDOW_MISSED' ? 'danger' : 'active',
    },
  };
}

// --- Countdown timeline --------------------------------------------------------------------------------------

const kf = (event: string, fallback: number): number => fp.booster.find((k) => k.event === event)?.tS ?? fallback;
const ROLLOUT_END_S = cdData.scenarioStartTS + ld.craneLoadTaskS + ld.routeYardToPadM / ld.transporter.speedLoadedMPerS;
const CATCH_S = kf('CATCH', 415);
/** Planned segments (T-offsets, s): width ∝ planned duration (DESIGN_SYSTEM §6.17). */
const PLAN: readonly { id: Phase; startS: number; endS: number }[] = [
  { id: 'Rollout', startS: cdData.scenarioStartTS, endS: ROLLOUT_END_S },
  { id: 'Stack', startS: ROLLOUT_END_S, endS: cdData.pollTS.load },
  { id: 'PropellantLoad', startS: cdData.pollTS.load, endS: cdData.pollTS.terminal },
  { id: 'TerminalCount', startS: cdData.pollTS.terminal, endS: 0 },
  { id: 'Liftoff', startS: 0, endS: kf('HOT_STAGING', 160) },
  { id: 'Boostback', startS: kf('HOT_STAGING', 160), endS: kf('LANDING_BURN', 380) },
  { id: 'TowerCatch', startS: kf('LANDING_BURN', 380), endS: CATCH_S },
  { id: 'Safing', startS: CATCH_S, endS: CATCH_S + cdData.safingDurationS },
];
const ORDER: readonly Phase[] = ['Standby', ...PLAN.map((p) => p.id)];
const PLAN_START_S = PLAN[0]?.startS ?? 0;
const PLAN_TOTAL_S = (PLAN[PLAN.length - 1]?.endS ?? 1) - PLAN_START_S;
const SHORT: Partial<Record<Phase, string>> = {
  PropellantLoad: 'PROP LOAD',
  TerminalCount: 'TERMINAL',
  TowerCatch: 'CATCH',
};
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
/** T-offset (s) → position on the timeline bar (planned durations), 0–1. */
export function barPosition(tS: number): number {
  return clamp01((tS - PLAN_START_S) / PLAN_TOTAL_S);
}

function timelineVM(c: Ctx): CountdownVM | null {
  const cd = c.cd;
  if (!cd) return null;
  const phase = cd.phase.state;
  const b = entity(c, cd.boosterId);
  const divert = phase === 'Divert' || (b?.kind === 'booster' && b.recovery?.mode === 'DIVERT');
  const scrubbed = phase === 'Scrubbed' || cd.scrubReason !== null;
  const holding = cd.clock.state === 'Holding';
  const tS = cd.tClockTicks * DT_S;
  const curIdx = ORDER.indexOf(phase === 'Divert' ? 'TowerCatch' : phase);
  const phases: PhaseVM[] = PLAN.map((p, i) => {
    const id: Phase = p.id === 'TowerCatch' && divert ? 'Divert' : p.id;
    let state: PhaseVM['state'];
    if (scrubbed) state = p.endS <= tS ? 'done' : 'skipped';
    else if (phase === 'Debrief') state = 'done';
    else if (i + 1 < curIdx) state = 'done';
    else if (i + 1 === curIdx) state = holding ? 'held' : 'current';
    else state = 'pending';
    const glyph =
      state === 'done'
        ? 'done'
        : state === 'skipped'
          ? 'offline'
          : state === 'pending'
            ? 'pending'
            : state === 'held'
              ? 'holding'
              : 'current';
    const prog =
      state === 'done'
        ? 1
        : state === 'current' || state === 'held'
          ? clamp01((tS - p.startS) / (p.endS - p.startS))
          : 0;
    return {
      id,
      label: PHASE_LABEL[id],
      short: SHORT[id] ?? PHASE_LABEL[id],
      state,
      glyph,
      share: (p.endS - p.startS) / PLAN_TOTAL_S,
      progress: prog,
      startS: p.startS,
      endS: p.endS,
    };
  });
  const polls: PollMarkVM[] = (Object.entries(cdData.pollTS) as [PollId, number][]).map(([id, atS]) => ({
    id,
    at: tClockS(atS),
    position: barPosition(atS),
    label: POLL_LABEL[id],
    state: cd.pollsPassed.includes(id) ? 'passed' : holding && cd.hold?.poll === id ? 'open' : 'pending',
  }));
  const s = entity(c, cd.shipId);
  const open = tClockAt(c, cd.windowOpenTick) * DT_S;
  const close = tClockAt(c, cd.windowCloseTick) * DT_S;
  return {
    countdownId: cd.id,
    title: `${cd.siteId} · ${b?.callSign ?? '—'} / ${s?.callSign ?? '—'}`,
    tClock: tClock(cd.tClockTicks),
    tClockS: Math.trunc(tS),
    state: scrubbed ? 'danger' : holding ? 'warn' : 'neutral',
    phases,
    playhead: barPosition(tS),
    polls,
    windowOpen: c.preLiftoff ? barPosition(open) : null,
    windowClose: c.preLiftoff ? barPosition(close) : null,
    holding,
    scrubbed,
    actions: countdownActions(c),
  };
}

// --- Root ----------------------------------------------------------------------------------------------------

/**
 * Projects the world for the HUD. `prev` (the last published projection) enables structural sharing: every
 * sub-object deep-equal to its previous version is returned as the previous object.
 */
export function projectUi(
  world: Readonly<World>,
  prev: UiProjection | null,
  view: Readonly<ViewState>,
  env: ProjectEnv,
): UiProjection {
  const c = makeCtx(world, prev, view, env);
  const stations = stationVMs(c);
  const alerts = alertsVM(c, stations);
  const timeline = timelineVM(c);
  const orders = orderActions(c);
  const decision = decisionVM(c, stations, timeline?.actions ?? [], orders);
  const decisionActions =
    decision?.kind === 'CATCH'
      ? decision.options.map((o) => {
          const a: ActionVM = {
            id: o.id,
            label: o.label,
            enabled: o.enabled,
            variant: o.variant,
            command: o.command ?? null,
          };
          if (o.key) a.key = o.key;
          if (o.reason) a.reason = o.reason;
          if (o.reasonCode) a.reasonCode = o.reasonCode;
          if (o.confirm) a.confirm = o.consequences;
          return a;
        })
      : [];
  const alertIds = new Set(alerts.items.map((a) => a.entityId).filter((x): x is string => x !== null));
  const sel = view.selectedId ? (world.entities.byId[view.selectedId]?.callSign ?? null) : null;
  const fol = view.followId ? (world.entities.byId[view.followId]?.callSign ?? null) : null;
  const next: UiProjection = {
    version: 1,
    seq: env.seq,
    tick: world.tick,
    simTimeS: world.tick * DT_S,
    clock: clockVM(c),
    timeScale: timeScaleVM(c),
    economy: economyVM(c),
    range: rangeVM(c, stations),
    alerts,
    flightCard: flightVM(c, stations),
    countdown: timeline,
    decision,
    inspector: inspectorVM(c, decisionActions),
    lists: listsVM(c, stations, orders),
    labels: labelsVM(c, alertIds),
    sites: sitesVM(c, alerts.open),
    debrief: debriefVM(c),
    view: {
      siteId: view.siteId,
      selectedId: view.selectedId,
      followId: view.followId,
      selected: sel,
      follow: fol,
      tab: view.tab,
    },
  };
  return share(prev, next);
}
