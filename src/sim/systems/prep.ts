// Vehicle preparation (ARCHITECTURE §4 slot 5, GDD §4.2, AC 4–6). Per countdown with a PrepState:
//   rollout: CR-77 lifts B-09 onto SP-41 (craneLoadTaskS) → SP-41 drives `sp.yardToOlm1` loaded →
//            AT_PAD → `inputs.rolloutComplete`
//   stack (player `Stack`): TOWER-1 arms take B-09 onto OLM-1 (stackBoosterS) while SP-41 returns empty,
//            CR-77 lifts S-21 and SP-41 brings it to the pad; then the arms put S-21 on B-09
//            (stackShipS) → `inputs.stackComplete`.
// Wind: a gust above `windLimit.transporterMPerS` stops SP-41 (WIND_HOLD); above `windLimit.stackMPerS` it
// pauses the tower task (WIND_HOLD). Timers are progress counters, so a pause delays the task by exactly
// its length. The countdown clock is not touched (prep continues under holds; wind pauses only the task).
import { lc1Layout, logistics as ld, vehicles } from '@data/index';
import type { CommandOf } from '../core/commands';
import { getEntity } from '../core/entities';
import { secondsToTicks } from '../core/time';
import { countdownIds } from '../core/world';
import type { PrepState, World } from '../core/world';
import { boosterFsm, craneFsm, fire, setArms, shipFsm, towerFsm, transporterFsm } from '../entities/machines';
import { headingToQuat } from '../math/path';
import type { Countdown, EntityOf, Id, Phase, TaskProgress } from '../types';
import { advanceRoute, startRoute } from './motion';

type Stage = EntityOf<'booster'> | EntityOf<'ship'>;
type Tower = EntityOf<'tower'>;
type Transporter = EntityOf<'transporter'>;
type Crane = EntityOf<'crane'>;

const CRANE_TICKS = secondsToTicks(ld.craneLoadTaskS);
const STACK_TICKS = { booster: secondsToTicks(ld.tower.stackBoosterS), ship: secondsToTicks(ld.tower.stackShipS) };
/** Prep works in these phases (not before StartRollout, frozen once scrubbed or flown). */
const PREP_PHASES: readonly Phase[] = ['Rollout', 'Stack', 'PropellantLoad', 'TerminalCount'];
const PAD = lc1Layout.points.olm1;
const ON_PAD_ROT = headingToQuat(Math.PI);

interface Assets {
  cd: Countdown;
  prep: PrepState;
  booster: EntityOf<'booster'>;
  ship: EntityOf<'ship'>;
  tower: Tower;
  sp: Transporter;
  crane: Crane;
  pad: EntityOf<'pad'> | null;
}

function assets(world: World, cd: Countdown): Assets | null {
  const prep = world.prep[cd.id];
  if (!prep) return null;
  const b = getEntity(world, cd.boosterId);
  const s = getEntity(world, cd.shipId);
  const t = getEntity(world, prep.towerId);
  const sp = getEntity(world, prep.transporterId);
  const c = getEntity(world, prep.craneId);
  const pad = getEntity(world, cd.padId);
  if (b?.kind !== 'booster' || s?.kind !== 'ship' || t?.kind !== 'tower' || sp?.kind !== 'transporter') return null;
  if (c?.kind !== 'crane') return null;
  return { cd, prep, booster: b, ship: s, tower: t, sp, crane: c, pad: pad?.kind === 'pad' ? pad : null };
}

function fireStage(world: World, stage: Stage, on: 'craneLoaded' | 'stackStart' | 'stacked'): void {
  if (stage.kind === 'booster') fire(world, boosterFsm, stage, on);
  else fire(world, shipFsm, stage, on);
}

function stageById(a: Assets, id: Id | null): Stage | null {
  if (id === a.booster.id) return a.booster;
  if (id === a.ship.id) return a.ship;
  return null;
}

const newTask = (stageId: Id, durationTicks: number): TaskProgress => ({ stageId, elapsedTicks: 0, durationTicks });

/** Advances a task one tick; true when done. */
function progress(task: TaskProgress): boolean {
  if (task.elapsedTicks < task.durationTicks) task.elapsedTicks++;
  return task.elapsedTicks >= task.durationTicks;
}

// --- Crane + transporter ------------------------------------------------------------------------------

/** Next stage the crane should put on the transporter: the booster first, the ship once the booster is off it. */
function nextStageToRoll(a: Assets): Stage | null {
  if (a.booster.fsm.state === 'IN_YARD') return a.booster;
  if (a.booster.fsm.state !== 'ON_TRANSPORTER' && a.ship.fsm.state === 'IN_YARD') return a.ship;
  return null;
}

function updateCrane(world: World, a: Assets): void {
  const { crane, sp } = a;
  if (crane.fsm.state === 'IDLE') {
    const stage = nextStageToRoll(a);
    if (!stage || sp.fsm.state !== 'IDLE') return;
    fire(world, craneFsm, crane, 'liftStart');
    crane.task = newTask(stage.id, CRANE_TICKS);
    fire(world, transporterFsm, sp, 'loadStart');
    return;
  }
  if (!crane.task || !progress(crane.task)) return;
  const stage = stageById(a, crane.task.stageId);
  fire(world, craneFsm, crane, 'liftDone');
  crane.task = null;
  if (!stage) return;
  fireStage(world, stage, 'craneLoaded');
  sp.cargo = stage.id;
  fire(world, transporterFsm, sp, 'loaded');
  startRoute(sp, 'sp.yardToOlm1', ld.transporter.speedLoadedMPerS);
  carry(sp, stage);
}

function carry(sp: Transporter, stage: Stage | null): void {
  if (!stage) return;
  stage.pos = { ...sp.pos };
  stage.rot = { ...sp.rot };
}

function updateTransporter(world: World, a: Assets): void {
  const { sp } = a;
  const gusty = world.weather.groundGustMPerS > ld.windLimit.transporterMPerS;
  switch (sp.fsm.state) {
    case 'MOVING':
    case 'RETURNING': {
      if (gusty) {
        fire(world, transporterFsm, sp, 'windHigh');
        return;
      }
      const arrived = advanceRoute(sp);
      carry(sp, stageById(a, sp.cargo));
      if (!arrived) return;
      if (sp.fsm.state === 'RETURNING') {
        fire(world, transporterFsm, sp, 'home');
        sp.route = null;
        return;
      }
      fire(world, transporterFsm, sp, 'arrived');
      if (sp.cargo === a.booster.id) a.cd.inputs.rolloutComplete = true;
      return;
    }
    case 'WIND_HOLD':
      if (!gusty) fire(world, transporterFsm, sp, sp.cargo ? 'windOkLoaded' : 'windOkEmpty');
      return;
    default:
      return;
  }
}

// --- Tower --------------------------------------------------------------------------------------------

function startStack(world: World, a: Assets, stage: Stage): void {
  const { tower, sp } = a;
  fire(world, towerFsm, tower, 'stackStart');
  tower.task = newTask(stage.id, STACK_TICKS[stage.kind]);
  setArms(world, tower, 'CLOSED');
  fireStage(world, stage, 'stackStart');
  sp.cargo = null;
  fire(world, transporterFsm, sp, 'unloaded');
  startRoute(sp, 'sp.olm1ToYard', ld.transporter.speedEmptyMPerS);
}

function finishStack(world: World, a: Assets, stage: Stage): void {
  const { tower } = a;
  fire(world, towerFsm, tower, 'stackDone');
  tower.task = null;
  setArms(world, tower, 'OPEN');
  fireStage(world, stage, 'stacked');
  stage.rot = { ...ON_PAD_ROT };
  if (stage.kind === 'booster') {
    stage.pos = { ...PAD };
    if (a.pad) a.pad.boosterId = stage.id;
  } else {
    stage.pos = { x: PAD.x, y: PAD.y + vehicles.booster.heightM, z: PAD.z };
    a.cd.inputs.stackComplete = true;
  }
}

/** Stage waiting on SP-41 at the pad that the arms may take now. */
function stageReadyForArms(a: Assets): Stage | null {
  if (!a.prep.stackRequested || a.sp.fsm.state !== 'AT_PAD') return null;
  const stage = stageById(a, a.sp.cargo);
  if (stage?.kind === 'booster') return stage;
  if (stage?.kind === 'ship' && a.booster.fsm.state !== 'STACKING' && a.booster.fsm.state !== 'ON_TRANSPORTER') {
    return stage;
  }
  return null;
}

function updateTower(world: World, a: Assets): void {
  const { tower } = a;
  const gusty = world.weather.groundGustMPerS > ld.windLimit.stackMPerS;
  if (tower.fsm.state === 'STACKING' && gusty) {
    fire(world, towerFsm, tower, 'windHigh');
    return;
  }
  if (tower.fsm.state === 'WIND_HOLD') {
    if (gusty) return;
    fire(world, towerFsm, tower, 'windOk');
  }
  if (tower.fsm.state === 'STACKING' && tower.task && progress(tower.task)) {
    const stage = stageById(a, tower.task.stageId);
    if (stage) finishStack(world, a, stage);
  }
  if (tower.fsm.state === 'IDLE') {
    const stage = stageReadyForArms(a);
    if (stage) startStack(world, a, stage);
  }
}

// --- Command & system ---------------------------------------------------------------------------------

/** `Stack { padId }`: accepted once the booster is on the pad (rollout complete). */
export function commandStack(world: World, cmd: CommandOf<'Stack'>): string | null {
  const id = countdownIds(world).find((k) => world.countdowns[k]?.padId === cmd.padId);
  const cd = id === undefined ? undefined : world.countdowns[id];
  if (!cd) return 'NO_COUNTDOWN_FOR_PAD';
  const prep = world.prep[cd.id];
  if (!prep) return 'NO_PREP_ASSETS';
  if (cd.phase.state !== 'Rollout' && cd.phase.state !== 'Stack') return 'NOT_IN_STACK_PHASE';
  if (!cd.inputs.rolloutComplete) return 'ROLLOUT_NOT_COMPLETE';
  if (prep.stackRequested) return 'STACK_ALREADY_STARTED';
  prep.stackRequested = true;
  return null;
}

/**
 * Pipeline system (slot 5), per countdown in sorted id order: transporter, then crane, then tower — so a
 * route started this tick (crane done, stack start) first moves next tick and arrival is exactly
 * length / speed after the start.
 */
export function prepSystem(world: World): void {
  for (const id of countdownIds(world)) {
    const cd = world.countdowns[id];
    if (!cd || !PREP_PHASES.includes(cd.phase.state)) continue;
    const a = assets(world, cd);
    if (!a) continue;
    updateTransporter(world, a);
    updateCrane(world, a);
    updateTower(world, a);
  }
}
