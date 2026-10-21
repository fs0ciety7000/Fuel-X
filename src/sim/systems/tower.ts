// Tower mechanisms (5.0, ARCHITECTURE §4 slot 8b, §7.5). Carriage, catch arms and ship QD arm move toward their
// targets at the rates in src/data/tower.ts, so render can drive `TOWER_Carriage` / `TOWER_ArmL/R` / `TOWER_QDArm`
// straight from sim state. Targets come from prep (stacking heights), flight (catch height) and the ship state
// (QD engaged while a ship is stacked on the tower's pad, retracted at liftoff).
//
// Interlock (ASSETS_GUIDE TOWER as-built): the QD arm at 100 m sits in the carriage path, so
//   - while the QD arm is not STOWED the carriage stops on the keep-out band edge (92 / 106 m) instead of entering;
//   - the QD arm does not leave STOWED while the carriage is inside the band.
// QD runs before the carriage in a tick, so the invariant "QD not stowed ⇒ carriage outside the band" holds at
// every tick boundary.
import { tower as towerData } from '@data/index';
import { entitiesOfKind, getEntity } from '../core/entities';
import { emit } from '../core/events';
import { DT_S } from '../core/time';
import { countdownIds } from '../core/world';
import type { World } from '../core/world';
import { clampCarriageM, inQdKeepOut } from '../math/tower';
import type { EntityOf, QdArmState, ShipState, TowerInterlock } from '../types';

// Module-level aliases: hot paths read a local const, not the import binding (a getter per access under
// Vitest / tsx, which re-export `@data/index` through `export *`). Same objects; data is never reassigned.
const td = towerData;

type Tower = EntityOf<'tower'>;

const CARRIAGE_STEP_M = td.carriage.speedMPerS * DT_S;
const ARM_STEP_RAD = td.arms.rateRadPerS * DT_S;
const QD_STEP_RAD = td.qdArm.rateRadPerS * DT_S;
const QD_ENGAGED_RAD = td.qdArm.engagedRad;
const LO = td.qdArm.keepOutLoM;
const HI = td.qdArm.keepOutHiM;
/** Ship states with the ship on the booster and the QD plate in reach. */
const QD_SHIP_STATES: readonly ShipState[] = ['STACKED', 'LOADING', 'LOADED', 'DETANKING'];

/** Moves `from` toward `to` by at most `stepAbs`; lands exactly on `to`. */
function approach(from: number, to: number, stepAbs: number): number {
  const d = to - from;
  if (Math.abs(d) <= stepAbs) return to;
  return from + Math.sign(d) * stepAbs;
}

/** Sets where the carriage goes (clamped to its travel); emits `CarriageTargetSet` on a change. */
export function setCarriageTarget(world: World, t: Tower, toM: number): void {
  const to = clampCarriageM(toM);
  if (t.carriageTargetM === to) return;
  emit(world, { t: 'CarriageTargetSet', id: t.id, fromM: t.carriageM, toM: to });
  t.carriageTargetM = to;
}

/** True when a ship of a countdown served by this tower is stacked with its QD plate in reach. */
function qdWanted(world: World, t: Tower): boolean {
  for (const id of countdownIds(world)) {
    const cd = world.countdowns[id];
    if (!cd || world.prep[id]?.towerId !== t.id) continue;
    const s = getEntity(world, cd.shipId);
    if (s?.kind === 'ship' && QD_SHIP_STATES.includes(s.fsm.state)) return true;
  }
  return false;
}

function setQd(world: World, t: Tower, to: QdArmState): void {
  if (t.qd === to) return;
  emit(world, { t: 'QdArmChanged', id: t.id, from: t.qd, to });
  t.qd = to;
}

/** QD arm FSM: STOWED → ENGAGING → ENGAGED → RETRACTING → STOWED. True when it waits on the carriage. */
function updateQd(world: World, t: Tower): boolean {
  const want = qdWanted(world, t);
  let held = false;
  switch (t.qd) {
    case 'STOWED':
      if (want) {
        if (inQdKeepOut(t.carriageM)) held = true;
        else setQd(world, t, 'ENGAGING');
      }
      break;
    case 'ENGAGING':
    case 'ENGAGED':
      if (!want) setQd(world, t, 'RETRACTING');
      break;
    case 'RETRACTING':
      if (want) setQd(world, t, 'ENGAGING');
      break;
  }
  if (t.qd === 'ENGAGING') {
    t.qdArmRad = approach(t.qdArmRad, QD_ENGAGED_RAD, QD_STEP_RAD);
    if (t.qdArmRad === QD_ENGAGED_RAD) setQd(world, t, 'ENGAGED');
  } else if (t.qd === 'RETRACTING') {
    t.qdArmRad = approach(t.qdArmRad, 0, QD_STEP_RAD);
    if (t.qdArmRad === 0) setQd(world, t, 'STOWED');
  }
  return held;
}

/** Carriage toward its target, stopped on the band edge while the QD arm is out. True when held. */
function updateCarriage(world: World, t: Tower): boolean {
  const from = t.carriageM;
  if (from === t.carriageTargetM) return false;
  let next = approach(from, t.carriageTargetM, CARRIAGE_STEP_M);
  let held = false;
  if (t.qd !== 'STOWED' && !inQdKeepOut(from)) {
    if (from <= LO && next > LO) {
      next = LO;
      held = next !== t.carriageTargetM;
    } else if (from >= HI && next < HI) {
      next = HI;
      held = next !== t.carriageTargetM;
    }
  }
  t.carriageM = next;
  if (next === t.carriageTargetM) emit(world, { t: 'CarriageArrived', id: t.id, atM: next });
  return held;
}

function updateArms(t: Tower): void {
  const open = t.arms === 'OPEN';
  t.armLRad = approach(t.armLRad, open ? td.arms.openRad : 0, ARM_STEP_RAD);
  t.armRRad = approach(t.armRRad, open ? -td.arms.openRad : 0, ARM_STEP_RAD);
}

function setInterlock(world: World, t: Tower, to: TowerInterlock): void {
  if (t.interlock === to) return;
  emit(world, { t: 'TowerInterlockChanged', id: t.id, from: t.interlock, to, carriageM: t.carriageM });
  t.interlock = to;
}

/** Slot 8b: after prep (stacking targets) and flight (catch target, liftoff), every tower in entity order. */
export function towerSystem(world: World): void {
  for (const t of entitiesOfKind(world, 'tower')) {
    const qdHeld = updateQd(world, t);
    const carriageHeld = updateCarriage(world, t);
    updateArms(t);
    setInterlock(world, t, carriageHeld ? 'CARRIAGE_HELD' : qdHeld ? 'QD_HELD' : 'NONE');
  }
}
