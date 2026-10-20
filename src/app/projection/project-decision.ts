// Decision strip view models (GDD §13.2 D1–D3b, §4.5, §4.8; DESIGN_SYSTEM §6.28). One decision at a time, by
// priority D3 (CATCH) > D3b (LEAK) > D2 (POLL, any pre-liftoff hold) > D1 (PROP_MARGIN, before the road closes);
// `queued` / `queuedKinds` name the others. Every option carries the exact sim Command and the §13.2.2 consequence
// preview (certain consequences and the budgets each option spends; an expected value on D3 only). The sim stays
// the validator (rejections land in the events log as CommandRejected).
import type {
  ActionVM,
  CatchDecisionVM,
  ConsequenceVM,
  DeadlineVM,
  DecisionKind,
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
import {
  DT_S,
  STATIONS,
  catchBreakEvenP,
  crewElapsedS,
  propellantReserve,
  releaseBlocker,
  secondsToTicks,
} from '@sim/index';
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
import { catchOpen, holdOpen, leakOpen } from '../decisions/open';
import type { Ctx } from './context';
import { entitiesOf, entity, tClockAt } from './context';
import {
  credits,
  days,
  duration,
  fixed,
  holdHours,
  holdMinutes,
  hours,
  hoursMinutes,
  minutes,
  missing,
  mps,
  num,
  prob,
  tClock,
  tonnes,
  utc,
} from './format';
import { GO_LABEL, PHASE_LABEL, POLL_LABEL, STATION_LABEL, reasonLabel } from './labels';

const ROAD_CLOSURE_TICKS = secondsToTicks(ld.roadClosureStartTS);
const RECYCLE_TO_TICKS = secondsToTicks(cdData.recycleToTS);

const text = (s: string): ValueVM => ({ text: s, unit: '', value: null });
const cq = (label: string, value: ValueVM, state: Severity = 'neutral'): ConsequenceVM => ({ label, value, state });

// --- Budgets (GDD §13.2.2: what each option spends) ------------------------------------------------------------

/** Tick of liftoff if the count ran from now without further holds. */
const liftoffIfGoNow = (c: Ctx, cd: Readonly<Countdown>): number => c.tick - Math.min(0, cd.tClockTicks);

/** Hold time the window still allows, s: window close − liftoff if GO now (negative = already too late). */
const windowSlackS = (c: Ctx, cd: Readonly<Countdown>): number => (cd.windowCloseTick - liftoffIfGoNow(c, cd)) * DT_S;

const slackState = (s: number): Severity => (s <= 0 ? 'danger' : s < 600 ? 'warn' : 'neutral');
const reserveState = (s: number): Severity =>
  s < 0 ? 'danger' : s < pd.stationMarginalBelowToppingS ? 'warn' : 'neutral';

interface Reserves {
  LOX: { holdS: number; toppingKgPerS: number };
  CH4: { holdS: number; toppingKgPerS: number };
}

/** Once per projection run (orders, countdown actions and the strip all read it). */
const reserveCache = new WeakMap<Ctx, Reserves>();

function reserves(c: Ctx, cd: Readonly<Countdown>): Reserves {
  let r = reserveCache.get(c);
  if (!r) {
    r = {
      LOX: propellantReserve(c.world as World, cd as Countdown, 'LOX'),
      CH4: propellantReserve(c.world as World, cd as Countdown, 'CH4'),
    };
    reserveCache.set(c, r);
  }
  return r;
}

/** `LOX 36 HOLD-MIN` / `CH4 49 HOLD-MIN` lines after spending `spentS` of hold. */
function reserveLines(r: Reserves, label: string, spentS = 0): ConsequenceVM[] {
  return (['LOX', 'CH4'] as const).map((f) => {
    const s = r[f].holdS - spentS;
    return cq(`${f} ${label}`, holdMinutes(s), reserveState(s));
  });
}

/** Risk line per MARGINAL station passed by GO (data: `anomalies.marginalCategories`, AC 14). */
function marginalRisk(station: keyof typeof anomalyData.marginalCategories): string {
  const cats = anomalyData.marginalCategories[station] as readonly string[];
  const x = fixed(anomalyData.marginalRiskMultiplier, 1);
  return cats.includes('A4')
    ? `ENGINE-OUT RISK ×${x}`
    : cats.length
      ? `${cats.join(' ')} RISK ×${x}`
      : 'NO RISK CHANGE';
}

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

function option(id: string, label: string, command: Command | null, opts: OptionOpts = {}): DecisionOptionVM {
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
  };
  // null = UI-only option (D1 NO ORDER collapses the strip; nothing is sent).
  if (command) o.command = command;
  if (!enabled) {
    const code = opts.reason ?? 'UNAVAILABLE';
    o.reason = reasonLabel(code);
    o.reasonCode = code;
  }
  if (opts.ev) o.ev = opts.ev;
  return o;
}

/** ActionVM → strip option (same command, consequences from the confirm list). */
function asOption(a: ActionVM, auto = false, consequences?: ConsequenceVM[]): DecisionOptionVM {
  const o = option(a.id, a.label, a.command as Command, {
    enabled: a.enabled,
    reason: a.reasonCode ?? null,
    variant: a.variant,
    key: a.key ?? '',
    consequences: consequences ?? a.confirm ?? [],
    auto,
  });
  if (!o.enabled && a.reason) o.reason = a.reason;
  return o;
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

/** SCRUB (certain): window-miss penalty, reputation, detank loss, rebook (not played), run ends (GDD §13.2.2). */
function scrubConsequences(c: Ctx, cd: Readonly<Countdown>): ConsequenceVM[] {
  const k = contracts[cd.contractId];
  const loaded = { LOX: 0, CH4: 0 };
  for (const id of [cd.boosterId, cd.shipId]) {
    const e = entity(c, id);
    if (e?.kind !== 'booster' && e?.kind !== 'ship') continue;
    loaded.LOX += e.prop.loxKg;
    loaded.CH4 += e.prop.ch4Kg;
  }
  const loss = pd.scrubDetankLossFraction;
  const out: ConsequenceVM[] = [];
  if (k) out.push(cq('WINDOW-MISS PENALTY', credits(-k.penaltyWindowMissedCr, true), 'danger'));
  out.push(
    cq('REPUTATION', num(ec.reputationDelta.windowMissed, 0, 'REP'), 'danger'),
    cq('DETANK LOSS LOX', tonnes(loaded.LOX * loss), loaded.LOX > 0 ? 'warn' : 'neutral'),
    cq('DETANK LOSS CH4', tonnes(loaded.CH4 * loss), loaded.CH4 > 0 ? 'warn' : 'neutral'),
    cq('NEXT ATTEMPT', text(`REBOOK +${fixed((k?.rebookDelayS ?? 86_400) / 3600, 0)} H (NOT PLAYED IN MVP)`)),
    cq('RUN', text('ENDS AT DEBRIEF'), 'warn'),
  );
  return out;
}

/** GO: MARGINAL stations passed and their risk line; NO-GO stations named when GO is blocked. */
function goConsequences(cd: Readonly<Countdown>): ConsequenceVM[] {
  const out: ConsequenceVM[] = [];
  for (const st of STATIONS) {
    const status = cd.inputs.stations[st];
    if (status === 'MARGINAL') out.push(cq(`${STATION_LABEL[st]} MARGINAL`, text(marginalRisk(st)), 'warn'));
    else if (status === 'NO_GO') out.push(cq(`${STATION_LABEL[st]} NO-GO`, text('BLOCKS GO'), 'danger'));
  }
  if (out.length === 0) out.push(cq('STATIONS', text('ALL GO'), 'ok'));
  return out;
}

/** RECYCLE: back to T-00:10:00; earliest liftoff after it vs window close; reserve left at that liftoff. */
function recycleConsequences(c: Ctx, cd: Readonly<Countdown>, r: Reserves): ConsequenceVM[] {
  const extraS = Math.max(0, (cd.tClockTicks - RECYCLE_TO_TICKS) * DT_S);
  const liftoff = c.tick + (0 - RECYCLE_TO_TICKS);
  const slack = (cd.windowCloseTick - liftoff) * DT_S;
  return [
    cq('T-CLOCK BACK TO', text(tClock(RECYCLE_TO_TICKS))),
    cq('EARLIEST LIFTOFF', text(`${utc(c.utc0 + liftoff * DT_S)} UTC`), slackState(slack)),
    cq('WINDOW CLOSES', text(`${utc(c.utc0 + cd.windowCloseTick * DT_S)} UTC`)),
    cq('WINDOW LEFT AT LIFTOFF', minutes(slack), slackState(slack)),
    ...reserveLines(r, 'RESERVE AT LIFTOFF', extraS),
  ];
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
  const r = reserves(c, cd);
  const go = action(
    'GO',
    'GO',
    { t: 'Go', countdownId: cd.id },
    { enabled: goBlock === null, reason: goBlock, variant: 'primary', key: '⏎' },
  );
  // GO disabled by a NO-GO names the blocking station(s) (GDD §13.2.2); the code stays STATION_NO_GO.
  const noGo = STATIONS.filter((st) => cd.inputs.stations[st] === 'NO_GO');
  if (goBlock === 'STATION_NO_GO' && noGo.length) go.reason = `${noGo.map((st) => STATION_LABEL[st]).join(', ')} NO-GO`;
  return [
    go,
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
      { enabled: rec === null, reason: rec, key: 'R', confirm: recycleConsequences(c, cd, r) },
    ),
    action(
      'SCRUB',
      'SCRUB',
      { t: 'Scrub', countdownId: cd.id },
      { variant: 'danger', confirm: scrubConsequences(c, cd) },
    ),
  ];
}

// --- D3 catch -------------------------------------------------------------------------------------------------

function catchDecision(c: Ctx, cd: Readonly<Countdown>, queued: Queue): CatchDecisionVM | null {
  const b = entity(c, cd.boosterId);
  if (b?.kind !== 'booster' || !catchOpen(c.world, b)) return null;
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
            cq('P(CATCH)', prob(p), pState),
            cq('BREAK-EVEN P', prob(catchBreakEvenP())),
            cq('IF CAUGHT', text('BOOSTER TO REFURB · TOWER NOMINAL'), 'ok'),
            cq('IF FAILED', credits(-failedCr, true), 'danger'),
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
          consequences: [
            cq('P(SAFE)', prob(1), 'ok'),
            cq('BOOSTER EXPENDED', credits(evDivert, true), 'warn'),
            cq('TOWER', text('SAFE'), 'ok'),
          ],
        },
      ),
    ],
    state: committed ? 'neutral' : pState === 'ok' ? 'warn' : pState,
    blocking: true,
    ...queued,
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

/** Per-stage load-complete T-clock at `factor` × the nominal rate, with the load starting after `delayS` of hold. */
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
    // The T-clock runs while loading (a LEAK_FIX hold freezes it with the load, so the fix adds no T-clock time).
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

/** `B-09 FULL T−00:21:40` preview lines (+ the T-00:03:00 auto-hold warning when late). */
function etaLines(etas: { label: string; at: ValueVM; state: Severity }[]): ConsequenceVM[] {
  const out = etas.map((e) => cq(e.label, e.at, e.state));
  if (etas.some((e) => e.state === 'warn'))
    out.push(cq('LATE LOAD', text(`AUTO-HOLD AT ${tClock(secondsToTicks(cdData.loadMustCompleteByTS))}`), 'warn'));
  return out;
}

function leakDecision(c: Ctx, cd: Readonly<Countdown>, queued: Queue): LeakDecisionVM | null {
  if (!leakOpen(c.world, cd)) return null;
  const leak = c.world.anomalies[cd.id]?.leak;
  const fixS = anomalyData.A3.fixDurationS;
  const fixMin = fixed(fixS / 60, 0);
  const factor = c.world.logistics.loadRateFactor;
  const onset = c.world.anomalies[cd.id]?.fired.find((f) => f.anomaly === 'A3')?.tick ?? c.tick;
  const r = reserves(c, cd);
  const slack = windowSlackS(c, cd);
  const degradedEta = stageEta(c, cd, factor);
  const fixedEta = stageEta(c, cd, 1);
  const vehRisk = marginalRisk('VEHICLE');
  return {
    kind: 'LEAK',
    id: 'leak',
    countdownId: cd.id,
    title: 'D3B GSE LEAK · OLM-1 QUICK DISCONNECT',
    question: 'CONTINUE THE LOAD DEGRADED OR HOLD TO FIX?',
    autoNote: 'AUTO AT DEADLINE: CONTINUE DEGRADED',
    deadline: deadline(c, 'AUTO DEGRADED', leak?.deadlineTick ?? cd.windowCloseTick, onset, false),
    options: [
      option(
        'DEGRADED',
        'CONTINUE DEGRADED',
        { t: 'LeakResponse', choice: 'DEGRADED' },
        {
          variant: 'primary',
          key: 'C',
          auto: true,
          consequences: [
            cq('LOAD RATE', { text: `×${fixed(factor, 2)}`, unit: '', value: factor }, 'warn'),
            ...etaLines(degradedEta),
            cq('VEHICLE', text(`MARGINAL UNTIL LIFTOFF · ${vehRisk} IF GO`), 'warn'),
            cq('FIX OPTION', text('GONE (ONE-SHOT)')),
          ],
        },
      ),
      option(
        'HOLD_FIX',
        `HOLD ${fixMin} MIN TO FIX`,
        { t: 'LeakResponse', choice: 'HOLD_FIX' },
        {
          key: 'H',
          consequences: [
            cq('HOLD', { text: fixMin, unit: 'MIN', value: fixS }, 'warn'),
            cq('WINDOW LEFT AFTER FIX', minutes(slack - fixS), slackState(slack - fixS)),
            ...reserveLines(r, 'RESERVE AFTER FIX', fixS),
            ...etaLines(fixedEta),
          ],
        },
      ),
    ],
    state: 'danger',
    blocking: true,
    ...queued,
    pending: null,
    loadEta: degradedEta,
  };
}

// --- D2 poll ----------------------------------------------------------------------------------------------------

/** Strip header evidence (GDD §13.2.2): the cost of staying held, per 10 min, and the liftoff-vs-close budget. */
function holdEvidence(c: Ctx, cd: Readonly<Countdown>, r: Reserves): ConsequenceVM[] {
  const slack = windowSlackS(c, cd);
  const shiftLeft = cdData.crew.shiftLimitS - crewElapsedS(c.world as World, cd as Countdown);
  const liftoff = liftoffIfGoNow(c, cd);
  return [
    cq('WINDOW LEFT', minutes(slack), slackState(slack)),
    cq('EARLIEST LIFTOFF IF GO', text(`${utc(c.utc0 + liftoff * DT_S)} UTC`), slackState(slack)),
    cq('WINDOW CLOSES', text(`${utc(c.utc0 + cd.windowCloseTick * DT_S)} UTC`)),
    ...reserveLines(r, 'RESERVE'),
    cq(
      'CREW SHIFT LEFT',
      hoursMinutes(shiftLeft),
      shiftLeft <= 0 ? 'danger' : shiftLeft < cdData.crew.shiftLimitS - cdData.crew.marginalFromS ? 'warn' : 'neutral',
    ),
    cq('EACH 10 MIN HELD', text('WINDOW −10 MIN · RESERVE −10 HOLD-MIN · SHIFT −0:10'), 'warn'),
  ];
}

function pollDecision(
  c: Ctx,
  cd: Readonly<Countdown>,
  stations: StationVM[],
  actions: ActionVM[],
  queued: Queue,
): PollDecisionVM | null {
  if (!c.preLiftoff || !holdOpen(cd) || !cd.hold) return null;
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
  const marginal = STATIONS.filter((st) => cd.inputs.stations[st] === 'MARGINAL');
  const r = reserves(c, cd);
  const preview: Record<string, ConsequenceVM[]> = {
    GO: goConsequences(cd),
    RECYCLE: recycleConsequences(c, cd, r),
    SCRUB: scrubConsequences(c, cd),
  };
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
    options: actions.filter((a) => a.id !== 'HOLD').map((a) => asOption(a, false, preview[a.id])),
    state: counts.NO_GO ? 'danger' : 'warn',
    blocking: true,
    ...queued,
    pending: null,
    pollLabel,
    poll: hold.poll,
    holdReason: hold.reason,
    blocker: blockerCode ? (go?.reason ?? reasonLabel(blockerCode)) : null,
    blockerCode,
    stations,
    result: parts.join(' · '),
    riskNote: marginal.length
      ? `GO ON MARGINAL: ${marginal.map((st) => `${STATION_LABEL[st]} ${marginalRisk(st)}`).join(' · ')}`
      : null,
    evidence: holdEvidence(c, cd, r),
  };
}

// --- D1 propellant margin -------------------------------------------------------------------------------------

function propOpen(c: Ctx, cd: Readonly<Countdown>, stations: readonly StationVM[]): boolean {
  if (!c.preLiftoff || c.world.logistics.roadClosed || cd.tClockTicks >= ROAD_CLOSURE_TICKS) return false;
  if (cd.phase.state === 'TerminalCount') return false;
  const st = stations.find((s) => s.id === 'PROPELLANT');
  return !!st && st.status !== 'GO';
}

interface Fleet {
  /** Own trucks (LX + MX). */
  size: number;
  /** Own trucks with an open order. */
  busy: number;
  /** Free own trucks per fluid (a STANDARD order needs one). */
  free: Record<Propellant, number>;
  /** Undelivered cargo of open orders per fluid, kg. */
  openKg: Record<Propellant, number>;
  pending: { label: string; eta: ValueVM }[];
}

function fleetState(c: Ctx): Fleet {
  const f: Fleet = { size: 0, busy: 0, free: { LOX: 0, CH4: 0 }, openKg: { LOX: 0, CH4: 0 }, pending: [] };
  for (const t of entitiesOf(c, 'tanker')) {
    if (!t.chartered) {
      f.size++;
      if (!t.order && t.fsm.state === 'OFFMAP') f.free[t.fluid]++;
    }
    if (!t.order || t.fsm.state === 'OUTBOUND') continue;
    if (!t.chartered) f.busy++;
    f.openKg[t.fluid] += t.cargoKg;
    const at = tClockAt(c, t.order.gateEtaTick);
    f.pending.push({
      label: `${t.callSign} ${t.fluid}${t.order.rush ? ' RUSH' : ''}`,
      eta: { text: tClock(at), unit: '', value: at * DT_S },
    });
  }
  f.size = Math.max(f.size, ld.fleet.lx + ld.fleet.mx);
  return f;
}

/** D1 order buttons (decision strip and Tasks tab) with the §13.2.2 preview; disabled past their cut-off. */
export function orderActions(c: Ctx): ActionVM[] {
  const cd = c.cd;
  const closed = c.world.logistics.roadClosed || !c.preLiftoff;
  const fleet = fleetState(c);
  // Reserves are pre-liftoff quantities (hold time before T-0); after liftoff the order rows show `—`.
  const r = cd && c.preLiftoff ? reserves(c, cd) : null;
  const mk = (fluid: Propellant, rush: boolean): ActionVM => {
    const d = rush ? ld.delivery.rush : ld.delivery.standard;
    const cargoKg = fluid === 'LOX' ? ld.tanker.loxCapKg : ld.tanker.ch4CapKg;
    const closureTick = cd ? c.tick + (ROAD_CLOSURE_TICKS - cd.tClockTicks) : c.tick;
    const late = secondsToTicks(d.leadTimeS) > closureTick - c.tick;
    const noTruck = !rush && fleet.free[fluid] <= 0;
    const gate = cd ? tClock(tClockAt(c, c.tick + secondsToTicks(d.leadTimeS))) : '—';
    const costCr = d.feeCrPerTruck + cargoKg * ec.priceCrPerKg[fluid];
    const res = r?.[fluid] ?? null;
    const boughtS = res && res.toppingKgPerS > 0 ? cargoKg / res.toppingKgPerS : null;
    const openS = res && res.toppingKgPerS > 0 ? fleet.openKg[fluid] / res.toppingKgPerS : 0;
    const after = res
      ? `${fluid} ${holdHours(res.holdS).text} → ${holdHours(res.holdS + openS + (boughtS ?? 0)).text}`
      : '—';
    const reason = closed
      ? c.preLiftoff
        ? 'ROAD_CLOSED'
        : 'NO_COUNT'
      : late
        ? 'ARRIVES_AFTER_ROAD_CLOSURE'
        : 'NO_TANKER_AVAILABLE';
    return action(
      `ORDER_${fluid}_${rush ? 'RUSH' : 'STANDARD'}`,
      `${fluid === 'LOX' ? 'LX' : 'MX'} ${rush ? 'RUSH' : 'STANDARD'}`,
      { t: 'OrderDelivery', fluid, rush },
      {
        enabled: !closed && !late && !noTruck,
        reason,
        variant: rush ? 'secondary' : 'primary',
        confirm: [
          cq('COST', credits(-costCr, true)),
          cq('FEE', credits(-d.feeCrPerTruck, true)),
          cq('CARGO', { ...tonnes(cargoKg), unit: `T ${fluid}` }),
          cq('HOLD-MIN BOUGHT', holdMinutes(boughtS), 'ok'),
          cq('AT GATE', text(gate), late ? 'warn' : 'neutral'),
          cq('RESERVE AFTER ORDERS', {
            text: after,
            unit: 'HOLD-H',
            value: res ? holdHours(res.holdS + openS + (boughtS ?? 0)).value : null,
          }),
          cq('TRUCKS BOOKED', text(`${fleet.busy + (rush ? 0 : 1)} OF ${fleet.size}`), noTruck ? 'warn' : 'neutral'),
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
  queued: Queue,
): PropMarginDecisionVM | null {
  if (!propOpen(c, cd, stations)) return null;
  const st = stations.find((s) => s.id === 'PROPELLANT');
  const r = reserves(c, cd);
  const fleet = fleetState(c);
  const closureTick = c.tick + (ROAD_CLOSURE_TICKS - cd.tClockTicks);
  const limit = pd.stationMarginalBelowToppingS;
  const reserve = (key: string, label: string, s: number): MetricVM => ({
    key,
    label,
    value: hours(s),
    state: s < 0 ? 'danger' : s < limit ? 'warn' : 'neutral',
    threshold: limit / 3600,
  });
  const k = contracts[cd.contractId];
  const holdWindowS = (k?.windowDurationS ?? 0) + (k?.windowOpenTS ?? 0);
  const noOrder = option('NO_ORDER', 'NO ORDER', null, {
    key: 'Esc',
    auto: true,
    consequences: [
      cq('LOX RESERVE STAYS', holdHours(r.LOX.holdS), reserveState(r.LOX.holdS)),
      cq('CH4 RESERVE STAYS', holdHours(r.CH4.holdS), reserveState(r.CH4.holdS)),
      cq('HOLD WINDOW', minutes(holdWindowS)),
      cq('COST', credits(0, true)),
    ],
  });
  return {
    kind: 'PROP_MARGIN',
    id: 'propellant',
    countdownId: cd.id,
    title: `D1 PROPELLANT MARGIN · ${st?.detail ?? ''}`.trim(),
    question: 'ORDER EXTRA DELIVERIES BEFORE THE ROAD CLOSES?',
    autoNote: 'NO ANSWER: NOTHING ORDERED',
    deadline: deadline(c, 'ROAD CLOSURE', closureTick, cd.createdTick, true),
    options: [...orders.map((a) => asOption(a)), noOrder],
    state: st?.status === 'NO_GO' ? 'danger' : 'warn',
    blocking: false,
    ...queued,
    pending: null,
    reserves: [reserve('lox', 'LOX RESERVE', r.LOX.holdS), reserve('ch4', 'CH4 RESERVE', r.CH4.holdS)],
    orders: fleet.pending,
    fleet: { value: fleet.busy, max: fleet.size, label: `${fleet.busy} OF ${fleet.size} TRUCKS BOOKED` },
  };
}

// --- Priority -------------------------------------------------------------------------------------------------

interface Queue {
  queued: number;
  queuedKinds: DecisionKind[];
}

/** GDD §13.2.1: D3 > D3b > D2 > D1; one decision shown, the others queued (AC 30). */
export const DECISION_PRIORITY: readonly DecisionKind[] = ['CATCH', 'LEAK', 'POLL', 'PROP_MARGIN'];

export function decisionVM(c: Ctx, stations: StationVM[], actions: ActionVM[], orders: ActionVM[]): DecisionVM | null {
  const cd = c.cd;
  if (!cd) return null;
  const b = entity(c, cd.boosterId);
  const open: Record<DecisionKind, boolean> = {
    CATCH: b?.kind === 'booster' && catchOpen(c.world, b),
    LEAK: leakOpen(c.world, cd),
    POLL: c.preLiftoff && holdOpen(cd),
    PROP_MARGIN: propOpen(c, cd, stations),
  };
  const kinds = DECISION_PRIORITY.filter((k) => open[k]);
  const top = kinds[0];
  if (!top) return null;
  const q: Queue = { queued: kinds.length - 1, queuedKinds: kinds.slice(1) };
  switch (top) {
    case 'CATCH':
      return catchDecision(c, cd, q);
    case 'LEAK':
      return leakDecision(c, cd, q);
    case 'POLL':
      return pollDecision(c, cd, stations, actions, q);
    case 'PROP_MARGIN':
      return propDecision(c, cd, stations, orders, q);
  }
}
