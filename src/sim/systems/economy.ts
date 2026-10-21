// Economy, contract and debrief (ARCHITECTURE §4 slot 3/10, GDD §8–9, BALANCING §9, AC 21–22).
// Runs after every other system of the tick and books what happened this tick from the event outbox:
//   DeliveryOrdered.feeCr → HAULAGE_FEE · DeliveryCompleted.costCr → PROPELLANT_PURCHASE
//   DetankCompleted → PROPELLANT_LOST (vented kg × price) · WindowMissed → WINDOW_MISSED (+ reputation)
//   ship SECO → contract FULFILLED: CONTRACT_PRICE (+ success reputation), SHIP_EXPENDED
//   booster LIFTOFF → flight count · RecoveryOutcome → wear, BOOSTER_REFURB | BOOSTER_LOST (+ TOWER_REPAIR,
//   TOWER_DOWNTIME, reputation on a failed catch)
//   Debrief → OPS_COST for the attempt's sim duration, WINDOW_MISSED for a commanded scrub (the MVP does not play
//   the rebook), then the debrief record + `DebriefReady`.
// The decision log collects accepted player commands (recorded by applyCommands) and the automatic decisions
// visible in events (auto poll GO, auto/forced recovery, auto holds, window-closed scrub, D3b AUTO DEGRADED).
import { contracts as contractDefs, economy as ec, vehicles } from '@data/index';
import type { Propellant } from '@data/index';
import { commandSource } from '../core/commands';
import type { Command, CommandSource } from '../core/commands';
import { getEntity } from '../core/entities';
import { emit, eventsThisTick } from '../core/events';
import type { SimEvent } from '../core/events';
import { DT_S, secondsToTicks } from '../core/time';
import { countdownIds } from '../core/world';
import type { AttemptStart, Debrief, DebriefOutcome, DecisionBy, LedgerItem, World } from '../core/world';
import type { Countdown, EntityOf, Id } from '../types';

const PRICE = ec.priceCrPerKg;
const REP = ec.reputationDelta;
const W = vehicles.wear;

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** The attempt postings and decisions are charged to: first countdown (sorted) not in Debrief. */
function activeCountdownId(world: World): Id | null {
  for (const id of countdownIds(world)) if (world.countdowns[id]?.phase.state !== 'Debrief') return id;
  return null;
}

function post(world: World, countdownId: Id | null, item: LedgerItem, amountCr: number, reputationDelta = 0, ref = '') {
  const e = world.economy;
  e.moneyCr += amountCr;
  e.reputation = clamp(e.reputation + reputationDelta, 0, 100);
  e.ledger.push({ tick: world.tick, countdownId, item, amountCr, reputationDelta, ref });
  emit(world, {
    t: 'LedgerPosted',
    countdownId,
    item,
    amountCr,
    reputationDelta,
    moneyCr: e.moneyCr,
    reputation: e.reputation,
  });
}

function boosterOf(world: World, cd: Countdown): EntityOf<'booster'> | null {
  const b = getEntity(world, cd.boosterId);
  return b?.kind === 'booster' ? b : null;
}

/** T-clock at the attempt's creation, from the window placement (createCountdown). */
function startTClockTicks(cd: Countdown): number {
  const c = contractDefs[cd.contractId];
  return secondsToTicks(c?.windowOpenTS ?? 0) - (cd.windowOpenTick - cd.createdTick);
}

/** Snapshot of money / reputation / booster at the attempt start (createCountdown calls it). */
export function ensureAttempt(world: World, cd: Countdown): AttemptStart {
  let a = world.economy.attempts[cd.id];
  if (!a) {
    const b = boosterOf(world, cd);
    const l = world.logistics.ledger;
    a = {
      tick: cd.createdTick,
      moneyCr: world.economy.moneyCr,
      reputation: world.economy.reputation,
      boosterWear: b?.wear ?? 0,
      boosterFlights: b?.flights ?? 0,
      tClockTicks: startTClockTicks(cd),
      endTick: null,
      endTClockTicks: null,
      lostKgAtStart: { LOX: l.LOX.detankLostKg, CH4: l.CH4.detankLostKg },
      deliveredKgAtStart: { LOX: l.LOX.deliveredKg, CH4: l.CH4.deliveredKg },
    };
    world.economy.attempts[cd.id] = a;
  }
  return a;
}

// --- Decision log -----------------------------------------------------------------------------------

export function recordDecision(world: World, countdownId: Id | null, kind: string, detail: string, by: DecisionBy) {
  if (countdownId === null) return;
  const cd = world.countdowns[countdownId];
  if (!cd) return;
  (world.decisions[countdownId] ??= []).push({ tick: world.tick, tClockTicks: cd.tClockTicks, kind, detail, by });
}

/** A command about to be applied: its countdown, log detail (captured pre-apply) and source (PLAYER / DIRECTOR). */
export interface PendingDecision {
  countdownId: Id | null;
  kind: Command['t'];
  detail: string;
  by: CommandSource;
}

function countdownOfBooster(world: World, boosterId: Id): Id | null {
  return countdownIds(world).find((k) => world.countdowns[k]?.boosterId === boosterId) ?? null;
}

export function pendingDecision(world: World, cmd: Command): PendingDecision {
  return { ...decisionOf(world, cmd), by: commandSource(cmd) };
}

function decisionOf(world: World, cmd: Command): Omit<PendingDecision, 'by'> {
  switch (cmd.t) {
    case 'StartRollout':
      return { countdownId: countdownOfBooster(world, cmd.boosterId), kind: cmd.t, detail: '' };
    case 'Stack': {
      const id = countdownIds(world).find((k) => world.countdowns[k]?.padId === cmd.padId) ?? null;
      return { countdownId: id, kind: cmd.t, detail: '' };
    }
    case 'OrderDelivery':
      return {
        countdownId: activeCountdownId(world),
        kind: cmd.t,
        detail: `${cmd.fluid} ${cmd.rush ? 'RUSH' : 'STANDARD'}`,
      };
    case 'Go': {
      const cd = world.countdowns[cmd.countdownId];
      const marginal = cd
        ? Object.entries(cd.inputs.stations)
            .filter(([, v]) => v === 'MARGINAL')
            .map(([k]) => k)
        : [];
      const what = cd?.hold?.poll ? `POLL ${cd.hold.poll.toUpperCase()}` : `RELEASE ${cd?.hold?.reason ?? ''}`;
      return {
        countdownId: cmd.countdownId,
        kind: cmd.t,
        detail: [what, ...marginal.map((m) => `MARGINAL ${m}`)].join(', '),
      };
    }
    case 'Hold':
    case 'Recycle':
    case 'Scrub':
      return { countdownId: cmd.countdownId, kind: cmd.t, detail: '' };
    case 'CatchDecision': {
      const b = getEntity(world, cmd.boosterId);
      const p = b?.kind === 'booster' ? (b.recovery?.p ?? 0) : 0;
      return {
        countdownId: countdownOfBooster(world, cmd.boosterId),
        kind: cmd.t,
        detail: `${cmd.choice} P ${p.toFixed(3)}`,
      };
    }
    case 'LeakResponse': {
      const id = countdownIds(world).find((k) => world.anomalies[k]?.leak.active) ?? null;
      return { countdownId: id, kind: cmd.t, detail: cmd.choice };
    }
  }
}

/** Called by applyCommands for every accepted command, tagged with its source (PLAYER / DIRECTOR). */
export function recordCommand(world: World, d: PendingDecision): void {
  recordDecision(world, d.countdownId, d.kind, d.detail, d.by);
}

// --- Postings -----------------------------------------------------------------------------------------

function missContract(world: World, cd: Countdown, penaltyCr: number): void {
  const c = world.contracts[cd.contractId];
  if (c && c.status !== 'ACTIVE') return;
  post(world, cd.id, 'WINDOW_MISSED', -penaltyCr, REP.windowMissed, cd.contractId);
  if (c) {
    c.status = 'WINDOW_MISSED';
    c.closedTick = world.tick;
    emit(world, { t: 'ContractUpdated', contractId: c.id, countdownId: cd.id, status: c.status });
  }
}

function fulfilContract(world: World, cd: Countdown): void {
  const c = world.contracts[cd.contractId];
  if (!c || c.status !== 'ACTIVE') return;
  c.status = 'FULFILLED';
  c.closedTick = world.tick;
  emit(world, { t: 'ContractUpdated', contractId: c.id, countdownId: cd.id, status: c.status });
  post(world, cd.id, 'CONTRACT_PRICE', contractDefs[cd.contractId]?.priceCr ?? 0, REP.success, cd.contractId);
  post(world, cd.id, 'SHIP_EXPENDED', -ec.shipExpendedCostCr, 0, getEntity(world, cd.shipId)?.callSign ?? '');
}

function recoveryOutcome(world: World, cd: Countdown, e: Extract<SimEvent, { t: 'RecoveryOutcome' }>): void {
  const b = boosterOf(world, cd);
  if (!b) return;
  const highWind = (b.recovery?.towerWindMPerS ?? 0) > W.highWindCatchAboveMPerS;
  b.wear = clamp(
    b.wear +
      W.perNominalFlight +
      W.engineOut * b.engines.failed +
      (e.result === 'CAUGHT' && highWind ? W.highWindCatch : 0),
    0,
    1,
  );
  if (e.result === 'CAUGHT') {
    post(world, cd.id, 'BOOSTER_REFURB', -ec.boosterRefurbNominalCr, 0, b.callSign);
    return;
  }
  post(world, cd.id, 'BOOSTER_LOST', -ec.boosterReplacementCostCr, 0, b.callSign);
  if (e.result === 'CATCH_FAILED') {
    const tower = world.prep[cd.id]?.towerId;
    const ref = tower === undefined ? '' : (getEntity(world, tower)?.callSign ?? '');
    post(world, cd.id, 'TOWER_REPAIR', -ec.towerRepairCostCr, REP.towerDamaged, ref);
    post(world, cd.id, 'TOWER_DOWNTIME', -ec.towerRepairDowntimeS * ec.opsCostCrPerS, 0, ref);
  }
}

function detankLost(world: World, cd: Countdown, e: Extract<SimEvent, { t: 'DetankCompleted' }>): void {
  const a = ensureAttempt(world, cd);
  let cost = 0;
  for (const f of ['LOX', 'CH4'] as const satisfies readonly Propellant[]) {
    cost += Math.max(0, e.lostKg[f] - a.lostKgAtStart[f]) * PRICE[f];
  }
  if (cost > 0) post(world, cd.id, 'PROPELLANT_LOST', -cost, 0, '');
}

// --- Debrief ------------------------------------------------------------------------------------------

function outcomeOf(world: World, cd: Countdown): DebriefOutcome {
  if (cd.liftoffTick === null) return 'SCRUBBED';
  const r = boosterOf(world, cd)?.recovery?.result;
  return r === 'CAUGHT' || r === 'CATCH_FAILED' ? r : 'DIVERTED';
}

/** Caught: booster refurb · failed catch: tower repair · scrub: the rebook delay · divert: pad free, booster gone. */
function turnaroundS(cd: Countdown, outcome: DebriefOutcome): number {
  switch (outcome) {
    case 'CAUGHT':
      return ec.boosterRefurbNominalS;
    case 'CATCH_FAILED':
      return ec.towerRepairDowntimeS;
    case 'SCRUBBED':
      return contractDefs[cd.contractId]?.rebookDelayS ?? 0;
    case 'DIVERTED':
      return 0;
  }
}

function buildDebrief(world: World, cd: Countdown): Debrief {
  const a = ensureAttempt(world, cd);
  const b = boosterOf(world, cd);
  const outcome = outcomeOf(world, cd);
  const lines: Debrief['lines'] = [];
  for (const l of world.economy.ledger) {
    if (l.countdownId !== cd.id) continue;
    const line = lines.find((x) => x.item === l.item);
    if (line) {
      line.amountCr += l.amountCr;
      line.reputationDelta += l.reputationDelta;
    } else lines.push({ item: l.item, amountCr: l.amountCr, reputationDelta: l.reputationDelta });
  }
  const endTick = a.endTick ?? world.tick;
  const endT = a.endTClockTicks ?? cd.tClockTicks;
  const holdTicks = Math.max(0, endTick + 1 - a.tick - (endT - a.tClockTicks));
  const l = world.logistics.ledger;
  const towerId = world.prep[cd.id]?.towerId;
  const tower = towerId === undefined ? null : getEntity(world, towerId);
  const r = b?.recovery;
  return {
    countdownId: cd.id,
    flightName: cd.flightName,
    contractId: cd.contractId,
    outcome,
    contractStatus: world.contracts[cd.contractId]?.status ?? 'ACTIVE',
    readyTick: world.tick,
    liftoffTick: cd.liftoffTick,
    holdS: holdTicks * DT_S,
    moneyStartCr: a.moneyCr,
    moneyEndCr: world.economy.moneyCr,
    moneyDeltaCr: world.economy.moneyCr - a.moneyCr,
    reputationStart: a.reputation,
    reputationEnd: world.economy.reputation,
    reputationDelta: world.economy.reputation - a.reputation,
    lines,
    booster: {
      id: cd.boosterId,
      callSign: b?.callSign ?? '',
      state: b?.fsm.state ?? '',
      enginesOut: b?.engines.failed ?? 0,
      wearBefore: a.boosterWear,
      wearAfter: b?.wear ?? a.boosterWear,
      flightsBefore: a.boosterFlights,
      flightsAfter: b?.flights ?? a.boosterFlights,
    },
    towerState: tower?.kind === 'tower' ? tower.fsm.state : '',
    recovery:
      r?.mode && r.result
        ? { mode: r.mode, result: r.result, p: r.p, roll: r.roll, decidedBy: r.decidedBy ?? '' }
        : null,
    propellant: {
      deliveredKg: {
        LOX: l.LOX.deliveredKg - a.deliveredKgAtStart.LOX,
        CH4: l.CH4.deliveredKg - a.deliveredKgAtStart.CH4,
      },
      lostKg: { LOX: l.LOX.detankLostKg - a.lostKgAtStart.LOX, CH4: l.CH4.detankLostKg - a.lostKgAtStart.CH4 },
    },
    anomalies: [...(world.anomalies[cd.id]?.fired ?? [])],
    decisions: [...(world.decisions[cd.id] ?? [])],
    turnaroundS: turnaroundS(cd, outcome),
  };
}

function enterDebrief(world: World, cd: Countdown): void {
  const a = ensureAttempt(world, cd);
  post(world, cd.id, 'OPS_COST', -(world.tick + 1 - a.tick) * DT_S * ec.opsCostCrPerS, 0, cd.flightName);
  if (cd.liftoffTick === null && cd.scrubReason === 'COMMAND') {
    missContract(world, cd, contractDefs[cd.contractId]?.penaltyWindowMissedCr ?? 0);
  }
  const d = buildDebrief(world, cd);
  world.debriefs[cd.id] = d;
  emit(world, { t: 'DebriefReady', countdownId: cd.id, outcome: d.outcome, moneyDeltaCr: d.moneyDeltaCr });
}

// --- System -------------------------------------------------------------------------------------------

function handle(world: World, e: SimEvent): void {
  const cdOf = (id: Id): Countdown | null => world.countdowns[id] ?? null;
  switch (e.t) {
    case 'DeliveryOrdered':
      post(world, activeCountdownId(world), 'HAULAGE_FEE', -e.feeCr, 0, e.orderId);
      return;
    case 'DeliveryCompleted':
      if (e.costCr > 0) post(world, activeCountdownId(world), 'PROPELLANT_PURCHASE', -e.costCr, 0, e.orderId);
      return;
    case 'WindowMissed': {
      const cd = cdOf(e.countdownId);
      if (cd) missContract(world, cd, e.penaltyCr);
      return;
    }
    case 'DetankCompleted': {
      const cd = cdOf(e.countdownId);
      if (cd) detankLost(world, cd, e);
      return;
    }
    case 'FlightEvent': {
      const cd = cdOf(e.countdownId);
      if (!cd) return;
      if (e.kind === 'ship' && e.event === 'SECO') fulfilContract(world, cd);
      if (e.kind === 'booster' && e.event === 'LIFTOFF') {
        const b = boosterOf(world, cd);
        if (b) b.flights += 1;
      }
      return;
    }
    case 'RecoveryOutcome': {
      const cd = cdOf(e.countdownId);
      if (cd) recoveryOutcome(world, cd, e);
      return;
    }
    case 'RecoveryCommitted':
      // A commanded catch call (PLAYER / DIRECTOR) is already logged by recordCommand.
      if (e.by === 'AUTO' || e.by === 'FORCED')
        recordDecision(world, e.countdownId, 'CatchDecision', `${e.mode} P ${e.p.toFixed(3)}`, e.by);
      return;
    case 'LeakResponded':
      if (e.by === 'AUTO') recordDecision(world, e.countdownId, 'LeakResponse', e.choice, 'AUTO');
      return;
    case 'PollPassed':
      if (e.auto) recordDecision(world, e.countdownId, 'Go', `POLL ${e.poll.toUpperCase()}`, 'AUTO');
      return;
    case 'HoldStarted':
      if (e.reason === 'NO_GO' || e.reason === 'LOAD_INCOMPLETE') {
        recordDecision(world, e.countdownId, 'Hold', e.reason, 'AUTO');
      }
      return;
    case 'PhaseChanged': {
      const cd = cdOf(e.countdownId);
      if (!cd) return;
      if (e.to === 'Liftoff' || e.to === 'Scrubbed') {
        const a = ensureAttempt(world, cd);
        a.endTick = e.tick;
        a.endTClockTicks = cd.tClockTicks;
      }
      if (e.to === 'Scrubbed' && e.trigger === 'WindowClosed')
        recordDecision(world, cd.id, 'Scrub', 'WINDOW_CLOSED', 'AUTO');
      if (e.to === 'Debrief') enterDebrief(world, cd);
      return;
    }
    default:
      return;
  }
}

/** Pipeline system (after anomalies): attempts snapshot, then this tick's events in order. */
export function economySystem(world: World): void {
  for (const id of countdownIds(world)) {
    const cd = world.countdowns[id];
    if (cd) ensureAttempt(world, cd);
  }
  const events = eventsThisTick(world);
  for (const e of events) handle(world, e);
}
