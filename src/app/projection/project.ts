// projectUi (ARCHITECTURE §8, ADR 0004): world (SI) + view state → display-ready UiProjection. Pure given its
// inputs: no wall clock, no mutation of the world; `prev` is only used for structural sharing and alert ages.
import type {
  ClockVM,
  CountdownVM,
  EconomyVM,
  FlightCardVM,
  SiteVM,
  StationVM,
  TimeLockReason,
  TimeScaleVM,
  TimelinePhaseVM,
  TimelinePollVM,
  UiProjection,
} from '@bridge/projection-types';
import type { ViewState } from '@bridge/stores';
import { DT_S, isPreLiftoff, propellantReserve, secondsToTicks } from '@sim/index';
import {
  contracts,
  countdown as cdData,
  flightProfile as fp,
  logistics as ld,
  mvpFlight,
  sites as siteDefs,
  time as timeData,
} from '@data/index';
import type { Countdown, Phase, PollId, World } from '@sim/types';
import type { Ctx, ProjectEnv } from './context';
import { entity, makeCtx, tClockAt } from './context';
import { credits, duration, fixed, hours, missing, num, pct, tClock, tClockS, utc, words } from './format';
import { GO_LABEL, HOLD_LABEL, PHASE_LABEL, POLL_LABEL, goStatus } from './labels';
import { countdownActions, decisionVM } from './project-decision';
import { debriefVM } from './project-debrief';
import { inspectorVM, labelsVM, listsVM, orderActions } from './project-entities';
import { alertsVM, rangeVM, stationVMs } from './project-range';
import { share } from './share';

export type { ProjectEnv } from './context';

// --- Clock ---------------------------------------------------------------------------------------------------

function clockVM(c: Ctx): ClockVM {
  const cd = c.cd;
  const base: ClockVM = {
    utc: utc(c.utcS),
    utcS: Math.floor(c.utcS),
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
  };
  if (!cd) return base;
  const holding = cd.clock.state === 'Holding';
  const before = c.tick < cd.windowOpenTick;
  const open = !before && c.tick < cd.windowCloseTick;
  return {
    ...base,
    tClock: tClock(cd.tClockTicks),
    tClockS: Math.trunc(cd.tClockTicks * DT_S),
    phase: cd.phase.state,
    phaseLabel: PHASE_LABEL[cd.phase.state],
    holding,
    holdReason: holding ? (cd.hold?.reason ?? null) : null,
    holdLabel: holding && cd.hold ? HOLD_LABEL[cd.hold.reason] : '',
    windowOpenUtc: utc(c.utc0 + cd.windowOpenTick * DT_S),
    windowCloseUtc: utc(c.utc0 + cd.windowCloseTick * DT_S),
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
const LOCK_WORDS: Record<TimeLockReason, string> = {
  TERMINAL_COUNT: 'TERMINAL COUNT',
  FLIGHT: 'FLIGHT',
  RECOVERY_SETTLE: 'RECOVERY',
  HOLD: 'HOLD',
  PHASE_CAP: '',
};

/** Mirrors the sim's `maxTimeScale` rules to name the cap (the cap value itself comes from TimeControl). */
export function lockReason(world: Readonly<World>, cd: Readonly<Countdown> | null, maxAllowed: number): TimeLockReason | null {
  if (!cd || maxAllowed >= 100) return null;
  const phase = cd.phase.state;
  if (phase === 'Safing' && world.tick - cd.phase.enteredTick < FORCE_1X_AFTER_TICKS) return 'RECOVERY_SETTLE';
  if (isPreLiftoff(phase) && cd.tClockTicks >= FORCE_1X_FROM_TICKS) return 'TERMINAL_COUNT';
  if (FLIGHT_PHASES.includes(phase)) return 'FLIGHT';
  if (cd.clock.state === 'Holding' && timeData.holdMaxTimeScale < timeData.maxTimeScaleByPhase[phase]) return 'HOLD';
  return 'PHASE_CAP';
}

/** Next poll or milestone after the current T-clock (skip target label). */
function nextMark(cd: Readonly<Countdown> | null): string {
  if (!cd || !isPreLiftoff(cd.phase.state)) return '';
  const t = cd.tClockTicks * DT_S;
  const marks: { tS: number; label: string }[] = [
    ...(Object.entries(cdData.pollTS) as [PollId, number][]).map(([id, tS]) => ({ tS, label: POLL_LABEL[id] })),
    ...cdData.milestones.map((m) => ({ tS: m.tS, label: words(m.name) })),
  ];
  const next = marks.filter((m) => m.tS > t + 1e-9).sort((a, b) => a.tS - b.tS)[0];
  return next ? `${tClockS(next.tS)} ${next.label}` : '';
}

function timeScaleVM(c: Ctx): TimeScaleVM {
  const t = c.env.time;
  const reason = lockReason(c.world, c.cd, t.maxAllowed);
  const phaseWord = c.cd ? PHASE_LABEL[c.cd.phase.state] : '';
  const word = reason ? LOCK_WORDS[reason] || phaseWord : '';
  const lockLabel = !reason ? '' : t.maxAllowed === 1 ? `1× LOCKED · ${word}` : `MAX ${t.maxAllowed}× · ${word}`;
  const rate = t.lagging ? t.effectiveRate : t.effective;
  const rateText = fixed(rate, t.lagging ? 1 : 0);
  return {
    requested: t.requested,
    effective: t.effective,
    maxAllowed: t.maxAllowed,
    paused: t.paused,
    forced1x: t.maxAllowed === 1,
    lockReason: reason,
    lockLabel,
    lagging: t.lagging,
    effectiveRate: { text: rateText, unit: '×', si: rate },
    readout: t.paused ? 'SIM PAUSED' : t.lagging ? `SIM ${rateText}× OF ${t.effective}×` : `SIM ${t.effective}×`,
    skip: { enabled: false, target: nextMark(c.cd), reason: 'SKIP_NOT_AVAILABLE' },
  };
}

// --- Economy, sites ------------------------------------------------------------------------------------------

function economyVM(c: Ctx): EconomyVM {
  return { money: credits(c.world.economy.moneyCr), reputation: num(c.world.economy.reputation, 0, 'REP') };
}

function sitesVM(c: Ctx, alertCount: number): SiteVM[] {
  return siteDefs.map((d) => {
    const status = c.world.sites[d.id]?.status ?? d.status;
    return {
      id: d.id,
      code: d.id,
      name: d.name,
      role: d.role,
      status: {
        code: status,
        label: words(status),
        glyph: status === 'UNDER_CONSTRUCTION' ? 'build' : d.playableInMvp ? 'ok' : 'idle',
        severity: d.playableInMvp ? 'ok' : 'disabled',
      },
      interactive: d.playableInMvp,
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
  const agg = stations.length
    ? stations.some((x) => x.status === 'NO_GO')
      ? 'NO_GO'
      : stations.some((x) => x.status === 'MARGINAL')
        ? 'MARGINAL'
        : 'GO'
    : null;
  const flown = cd.liftoffTick !== null;
  const status = contract?.status ?? 'ACTIVE';
  return {
    countdownId: cd.id,
    title: cd.flightName,
    vehicles: `${b?.callSign ?? '—'} / ${s?.callSign ?? '—'}`,
    boosterId: cd.boosterId,
    shipId: cd.shipId,
    tClock: tClock(cd.tClockTicks),
    tClockLabel: cd.phase.state === 'Scrubbed' || cd.scrubReason ? 'SCRUBBED' : flown ? 'FLOWN' : 'NEXT LAUNCH',
    propLoaded: pct(loadedNow),
    propSpark: { values: propLoaded as (number | null)[], unit: '', min: 0, max: 1, threshold: null },
    farmReserve: c.preLiftoff ? hours(reserveS) : missing('H'),
    farmReserveFluid: c.preLiftoff ? binding : null,
    stationsGo: goCount,
    stationsTotal: 5,
    stationsLabel: `STATIONS GO ${goCount} OF 5`,
    stationSegments: stations.map((x) => x.state.severity),
    range: agg ? { ...goStatus(agg), label: GO_LABEL[agg] } : { code: 'NONE', label: '—', glyph: 'idle', severity: 'neutral' },
    rangeSpark: {
      values: c.env.spark.values('weatherMargin') as (number | null)[],
      unit: '',
      min: -1,
      max: 1,
      threshold: 0,
    },
    contract: {
      id: cd.contractId,
      customer: k?.customer ?? '',
      status: words(status),
      state:
        status === 'FULFILLED'
          ? { code: status, label: 'FULFILLED', glyph: 'ok', severity: 'ok' }
          : status === 'WINDOW_MISSED'
            ? { code: status, label: 'WINDOW MISSED', glyph: 'danger', severity: 'danger' }
            : { code: status, label: 'ACTIVE', glyph: 'current', severity: 'active' },
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
  const phases: TimelinePhaseVM[] = PLAN.map((p, i) => {
    const id: Phase = p.id === 'TowerCatch' && divert ? 'Divert' : p.id;
    let state: TimelinePhaseVM['state'];
    if (scrubbed) state = p.endS <= tS ? 'done' : 'skipped';
    else if (phase === 'Debrief') state = 'done';
    else if (i + 1 < curIdx) state = 'done';
    else if (i + 1 === curIdx) state = holding ? 'held' : 'current';
    else state = 'pending';
    const glyph = state === 'done' ? 'done' : state === 'skipped' ? 'offline' : state === 'pending' ? 'pending' : state === 'held' ? 'holding' : 'current';
    return { id, label: PHASE_LABEL[id], state, glyph, startS: p.startS, endS: p.endS };
  });
  const polls: TimelinePollVM[] = (Object.entries(cdData.pollTS) as [PollId, number][]).map(([id, atS]) => ({
    id,
    at: tClockS(atS),
    atS,
    label: POLL_LABEL[id],
    state: cd.pollsPassed.includes(id) ? 'passed' : holding && cd.hold?.poll === id ? 'open' : 'pending',
  }));
  const site = cd.siteId;
  const s = entity(c, cd.shipId);
  return {
    countdownId: cd.id,
    context: `${site} · ${b?.callSign ?? '—'} / ${s?.callSign ?? '—'}`,
    tClock: tClock(cd.tClockTicks),
    tClockS: Math.trunc(tS),
    phases,
    polls,
    windowOpenS: Math.round(tClockAt(c, cd.windowOpenTick) * DT_S),
    windowCloseS: Math.round(tClockAt(c, cd.windowCloseTick) * DT_S),
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
  const decision = decisionVM(c, stations, timeline?.actions ?? []);
  const decisionActions = decision?.kind === 'CATCH' ? decision.options : [];
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
    flight: flightVM(c, stations),
    countdown: timeline,
    decision,
    inspector: inspectorVM(c, decisionActions),
    lists: listsVM(c, stations, orderActions(c)),
    labels: labelsVM(c, alertIds),
    sites: sitesVM(c, alerts.open),
    debrief: debriefVM(c),
    view: { siteId: view.siteId, selectedId: view.selectedId, followId: view.followId, selected: sel, follow: fol, tab: view.tab },
  };
  return share(prev, next);
}
