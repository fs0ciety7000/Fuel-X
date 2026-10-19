// Decision strip view models (GDD §13.2 D1–D3b, §4.5, §4.8; DESIGN_SYSTEM §6.28). One decision at a time, by
// urgency: CATCH (D3) > LEAK (D3b) > POLL (D2, any pre-liftoff hold) > PROP_MARGIN (D1, before the road closes);
// `queued` counts the others. Every option carries the exact sim Command; the sim stays the validator (rejections
// land in the events log as CommandRejected).
import type {
  ActionVM,
  CatchDecisionVM,
  ConsequenceVM,
  DeadlineVM,
  DecisionOptionVM,
  DecisionVM,
  LeakDecisionVM,
  MetricVM,
  PollDecisionVM,
  PropMarginDecisionVM,
  Severity,
  StationVM,
  ValueVM,
} from '@bridge/projection-types';
import { DT_S, catchBreakEvenP, propellantReserve, releaseBlocker, secondsToTicks } from '@sim/index';
import {
  anomalies as anomalyData,
  catchModel as cm,
  contracts,
  countdown as cdData,
  economy as ec,
  logistics as ld,
  propellant as pd,
} from '@data/index';
import type { Command, Countdown, Propellant, World } from '@sim/types';
import type { Ctx } from './context';
import { entitiesOf, entity, tClockAt } from './context';
import { credits, days, duration, fixed, hours, missing, mps, num, pct, prob, tClock, tonnes, utc } from './format';
import { GO_LABEL, PHASE_LABEL, POLL_LABEL, reasonLabel } from './labels';

const ROAD_CLOSURE_TICKS = secondsToTicks(ld.roadClosureStartTS);
const RECYCLE_TO_TICKS = secondsToTicks(cdData.recycleToTS);

const text = (s: string): ValueVM => ({ text: s, unit: '', value: null });
const cq = (label: string, value: ValueVM, state: Severity = 'neutral'): ConsequenceVM => ({ label, value, state });

interface ActionOpts {
  enabled?: boolean;
  reason?: string | null;
  variant?: ActionVM['variant'];
  key?: string;
  confirm?: ConsequenceVM[];
}

/** A button: disabled ones carry the reason (display + code). */
export function action(id: string, label: string, command: Command | null, opts: ActionOpts = {}): ActionVM {
  const enabled = (opts.enabled ?? true) && command !== null;
  const a: ActionVM = { id, label, enabled, variant: opts.variant ?? 'secondary', command };
  if (opts.key) a.key = opts.key;
  if (!enabled) {
    const code = opts.reason ?? 'UNAVAILABLE';
    a.reason = reasonLabel(code);
    a.reasonCode = code;
  }
  if (opts.confirm) a.confirm = opts.confirm;
  return a;
}

interface OptionOpts extends ActionOpts {
  consequences?: ConsequenceVM[];
  ev?: ValueVM;
  auto?: boolean;
}

function option(id: string, label: string, command: Command, opts: OptionOpts = {}): DecisionOptionVM {
  const enabled = opts.enabled ?? true;
  const variant = opts.variant ?? 'secondary';
  const o: DecisionOptionVM = {
    id,
    label,
    key: opts.key ?? '',
    variant,
    enabled,
    consequences: opts.consequences ?? [],
    auto: opts.auto ?? false,
    confirm: variant === 'danger',
    command,
  };
  if (!enabled) {
    const code = opts.reason ?? 'UNAVAILABLE';
    o.reason = reasonLabel(code);
    o.reasonCode = code;
  }
  if (opts.ev) o.ev = opts.ev;
  return o;
}

/** ActionVM → strip option (same command, consequences from the confirm list). */
function asOption(a: ActionVM, auto = false): DecisionOptionVM {
  return option(a.id, a.label, a.command as Command, {
    enabled: a.enabled,
    reason: a.reasonCode ?? null,
    variant: a.variant,
    key: a.key ?? '',
    consequences: a.confirm ?? [],
    auto,
  });
}

function deadline(c: Ctx, label: string, tick: number, sinceTick: number, tClockBased: boolean): DeadlineVM {
  const remainingS = Math.max(0, (tick - c.tick) * DT_S);
  const total = Math.max(1, tick - sinceTick);
  const held = tClockBased && c.cd?.clock.state === 'Holding';
  const fraction = Math.max(0, Math.min(1, (tick - c.tick) / total));
  return {
    label,
    at: tClockBased ? tClock(tClockAt(c, tick)) : `${utc(c.utc0 + tick * DT_S)} UTC`,
    tick,
    remaining: duration(remainingS),
    fraction,
    held,
    state: fraction < 0.2 ? 'danger' : fraction < 0.5 ? 'warn' : 'neutral',
  };
}

function recycleBlocker(c: Ctx, cd: Readonly<Countdown>): string | null {
  if (cd.phase.state !== 'TerminalCount') return 'NOT_IN_TERMINAL_COUNT';
  if (cd.tClockTicks <= RECYCLE_TO_TICKS) return 'NOT_PAST_RECYCLE_POINT';
  if (c.tick >= cd.windowCloseTick) return 'WINDOW_CLOSED';
  return null;
}

function scrubConsequences(cd: Readonly<Countdown>): ConsequenceVM[] {
  const k = contracts[cd.contractId];
  const out = [cq('DETANK', text('PART OF THE LOAD IS LOST'), 'warn'), cq('NEXT ATTEMPT', text('REBOOK +24 H'))];
  if (k) out.push(cq('WINDOW-MISS PENALTY', credits(-k.penaltyWindowMissedCr, true), 'danger'));
  return out;
}

/** GO / HOLD / RECYCLE / SCRUB for the timeline header (pre-liftoff only). */
export function countdownActions(c: Ctx): ActionVM[] {
  const cd = c.cd;
  if (!cd || !c.preLiftoff) return [];
  const holding = cd.clock.state === 'Holding';
  const leakFix = cd.hold?.reason === 'LEAK_FIX';
  const goBlock = !holding
    ? 'NOT_HOLDING'
    : leakFix
      ? 'LEAK_FIX_IN_PROGRESS'
      : releaseBlocker(c.world as World, cd as Countdown);
  const rec = recycleBlocker(c, cd);
  return [
    action(
      'GO',
      'GO',
      { t: 'Go', countdownId: cd.id },
      {
        enabled: goBlock === null,
        reason: goBlock,
        variant: 'primary',
        key: '⏎',
      },
    ),
    action(
      'HOLD',
      'HOLD',
      { t: 'Hold', countdownId: cd.id },
      { enabled: !holding, reason: 'ALREADY_HOLDING', key: 'H' },
    ),
    action(
      'RECYCLE',
      'RECYCLE',
      { t: 'Recycle', countdownId: cd.id },
      {
        enabled: rec === null,
        reason: rec,
        key: 'R',
        confirm: [cq('T-CLOCK BACK TO', text(tClock(RECYCLE_TO_TICKS))), cq('COST', text('TIME ONLY'))],
      },
    ),
    action(
      'SCRUB',
      'SCRUB',
      { t: 'Scrub', countdownId: cd.id },
      {
        variant: 'danger',
        confirm: scrubConsequences(cd),
      },
    ),
  ];
}

// --- D3 catch -------------------------------------------------------------------------------------------------

type Booster = Extract<ReturnType<typeof entity>, { kind: 'booster' }>;

function catchOpen(c: Ctx, b: Booster): boolean {
  const r = b.recovery;
  if (!r || r.decisionRequiredTick === null || r.result !== null || r.deadlineTick === null) return false;
  return !(c.tick >= r.deadlineTick && r.mode !== null);
}

function catchDecision(c: Ctx, cd: Readonly<Countdown>, queued: number): CatchDecisionVM | null {
  const b = entity(c, cd.boosterId);
  if (b?.kind !== 'booster' || !catchOpen(c, b)) return null;
  const r = b.recovery;
  if (!r || r.decisionRequiredTick === null || r.deadlineTick === null) return null;
  const p = r.p;
  const failedCr = ec.boosterReplacementCostCr + ec.towerRepairCostCr + ec.towerRepairDowntimeS * ec.opsCostCrPerS;
  const evCatch = -(1 - p) * failedCr;
  const evDivert = -ec.boosterReplacementCostCr;
  const band =
    p >= cm.bands.clear ? 'CLEAR' : p >= cm.bands.lean ? 'LEAN' : p >= cm.bands.contested ? 'CONTESTED' : 'AGAINST';
  const committed = r.mode !== null && r.decidedBy !== null ? { mode: r.mode, by: r.decidedBy } : null;
  const forced = r.forcedDivert;
  const closed = committed !== null || forced !== null;
  const why = forced ? `FORCED_DIVERT_${forced}` : committed ? 'ALREADY_DECIDED' : null;
  const auto = p >= cm.autoCatchThreshold ? 'CATCH' : 'DIVERT';
  const thr = fixed(cm.autoCatchThreshold, 2);
  const windEff = cm.sigmaWindCoefMPerMPerS * Math.max(0, r.towerWindMPerS - cm.sigmaWindRefMPerS);
  const lowProp = r.landingPropKg < cm.lowPropRefKg;
  const sigmaEffect = (m: number): string => (m > 0 ? `σ +${fixed(m, 1)} M` : 'σ +0.0 M');
  const pState: Severity =
    band === 'CLEAR' ? 'ok' : band === 'LEAN' ? 'neutral' : band === 'CONTESTED' ? 'warn' : 'danger';
  return {
    kind: 'CATCH',
    id: `catch:${b.id}`,
    countdownId: cd.id,
    title: `D3 CATCH OR DIVERT · ${b.callSign}`,
    question: forced
      ? `FORCED DIVERT · ${forced.replace(/_/g, ' ')}`
      : `CATCH ${b.callSign} ON TOWER-1 OR DIVERT OFFSHORE?`,
    autoNote: forced
      ? 'FLIGHT COMPUTER DIVERTS (FORCED)'
      : `AUTO AT DEADLINE: ${auto} (P ${auto === 'CATCH' ? '≥' : '<'} ${thr})`,
    deadline: deadline(c, 'LANDING BURN', r.deadlineTick, r.decisionRequiredTick, true),
    options: [
      option(
        'CATCH',
        'GO FOR CATCH',
        { t: 'CatchDecision', boosterId: b.id, choice: 'CATCH' },
        {
          enabled: !closed,
          reason: why,
          variant: 'primary',
          key: 'C',
          ev: credits(evCatch, true),
          auto: auto === 'CATCH' && !forced,
          consequences: [
            cq('SUCCESS', prob(p), pState),
            cq('FAILED CATCH', credits(-failedCr, true), 'danger'),
            cq('TOWER DOWN IF FAILED', { ...days(ec.towerRepairDowntimeS, 0) }, 'warn'),
          ],
        },
      ),
      option(
        'DIVERT',
        'DIVERT',
        { t: 'CatchDecision', boosterId: b.id, choice: 'DIVERT' },
        {
          enabled: !closed,
          reason: why,
          variant: 'danger',
          key: 'D',
          ev: credits(evDivert, true),
          auto: auto === 'DIVERT' || forced !== null,
          consequences: [cq('BOOSTER EXPENDED', credits(evDivert, true), 'warn'), cq('TOWER', text('SAFE'), 'ok')],
        },
      ),
    ],
    state: committed ? 'neutral' : pState === 'ok' ? 'warn' : pState,
    blocking: true,
    queued,
    pending: null,
    boosterId: b.id,
    p: prob(p),
    band,
    breakEven: catchBreakEvenP(),
    sigma: num(r.sigmaM, 2, 'M'),
    drivers: [
      {
        key: 'ENGINES_OUT',
        label: 'ENGINES OUT',
        value: num(b.engines.failed, 0, ''),
        effect: sigmaEffect(cm.sigmaPerEngineOutM * b.engines.failed),
        state: b.engines.failed > 0 ? 'danger' : 'neutral',
      },
      {
        key: 'TOWER_WIND',
        label: 'TOWER WIND',
        value: mps(r.towerWindMPerS),
        effect: sigmaEffect(windEff),
        state: windEff > 0 ? 'warn' : 'neutral',
      },
      {
        key: 'LANDING_PROP',
        label: 'LANDING PROP',
        value: tonnes(r.landingPropKg),
        effect: sigmaEffect(lowProp ? cm.sigmaLowPropM : 0),
        state: lowProp ? 'warn' : 'neutral',
      },
    ],
    ev: {
      catch: credits(evCatch, true),
      divert: credits(evDivert, true),
      favours: evCatch > evDivert ? 'CATCH' : 'DIVERT',
    },
    autoChoice: forced ? 'DIVERT' : auto,
    forcedDivert: forced,
    committed,
  };
}

// --- D3b leak -------------------------------------------------------------------------------------------------

function leakOpen(c: Ctx, cd: Readonly<Countdown>): boolean {
  const leak = c.world.anomalies[cd.id]?.leak;
  return !!leak?.active && leak.response === null;
}

function stageEta(c: Ctx, cd: Readonly<Countdown>, factor: number): { label: string; at: ValueVM; state: Severity }[] {
  const out: { label: string; at: ValueVM; state: Severity }[] = [];
  for (const id of [cd.boosterId, cd.shipId]) {
    const e = entity(c, id);
    if (e?.kind !== 'booster' && e?.kind !== 'ship') continue;
    let worstS = 0;
    for (const f of ['LOX', 'CH4'] as const) {
      const rem = Math.max(0, e.prop[f === 'LOX' ? 'loxCapKg' : 'ch4CapKg'] - e.prop[f === 'LOX' ? 'loxKg' : 'ch4Kg']);
      const rate = pd.loadRateKgPerS[e.kind][f] * factor;
      worstS = Math.max(worstS, rate > 0 ? rem / rate : Number.POSITIVE_INFINITY);
    }
    const doneTick = c.tick + secondsToTicks(Number.isFinite(worstS) ? worstS : 0);
    const late = !Number.isFinite(worstS) || tClockAt(c, doneTick) > secondsToTicks(cdData.loadMustCompleteByTS);
    out.push({
      label: `${e.callSign} FULL`,
      at: Number.isFinite(worstS) ? { text: tClock(tClockAt(c, doneTick)), unit: '', value: worstS } : missing(),
      state: late ? 'warn' : 'neutral',
    });
  }
  return out;
}

function leakDecision(c: Ctx, cd: Readonly<Countdown>, queued: number): LeakDecisionVM | null {
  if (!leakOpen(c, cd)) return null;
  const fixMin = fixed(anomalyData.A3.fixDurationS / 60, 0);
  return {
    kind: 'LEAK',
    id: 'leak',
    countdownId: cd.id,
    title: 'D3B GSE LEAK · OLM-1 QUICK DISCONNECT',
    question: 'CONTINUE THE LOAD DEGRADED OR HOLD TO FIX?',
    autoNote: 'NO ANSWER: LOAD CONTINUES DEGRADED',
    deadline: deadline(
      c,
      'WINDOW CLOSE',
      cd.windowCloseTick,
      c.world.anomalies[cd.id]?.fired.find((f) => f.anomaly === 'A3')?.tick ?? c.tick,
      false,
    ),
    options: [
      option(
        'DEGRADED',
        'CONTINUE DEGRADED',
        { t: 'LeakResponse', choice: 'DEGRADED' },
        {
          key: '1',
          auto: true,
          consequences: [
            cq('LOAD RATE', pct(c.world.logistics.loadRateFactor, 0)),
            cq('VEHICLE', text('MARGINAL · ANOMALY RISK UP'), 'warn'),
          ],
        },
      ),
      option(
        'HOLD_FIX',
        'HOLD TO FIX',
        { t: 'LeakResponse', choice: 'HOLD_FIX' },
        {
          variant: 'primary',
          key: '2',
          consequences: [
            cq('HOLD', { text: fixMin, unit: 'MIN', value: anomalyData.A3.fixDurationS }, 'warn'),
            cq('WINDOW / FARM', text('KEEP DRAINING'), 'warn'),
          ],
        },
      ),
    ],
    state: 'danger',
    blocking: true,
    queued,
    pending: null,
    loadEta: stageEta(c, cd, c.world.logistics.loadRateFactor),
  };
}

// --- D2 poll ----------------------------------------------------------------------------------------------------

function pollOpen(c: Ctx, cd: Readonly<Countdown>): boolean {
  return c.preLiftoff && cd.clock.state === 'Holding' && cd.hold !== null;
}

function pollDecision(
  c: Ctx,
  cd: Readonly<Countdown>,
  stations: StationVM[],
  actions: ActionVM[],
  queued: number,
): PollDecisionVM | null {
  if (!pollOpen(c, cd) || !cd.hold) return null;
  const hold = cd.hold;
  const go = actions.find((a) => a.id === 'GO');
  const blockerCode = go && !go.enabled ? (go.reasonCode ?? null) : null;
  const counts = { GO: 0, MARGINAL: 0, NO_GO: 0, PENDING: 0 };
  for (const s of stations) counts[s.status]++;
  const parts: string[] = [];
  if (counts.MARGINAL) parts.push(`${counts.MARGINAL} ${GO_LABEL.MARGINAL}`);
  if (counts.NO_GO) parts.push(`${counts.NO_GO} ${GO_LABEL.NO_GO}`);
  parts.push(`${counts.GO} OF ${stations.length} GO`);
  const pollLabel = hold.poll
    ? `${tClock(cd.tClockTicks)} ${POLL_LABEL[hold.poll]}`
    : `${tClock(cd.tClockTicks)} ${PHASE_LABEL[cd.phase.state]}`;
  const marginal = stations.filter((s) => s.status === 'MARGINAL').map((s) => s.label);
  return {
    kind: 'POLL',
    id: `poll:${hold.poll ?? hold.reason}`,
    countdownId: cd.id,
    title: `D2 GO / NO-GO · ${pollLabel}`,
    question: hold.poll
      ? 'PROCEED, RECYCLE OR SCRUB?'
      : `COUNT HOLDING · ${hold.reason.replace(/_/g, ' ')} · RESUME, RECYCLE OR SCRUB?`,
    autoNote:
      hold.reason === 'LEAK_FIX' ? 'RESUMES WHEN THE LEAK IS FIXED' : 'NO ANSWER: HOLD CONTINUES, WINDOW CLOSES',
    deadline: deadline(c, 'WINDOW CLOSE', cd.windowCloseTick, cd.clock.enteredTick, false),
    // HOLD is the state you are in: the strip offers the ways out.
    options: actions.filter((a) => a.id !== 'HOLD').map((a) => asOption(a)),
    state: counts.NO_GO ? 'danger' : 'warn',
    blocking: true,
    queued,
    pending: null,
    pollLabel,
    poll: hold.poll,
    holdReason: hold.reason,
    blocker: blockerCode ? reasonLabel(blockerCode) : null,
    blockerCode,
    stations,
    result: parts.join(' · '),
    riskNote: marginal.length ? `GO ON MARGINAL ${marginal.join(', ')} RAISES THE ANOMALY RISK` : null,
  };
}

// --- D1 propellant margin -------------------------------------------------------------------------------------

function propOpen(c: Ctx, cd: Readonly<Countdown>, stations: readonly StationVM[]): boolean {
  if (!c.preLiftoff || c.world.logistics.roadClosed || cd.tClockTicks >= ROAD_CLOSURE_TICKS) return false;
  if (cd.phase.state === 'TerminalCount') return false;
  const st = stations.find((s) => s.id === 'PROPELLANT');
  return !!st && st.status !== 'GO';
}

/** D1 order buttons (decision strip and Tasks tab): disabled once the road closes. */
export function orderActions(c: Ctx): ActionVM[] {
  const cd = c.cd;
  const closed = c.world.logistics.roadClosed || !c.preLiftoff;
  const mk = (fluid: Propellant, rush: boolean): ActionVM => {
    const d = rush ? ld.delivery.rush : ld.delivery.standard;
    const cargoKg = fluid === 'LOX' ? ld.tanker.loxCapKg : ld.tanker.ch4CapKg;
    const closureTick = cd ? c.tick + (ROAD_CLOSURE_TICKS - cd.tClockTicks) : c.tick;
    const late = secondsToTicks(d.leadTimeS) > closureTick - c.tick;
    const gate = cd ? tClock(tClockAt(c, c.tick + secondsToTicks(d.leadTimeS))) : '—';
    return action(
      `ORDER_${fluid}_${rush ? 'RUSH' : 'STANDARD'}`,
      `${fluid === 'LOX' ? 'LX' : 'MX'} ${rush ? 'RUSH' : 'STANDARD'}`,
      { t: 'OrderDelivery', fluid, rush },
      {
        enabled: !closed,
        reason: c.preLiftoff ? 'ROAD_CLOSED' : 'NO_COUNT',
        variant: rush ? 'secondary' : 'primary',
        confirm: [
          cq('CARGO', { ...tonnes(cargoKg), unit: `T ${fluid}` }),
          cq('FEE', credits(-d.feeCrPerTruck, true)),
          cq('PROPELLANT', credits(-cargoKg * ec.priceCrPerKg[fluid], true)),
          cq('AT GATE', text(gate), late ? 'warn' : 'neutral'),
        ],
      },
    );
  };
  return [mk('LOX', false), mk('LOX', true), mk('CH4', false), mk('CH4', true)];
}

function propDecision(
  c: Ctx,
  cd: Readonly<Countdown>,
  stations: StationVM[],
  orders: ActionVM[],
  queued: number,
): PropMarginDecisionVM | null {
  if (!propOpen(c, cd, stations)) return null;
  const st = stations.find((s) => s.id === 'PROPELLANT');
  const lox = propellantReserve(c.world as World, cd as Countdown, 'LOX');
  const ch4 = propellantReserve(c.world as World, cd as Countdown, 'CH4');
  const closureTick = c.tick + (ROAD_CLOSURE_TICKS - cd.tClockTicks);
  const limit = pd.stationMarginalBelowToppingS;
  const reserve = (key: string, label: string, s: number): MetricVM => ({
    key,
    label,
    value: hours(s),
    state: s < 0 ? 'danger' : s < limit ? 'warn' : 'neutral',
    threshold: limit / 3600,
  });
  const pending: { label: string; eta: ValueVM }[] = [];
  let busy = 0;
  let fleet = 0;
  for (const t of entitiesOf(c, 'tanker')) {
    if (!t.chartered) fleet++;
    if (!t.order || t.fsm.state === 'OUTBOUND') continue;
    if (!t.chartered) busy++;
    const at = tClockAt(c, t.order.gateEtaTick);
    pending.push({
      label: `${t.callSign} ${t.fluid}${t.order.rush ? ' RUSH' : ''}`,
      eta: { text: tClock(at), unit: '', value: at * DT_S },
    });
  }
  return {
    kind: 'PROP_MARGIN',
    id: 'propellant',
    countdownId: cd.id,
    title: `D1 PROPELLANT MARGIN · ${st?.detail ?? ''}`.trim(),
    question: 'ORDER EXTRA DELIVERIES BEFORE THE ROAD CLOSES?',
    autoNote: '',
    deadline: deadline(c, 'ROAD CLOSURE', closureTick, cd.createdTick, true),
    options: orders.map((a) => asOption(a)),
    state: st?.status === 'NO_GO' ? 'danger' : 'warn',
    blocking: false,
    queued,
    pending: null,
    reserves: [reserve('lox', 'LOX RESERVE', lox.holdS), reserve('ch4', 'CH4 RESERVE', ch4.holdS)],
    orders: pending,
    fleet: {
      value: busy,
      max: Math.max(fleet, ld.fleet.lx + ld.fleet.mx),
      label: `${busy} OF ${Math.max(fleet, ld.fleet.lx + ld.fleet.mx)} TRUCKS BOOKED`,
    },
  };
}

export function decisionVM(c: Ctx, stations: StationVM[], actions: ActionVM[], orders: ActionVM[]): DecisionVM | null {
  const cd = c.cd;
  if (!cd) return null;
  const b = entity(c, cd.boosterId);
  const open = [b?.kind === 'booster' && catchOpen(c, b), leakOpen(c, cd), pollOpen(c, cd), propOpen(c, cd, stations)];
  const queued = Math.max(0, open.filter(Boolean).length - 1);
  return (
    catchDecision(c, cd, queued) ??
    leakDecision(c, cd, queued) ??
    pollDecision(c, cd, stations, actions, queued) ??
    propDecision(c, cd, stations, orders, queued)
  );
}
