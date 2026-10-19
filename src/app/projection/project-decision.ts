// Decision strip view models (GDD §13.2 D1–D3b, §4.5, §4.8; DESIGN_SYSTEM decision strip). One decision at a time,
// by urgency: CATCH (D3) > LEAK (D3b) > POLL (D2, any pre-liftoff hold) > PROPELLANT (D1, before the road closes).
// Options carry the exact sim Command; the sim stays the validator (rejections land in the events log).
import type {
  ActionVM,
  CatchDecisionVM,
  DeadlineVM,
  DecisionVM,
  LeakDecisionVM,
  PollDecisionVM,
  PropellantDecisionVM,
  StationVM,
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
import { entity, tClockAt } from './context';
import { credits, days, duration, fixed, hours, mps, num, pct, prob, tClock, tonnes, utc } from './format';
import { GO_LABEL, PHASE_LABEL, POLL_LABEL, reasonLabel } from './labels';

const ROAD_CLOSURE_TICKS = secondsToTicks(ld.roadClosureStartTS);
const RECYCLE_TO_TICKS = secondsToTicks(cdData.recycleToTS);

export function action(
  id: string,
  label: string,
  command: Command | null,
  opts: { enabled?: boolean; reason?: string | null; danger?: boolean; key?: string | null; consequences?: string[] } = {},
): ActionVM {
  const enabled = (opts.enabled ?? true) && command !== null;
  return {
    id,
    label,
    enabled,
    disabledReason: enabled ? null : (opts.reason ?? 'UNAVAILABLE'),
    danger: opts.danger ?? false,
    key: opts.key ?? null,
    consequences: opts.consequences ?? [],
    command,
  };
}

function deadline(c: Ctx, tick: number, sinceTick: number, asTClock: boolean): DeadlineVM {
  const remainingS = Math.max(0, (tick - c.tick) * DT_S);
  const total = Math.max(1, tick - sinceTick);
  return {
    tick,
    at: asTClock ? tClock(tClockAt(c, tick)) : `${utc(c.utc0 + tick * DT_S)} UTC`,
    remaining: duration(remainingS),
    fraction: Math.max(0, Math.min(1, (tick - c.tick) / total)),
  };
}

function recycleBlocker(c: Ctx, cd: Readonly<Countdown>): string | null {
  if (cd.phase.state !== 'TerminalCount') return 'NOT_IN_TERMINAL_COUNT';
  if (cd.tClockTicks <= RECYCLE_TO_TICKS) return 'NOT_PAST_RECYCLE_POINT';
  if (c.tick >= cd.windowCloseTick) return 'WINDOW_CLOSED';
  return null;
}

function scrubConsequences(cd: Readonly<Countdown>): string[] {
  const k = contracts[cd.contractId];
  const out = ['DETANK · PART OF THE LOAD IS LOST', 'NEXT ATTEMPT: REBOOK WINDOW +24 H'];
  if (k) {
    const p = credits(-k.penaltyWindowMissedCr, true);
    out.push(`WINDOW-MISS PENALTY ${p.text} ${p.unit} IF THE WINDOW IS LOST`);
  }
  return out;
}

/** GO / HOLD / RECYCLE / SCRUB for the timeline header (pre-liftoff only). */
export function countdownActions(c: Ctx): ActionVM[] {
  const cd = c.cd;
  if (!cd || !c.preLiftoff) return [];
  const holding = cd.clock.state === 'Holding';
  const goBlock = holding ? releaseBlocker(c.world as World, cd as Countdown) : 'NOT_HOLDING';
  const leakFix = cd.hold?.reason === 'LEAK_FIX';
  const rec = recycleBlocker(c, cd);
  return [
    action('GO', 'GO', { t: 'Go', countdownId: cd.id }, {
      enabled: holding && goBlock === null && !leakFix,
      reason: leakFix ? 'LEAK_FIX_IN_PROGRESS' : goBlock,
      key: '⏎',
    }),
    action('HOLD', 'HOLD', { t: 'Hold', countdownId: cd.id }, { enabled: !holding, reason: 'ALREADY_HOLDING', key: 'H' }),
    action('RECYCLE', 'RECYCLE', { t: 'Recycle', countdownId: cd.id }, {
      enabled: rec === null,
      reason: rec,
      key: 'R',
      consequences: [`T-CLOCK BACK TO ${tClock(RECYCLE_TO_TICKS)}`, 'COSTS TIME ONLY'],
    }),
    action('SCRUB', 'SCRUB', { t: 'Scrub', countdownId: cd.id }, { danger: true, consequences: scrubConsequences(cd) }),
  ];
}

function catchDecision(c: Ctx, cd: Readonly<Countdown>): CatchDecisionVM | null {
  const b = entity(c, cd.boosterId);
  if (b?.kind !== 'booster') return null;
  const r = b.recovery;
  if (!r || r.decisionRequiredTick === null || r.result !== null || r.deadlineTick === null) return null;
  if (c.tick >= r.deadlineTick && r.mode !== null) return null;
  const p = r.p;
  const failedCr = ec.boosterReplacementCostCr + ec.towerRepairCostCr + ec.towerRepairDowntimeS * ec.opsCostCrPerS;
  const evCatch = -(1 - p) * failedCr;
  const evDivert = -ec.boosterReplacementCostCr;
  const band = p >= cm.bands.clear ? 'CLEAR' : p >= cm.bands.lean ? 'LEAN' : p >= cm.bands.contested ? 'CONTESTED' : 'AGAINST';
  const committed = r.mode !== null && r.decidedBy !== null ? { mode: r.mode, by: r.decidedBy } : null;
  const forced = r.forcedDivert;
  const closed = committed !== null || forced !== null;
  const why = forced ? `FORCED_DIVERT_${forced}` : committed ? 'ALREADY_DECIDED' : null;
  const divertCost = credits(evDivert, true);
  const failCost = credits(-failedCr, true);
  const pv = prob(p);
  const auto = p >= cm.autoCatchThreshold ? 'CATCH' : 'DIVERT';
  return {
    kind: 'CATCH',
    id: `catch:${b.id}`,
    countdownId: cd.id,
    title: `RECOVERY · ${b.callSign}`,
    question: forced ? `FORCED DIVERT · ${forced.replace(/_/g, ' ')}` : `CATCH ${b.callSign} ON TOWER-1 OR DIVERT OFFSHORE?`,
    deadline: deadline(c, r.deadlineTick, r.decisionRequiredTick, true),
    options: [
      action('CATCH', 'GO FOR CATCH', { t: 'CatchDecision', boosterId: b.id, choice: 'CATCH' }, {
        enabled: !closed,
        reason: why,
        key: 'C',
        consequences: [
          `P ${pv.text}`,
          `FAILED CATCH ${failCost.text} ${failCost.unit} · TOWER DOWN ${days(ec.towerRepairDowntimeS, 0).text} D`,
        ],
      }),
      action('DIVERT', 'DIVERT', { t: 'CatchDecision', boosterId: b.id, choice: 'DIVERT' }, {
        enabled: !closed,
        reason: why,
        danger: true,
        key: 'D',
        consequences: [`BOOSTER EXPENDED ${divertCost.text} ${divertCost.unit}`, 'TOWER SAFE'],
      }),
    ],
    boosterId: b.id,
    boosterCallSign: b.callSign,
    p: pv,
    band,
    drivers: [
      {
        key: 'ENGINES_OUT',
        label: 'ENGINES OUT',
        value: num(b.engines.failed, 0, ''),
        adverse: b.engines.failed > 0,
      },
      { key: 'TOWER_WIND', label: 'TOWER WIND', value: mps(r.towerWindMPerS), adverse: r.towerWindMPerS > cm.sigmaWindRefMPerS },
      {
        key: 'LANDING_PROP',
        label: 'LANDING PROP',
        value: tonnes(r.landingPropKg),
        adverse: r.landingPropKg < cm.lowPropRefKg,
      },
      { key: 'SIGMA', label: 'LATERAL σ', value: num(r.sigmaM, 2, 'M'), adverse: r.sigmaM > cm.sigmaBaseM + 1e-9 },
    ],
    ev: {
      catchCr: credits(evCatch, true),
      divertCr: credits(evDivert, true),
      breakEvenP: prob(catchBreakEvenP()),
      favours: evCatch > evDivert ? 'CATCH' : 'DIVERT',
    },
    autoPolicy: { threshold: prob(cm.autoCatchThreshold), choice: auto },
    forcedDivert: forced,
    committed,
  };
}

function leakDecision(c: Ctx, cd: Readonly<Countdown>): LeakDecisionVM | null {
  const leak = c.world.anomalies[cd.id]?.leak;
  if (!leak?.active || leak.response !== null) return null;
  const fixMin = fixed(anomalyData.A3.fixDurationS / 60, 0);
  return {
    kind: 'LEAK',
    id: 'leak',
    countdownId: cd.id,
    title: 'GSE LEAK · OLM-1 QUICK DISCONNECT',
    question: 'CONTINUE THE LOAD DEGRADED OR HOLD TO FIX?',
    deadline: deadline(c, cd.windowCloseTick, c.tick, false),
    options: [
      action('DEGRADED', 'CONTINUE DEGRADED', { t: 'LeakResponse', choice: 'DEGRADED' }, {
        key: '1',
        consequences: ['LOAD CONTINUES AT REDUCED RATE', 'VEHICLE MARGINAL · ANOMALY RISK UP'],
      }),
      action('HOLD_FIX', 'HOLD TO FIX', { t: 'LeakResponse', choice: 'HOLD_FIX' }, {
        key: '2',
        consequences: [`HOLD ${fixMin} MIN · LOAD PAUSED`, 'WINDOW KEEPS CLOSING · FARM KEEPS DRAINING'],
      }),
    ],
    loadRateFactor: pct(c.world.logistics.loadRateFactor, 0),
  };
}

function pollDecision(c: Ctx, cd: Readonly<Countdown>, stations: StationVM[], actions: ActionVM[]): PollDecisionVM | null {
  if (!c.preLiftoff || cd.clock.state !== 'Holding' || !cd.hold) return null;
  const hold = cd.hold;
  const blocker = hold.reason === 'LEAK_FIX' ? 'LEAK_FIX_IN_PROGRESS' : releaseBlocker(c.world as World, cd as Countdown);
  const counts = { GO: 0, MARGINAL: 0, NO_GO: 0 };
  for (const s of stations) counts[s.status]++;
  const parts: string[] = [];
  if (counts.MARGINAL) parts.push(`${counts.MARGINAL} ${GO_LABEL.MARGINAL}`);
  if (counts.NO_GO) parts.push(`${counts.NO_GO} ${GO_LABEL.NO_GO}`);
  parts.push(`${counts.GO} OF ${stations.length} GO`);
  const where = hold.poll ? `${tClock(cd.tClockTicks)} ${POLL_LABEL[hold.poll]}` : `${tClock(cd.tClockTicks)} ${PHASE_LABEL[cd.phase.state]}`;
  return {
    kind: 'POLL',
    id: `poll:${hold.poll ?? hold.reason}`,
    countdownId: cd.id,
    title: `GO / NO-GO · ${where}`,
    question: hold.poll ? 'PROCEED, HOLD, RECYCLE OR SCRUB?' : `COUNT HOLDING · ${hold.reason.replace(/_/g, ' ')}`,
    deadline: deadline(c, cd.windowCloseTick, cd.clock.enteredTick, false),
    // HOLD is the state you are in: the strip offers the ways out.
    options: actions.filter((a) => a.id !== 'HOLD'),
    poll: hold.poll,
    holdReason: hold.reason,
    blocker,
    blockerLabel: reasonLabel(blocker),
    stations,
    result: parts.join(' · '),
  };
}

function propellantDecision(c: Ctx, cd: Readonly<Countdown>, stations: StationVM[]): PropellantDecisionVM | null {
  if (!c.preLiftoff || c.world.logistics.roadClosed || cd.tClockTicks >= ROAD_CLOSURE_TICKS) return null;
  if (cd.phase.state === 'TerminalCount') return null;
  const st = stations.find((s) => s.id === 'PROPELLANT');
  if (!st || st.status === 'GO') return null;
  const lox = propellantReserve(c.world as World, cd as Countdown, 'LOX');
  const ch4 = propellantReserve(c.world as World, cd as Countdown, 'CH4');
  const closureTick = c.tick + (ROAD_CLOSURE_TICKS - cd.tClockTicks);
  const order = (fluid: Propellant, rush: boolean): ActionVM => {
    const d = rush ? ld.delivery.rush : ld.delivery.standard;
    const fee = credits(-d.feeCrPerTruck, true);
    const cargoKg = fluid === 'LOX' ? ld.tanker.loxCapKg : ld.tanker.ch4CapKg;
    const price = credits(-cargoKg * ec.priceCrPerKg[fluid], true);
    const late = secondsToTicks(d.leadTimeS) > closureTick - c.tick;
    return action(
      `ORDER_${fluid}_${rush ? 'RUSH' : 'STANDARD'}`,
      `${fluid === 'LOX' ? 'LX' : 'MX'} ${rush ? 'RUSH' : 'STANDARD'}`,
      { t: 'OrderDelivery', fluid, rush },
      {
        consequences: [
          `${tonnes(cargoKg).text} T ${fluid}`,
          `FEE ${fee.text} · PROPELLANT ${price.text} ${price.unit}`,
          `GATE ${tClock(tClockAt(c, c.tick + secondsToTicks(d.leadTimeS)))}${late ? ' · AFTER ROAD CLOSURE' : ''}`,
        ],
      },
    );
  };
  let pending = 0;
  for (const id of c.world.entities.order) {
    const e = c.world.entities.byId[id];
    if (e?.kind === 'tanker' && e.order && e.fsm.state !== 'OUTBOUND') pending++;
  }
  const binding = lox.holdS <= ch4.holdS ? 'LOX' : 'CH4';
  return {
    kind: 'PROPELLANT',
    id: 'propellant',
    countdownId: cd.id,
    title: `PROPELLANT MARGIN · ${st.detail}`,
    question: 'ORDER EXTRA DELIVERIES BEFORE THE ROAD CLOSES?',
    deadline: deadline(c, closureTick, cd.createdTick, true),
    options: [order('LOX', false), order('LOX', true), order('CH4', false), order('CH4', true)],
    reserve: { lox: hours(lox.holdS), ch4: hours(ch4.holdS), binding },
    limit: hours(pd.stationMarginalBelowToppingS),
    pendingOrders: pending,
  };
}

export function decisionVM(c: Ctx, stations: StationVM[], actions: ActionVM[]): DecisionVM | null {
  const cd = c.cd;
  if (!cd) return null;
  return (
    catchDecision(c, cd) ?? leakDecision(c, cd) ?? pollDecision(c, cd, stations, actions) ?? propellantDecision(c, cd, stations)
  );
}
