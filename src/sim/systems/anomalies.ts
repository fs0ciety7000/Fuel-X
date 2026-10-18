// Anomalies A1–A4 and the director (ARCHITECTURE §4 slot 9, GDD §7, BALANCING §8, AC 3, 14).
//
// Natural rolls (rng 'anomaly'), per countdown:
//   A1 range fouled   rate × DT each tick while T ∈ [T-02:00:00, T-0) before liftoff → UNK-01 + picket intercept
//   A2 upper-wind     a front (environment) that arrives during PropellantLoad / TerminalCount before T-0
//   A3 GSE leak       one roll when the load starts; onset at a booster-LOX load fraction; load ×0.5, VEHICLE
//                     MARGINAL, decision LEAK (DEGRADED / HOLD_FIX 20 min); the QD is disconnected at liftoff
//   A4 engine-out     per-engine rolls at ascent start (33) and boostback start (13), × wear reliability factor,
//                     × marginalRiskMultiplier when a matching MARGINAL station was GO'd (AC 14)
// Director (rng 'director', `guaranteeOne`): at the first tick it draws one anomaly by the configured weights
// and its trigger point inside the anomaly's window, before the T-00:30:00 deadline (A4: during flight). It is
// not cancelled by natural anomalies. Fallback: no anomaly at the deadline and the plan can no longer happen →
// schedule an eligible one now (weights renormalised; A3 only while the load is unfinished).
import { ANOMALY_IDS, anomalies as an, propellant as pd, vehicles } from '@data/index';
import type { AnomalyId } from '@data/index';
import type { CommandOf } from '../core/commands';
import { entitiesOfKind, getEntity } from '../core/entities';
import { emit } from '../core/events';
import { rng } from '../core/rng';
import type { Rng } from '../core/rng';
import { DT_S, secondsToTicks } from '../core/time';
import { countdownIds } from '../core/world';
import type { AnomalySource, AnomalyState, DirectorPlan, World } from '../core/world';
import { T_BOOSTBACK_END, T_BOOSTBACK_START } from '../math/profile';
import type { Countdown, EntityOf, Id, Phase } from '../types';
import { holdForLeakFix, isPreLiftoff } from './countdown';
import { startFrontNow } from './environment';
import { engineOut } from './flight';
import { foulRange } from './range';

const A1_START = secondsToTicks(an.A1.windowStartTS);
const A1_END = secondsToTicks(an.A1.windowEndTS);
const DEADLINE = secondsToTicks(an.director.deadlineTS);
const CLOSE_LEAD = secondsToTicks(an.director.windowCloseLeadS);
const FIX_TICKS = secondsToTicks(an.A3.fixDurationS);
const LOAD_PHASES: readonly Phase[] = ['PropellantLoad', 'TerminalCount'];

type Booster = EntityOf<'booster'>;

export function newAnomalyState(): AnomalyState {
  return {
    fired: [],
    director: { plan: null, fallbackUsed: false },
    intruderId: null,
    frontCounted: false,
    leakRolled: false,
    leakOnsetFraction: null,
    leakOnsetSource: null,
    leak: { active: false, response: null, fixEndTick: null },
    ascentRolled: false,
    boostbackRolled: false,
    pendingEngineOuts: [],
  };
}

// --- Probabilities ------------------------------------------------------------------------------------

/** 1 + reliabilityPerWear × wear (BALANCING §1): multiplies booster failure probabilities. */
export function reliabilityFactor(wear: number): number {
  return 1 + vehicles.wear.reliabilityPerWear * wear;
}

/** marginalRiskMultiplier when a station mapped to `anomaly` was GO'd while MARGINAL (AC 14), else 1. */
export function marginalMultiplier(cd: Countdown, anomaly: AnomalyId): number {
  const hit = cd.goWithMarginal.some((s) => (an.marginalCategories[s] as readonly AnomalyId[]).includes(anomaly));
  return hit ? an.marginalRiskMultiplier : 1;
}

/** Per-engine A4 probability for a flight phase. */
export function engineOutProbability(cd: Countdown, booster: Booster, phase: 'ASCENT' | 'BOOSTBACK'): number {
  const base = phase === 'ASCENT' ? an.A4.perEngineAscent : an.A4.perEngineBoostback;
  return Math.min(1, base * reliabilityFactor(booster.wear) * marginalMultiplier(cd, 'A4'));
}

/** Number of engines out among `engines`, each failing with probability `p` (one draw per engine). */
export function rollEngineOuts(r: Rng, engines: number, p: number): number {
  let n = 0;
  for (let i = 0; i < engines; i++) if (r.chance(p)) n++;
  return n;
}

// --- Firing -------------------------------------------------------------------------------------------

function fired(st: AnomalyState, anomaly: AnomalyId): boolean {
  return st.fired.some((f) => f.anomaly === anomaly);
}

function record(
  world: World,
  cd: Countdown,
  st: AnomalyState,
  anomaly: AnomalyId,
  source: AnomalySource,
  entityId: Id,
) {
  st.fired.push({ anomaly, tick: world.tick, source, entityId });
  if (source === 'DIRECTOR' && st.director.plan?.anomaly === anomaly) st.director.plan.done = true;
  emit(world, { t: 'AnomalyFired', countdownId: cd.id, anomaly, entityId, source });
}

function firstOfKind(world: World, kind: 'wxStation'): Id {
  return entitiesOfKind(world, kind)[0]?.id ?? '';
}

function fireA1(world: World, cd: Countdown, st: AnomalyState, source: AnomalySource, r: Rng): boolean {
  if (st.intruderId !== null) return false;
  const id = foulRange(world, r);
  if (id === null) return false;
  st.intruderId = id;
  record(world, cd, st, 'A1', source, id);
  return true;
}

function fireA2(world: World, cd: Countdown, st: AnomalyState, source: AnomalySource): void {
  st.frontCounted = true;
  record(world, cd, st, 'A2', source, firstOfKind(world, 'wxStation'));
}

function startLeak(world: World, cd: Countdown, st: AnomalyState): void {
  st.leak = { active: true, response: null, fixEndTick: null };
  world.logistics.loadRateFactor = pd.degradedLoadFactor;
  record(world, cd, st, 'A3', st.leakOnsetSource ?? 'NATURAL', cd.padId);
  emit(world, {
    t: 'DecisionRequired',
    countdownId: cd.id,
    decision: 'LEAK',
    poll: null,
    deadlineTick: cd.windowCloseTick,
  });
}

function clearLeak(world: World, cd: Countdown, st: AnomalyState, by: 'FIXED' | 'LIFTOFF'): void {
  st.leak = { active: false, response: st.leak.response, fixEndTick: null };
  world.logistics.loadRateFactor = 1;
  cd.inputs.leakFixActive = false;
  emit(world, { t: 'LeakCleared', countdownId: cd.id, by });
}

// --- Director -----------------------------------------------------------------------------------------

const ticksIn = (r: Rng, loS: number, hiS: number): number => secondsToTicks(r.range(loS, hiS));

function planFor(anomaly: AnomalyId, r: Rng, nowTClockTicks: number | null): DirectorPlan {
  const plan: DirectorPlan = { anomaly, atTClockTicks: null, atLoadFraction: null, atMissionTicks: null, done: false };
  switch (anomaly) {
    case 'A1':
      plan.atTClockTicks = nowTClockTicks ?? ticksIn(r, an.A1.windowStartTS, an.director.deadlineTS);
      break;
    case 'A2':
      plan.atTClockTicks = nowTClockTicks ?? ticksIn(r, an.director.a2EarliestTS, an.director.deadlineTS);
      break;
    case 'A3':
      plan.atLoadFraction = r.range(an.A3.onsetLoadFractionMin, an.A3.onsetLoadFractionMax);
      break;
    case 'A4':
      plan.atMissionTicks = r.chance(an.A4.directorAscentShare)
        ? ticksIn(r, an.A4.ascentWindowS[0], an.A4.ascentWindowS[1])
        : ticksIn(r, T_BOOSTBACK_START, T_BOOSTBACK_END);
      break;
  }
  return plan;
}

function drawPlan(world: World, eligible: readonly AnomalyId[], nowTClockTicks: number | null): DirectorPlan {
  const r = rng(world, 'director');
  const kind = eligible[r.weightedIndex(eligible.map((a) => an.director.weights[a]))] as AnomalyId;
  return planFor(kind, r, nowTClockTicks);
}

function loadUnfinished(cd: Countdown): boolean {
  return !cd.inputs.loadComplete && (cd.phase.state === 'PropellantLoad' || cd.phase.state === 'Stack');
}

/** T-0 can still happen inside the window (the T-clock needs −tClock more ticks). */
const t0Reachable = (world: World, cd: Countdown): boolean => -cd.tClockTicks <= cd.windowCloseTick - world.tick;

/** The director's plan can still happen (or already did). */
function planAlive(world: World, cd: Countdown, st: AnomalyState): boolean {
  const plan = st.director.plan;
  if (!plan || plan.done) return !!plan;
  if (plan.anomaly === 'A4') return t0Reachable(world, cd);
  if (plan.anomaly === 'A3') return loadUnfinished(cd) && t0Reachable(world, cd);
  return (
    plan.atTClockTicks !== null &&
    plan.atTClockTicks > cd.tClockTicks &&
    plan.atTClockTicks - cd.tClockTicks <= cd.windowCloseTick - world.tick
  );
}

/**
 * Fallback: nothing fired by the T-00:30:00 deadline — or `windowCloseLeadS` before the window closes, for a
 * count frozen at a poll — and the plan can no longer happen → schedule an eligible anomaly now.
 */
function directorFallback(world: World, cd: Countdown, st: AnomalyState): void {
  if (!an.director.guaranteeOne || st.director.fallbackUsed || st.fired.length > 0) return;
  if (!isPreLiftoff(cd.phase.state)) return;
  const late = world.tick >= cd.windowCloseTick - CLOSE_LEAD;
  if ((cd.tClockTicks < DEADLINE && !late) || planAlive(world, cd, st)) return;
  const eligible = ANOMALY_IDS.filter((a) => {
    if (a === 'A1') return st.intruderId === null;
    if (a === 'A2') return LOAD_PHASES.includes(cd.phase.state);
    if (a === 'A3') return loadUnfinished(cd) && st.leakOnsetFraction === null;
    return cd.pollsPassed.includes('load') && t0Reachable(world, cd);
  });
  if (eligible.length === 0) return;
  st.director.fallbackUsed = true;
  st.director.plan = drawPlan(world, eligible, cd.tClockTicks);
  if (st.director.plan.anomaly === 'A3') {
    st.leakOnsetFraction = 0;
    st.leakOnsetSource = 'DIRECTOR';
  }
}

// --- Per phase ----------------------------------------------------------------------------------------

function boosterOf(world: World, cd: Countdown): Booster | null {
  const b = getEntity(world, cd.boosterId);
  return b?.kind === 'booster' ? b : null;
}

function preLiftoff(world: World, cd: Countdown, st: AnomalyState): void {
  const r = rng(world, 'anomaly');
  const t = cd.tClockTicks;
  const plan = st.director.plan;
  // A1
  if (st.intruderId === null && t >= A1_START && t < A1_END && r.chance(an.A1.ratePerS * DT_S)) {
    fireA1(world, cd, st, 'NATURAL', r);
  }
  if (plan?.anomaly === 'A1' && !plan.done && plan.atTClockTicks !== null && t >= plan.atTClockTicks) {
    if (!fireA1(world, cd, st, 'DIRECTOR', r) && st.intruderId !== null) plan.done = true;
  }
  // A2: natural front arriving during load → T-0, or the director's front.
  const inLoad = LOAD_PHASES.includes(cd.phase.state) && t < 0;
  const front = world.weather.front;
  if (inLoad && !st.frontCounted && front && front.arrivalTick === world.tick) fireA2(world, cd, st, 'NATURAL');
  if (plan?.anomaly === 'A2' && !plan.done && inLoad && plan.atTClockTicks !== null && t >= plan.atTClockTicks) {
    if (fired(st, 'A2')) plan.done = true;
    else {
      startFrontNow(world);
      fireA2(world, cd, st, 'DIRECTOR');
    }
  }
  // A3
  const b = boosterOf(world, cd);
  if (b && b.fsm.state === 'LOADING') {
    if (!st.leakRolled) {
      st.leakRolled = true;
      if (r.chance(an.A3.probabilityPerLoad)) {
        st.leakOnsetFraction = r.range(an.A3.onsetLoadFractionMin, an.A3.onsetLoadFractionMax);
        st.leakOnsetSource = 'NATURAL';
      } else if (plan?.anomaly === 'A3' && plan.atLoadFraction !== null) {
        st.leakOnsetFraction = plan.atLoadFraction;
        st.leakOnsetSource = 'DIRECTOR';
      }
    }
    const frac = b.prop.loxKg / b.prop.loxCapKg;
    if (st.leakOnsetFraction !== null && !fired(st, 'A3') && frac >= st.leakOnsetFraction) startLeak(world, cd, st);
  }
  if (
    st.leak.active &&
    st.leak.response === 'HOLD_FIX' &&
    st.leak.fixEndTick !== null &&
    world.tick >= st.leak.fixEndTick
  ) {
    clearLeak(world, cd, st, 'FIXED');
  }
  if (plan?.anomaly === 'A3' && !plan.done && fired(st, 'A3')) plan.done = true;
  directorFallback(world, cd, st);
}

function inFlight(world: World, cd: Countdown, st: AnomalyState): void {
  if (st.leak.active) clearLeak(world, cd, st, 'LIFTOFF');
  const b = boosterOf(world, cd);
  if (!b?.flight || b.flight.done || cd.liftoffTick === null) return;
  const r = rng(world, 'anomaly');
  const plan = st.director.plan;
  const directorA4 = plan?.anomaly === 'A4' && !plan.done && plan.atMissionTicks !== null ? plan.atMissionTicks : null;
  const ascentEnd = secondsToTicks(T_BOOSTBACK_START);
  if (b.fsm.state === 'ASCENT' && !st.ascentRolled) {
    st.ascentRolled = true;
    const n = rollEngineOuts(r, vehicles.booster.engines, engineOutProbability(cd, b, 'ASCENT'));
    for (let i = 0; i < n; i++) {
      st.pendingEngineOuts.push({
        missionTicks: ticksIn(r, an.A4.ascentWindowS[0], an.A4.ascentWindowS[1]),
        source: 'NATURAL',
      });
    }
    if (directorA4 !== null && directorA4 < ascentEnd)
      st.pendingEngineOuts.push({ missionTicks: directorA4, source: 'DIRECTOR' });
  }
  if (b.fsm.state === 'BOOSTBACK' && !st.boostbackRolled) {
    st.boostbackRolled = true;
    const n = rollEngineOuts(r, vehicles.booster.boostbackEngines, engineOutProbability(cd, b, 'BOOSTBACK'));
    for (let i = 0; i < n; i++) {
      st.pendingEngineOuts.push({ missionTicks: ticksIn(r, T_BOOSTBACK_START, T_BOOSTBACK_END), source: 'NATURAL' });
    }
    if (directorA4 !== null && directorA4 >= ascentEnd)
      st.pendingEngineOuts.push({ missionTicks: directorA4, source: 'DIRECTOR' });
  }
  const mission = world.tick - cd.liftoffTick;
  const due = st.pendingEngineOuts.filter((p) => p.missionTicks <= mission);
  if (due.length === 0) return;
  st.pendingEngineOuts = st.pendingEngineOuts.filter((p) => p.missionTicks > mission);
  for (const p of due) if (engineOut(world, b.id, 1)) record(world, cd, st, 'A4', p.source, b.id);
}

// --- Command & system ---------------------------------------------------------------------------------

/**
 * `LeakResponse { choice }` for the countdown with an active A3 leak: DEGRADED keeps loading at the degraded
 * rate; HOLD_FIX pauses the load for `fixDurationS` under a LEAK_FIX hold, then full rate (hold released).
 */
export function commandLeakResponse(world: World, cmd: CommandOf<'LeakResponse'>): string | null {
  const id = countdownIds(world).find((k) => world.anomalies[k]?.leak.active);
  const cd = id === undefined ? undefined : world.countdowns[id];
  const st = id === undefined ? undefined : world.anomalies[id];
  if (!cd || !st) return 'NO_ACTIVE_LEAK';
  if (st.leak.response === 'HOLD_FIX') return 'ALREADY_FIXING';
  if (st.leak.response === cmd.choice) return 'ALREADY_RESPONDED';
  st.leak.response = cmd.choice;
  if (cmd.choice === 'HOLD_FIX') {
    st.leak.fixEndTick = world.tick + FIX_TICKS;
    world.logistics.loadRateFactor = 0;
    cd.inputs.leakFixActive = true;
    if (cd.clock.state === 'Counting') holdForLeakFix(world, cd);
  }
  emit(world, { t: 'LeakResponded', countdownId: cd.id, choice: cmd.choice });
  return null;
}

/** Pipeline system (slot 9, after flight): director plan, natural rolls, leak timers, engine-outs. */
export function anomaliesSystem(world: World): void {
  if (!world.config.anomalies) return;
  for (const id of countdownIds(world)) {
    const cd = world.countdowns[id];
    if (!cd || cd.phase.state === 'Debrief' || cd.phase.state === 'Scrubbed') continue;
    let st = world.anomalies[id];
    if (!st) {
      st = newAnomalyState();
      world.anomalies[id] = st;
      if (an.director.guaranteeOne) st.director.plan = drawPlan(world, ANOMALY_IDS, null);
    }
    if (isPreLiftoff(cd.phase.state)) preLiftoff(world, cd, st);
    else inFlight(world, cd, st);
  }
}

/** For the HUD/debrief: anomaly ids fired in an attempt, in order. */
export function anomaliesFired(world: World, countdownId: Id): AnomalyId[] {
  return (world.anomalies[countdownId]?.fired ?? []).map((f) => f.anomaly);
}
