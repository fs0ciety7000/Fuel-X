// Propellant (ARCHITECTURE §4 slot 7, GDD §4.3–4.4, AC 9, 12, 15): farm boil-off, vehicle load and
// topping, scrub detank. Every transfer moves the same number of kg out of one store and into another;
// the only sinks are boil-off and the detank loss, both booked in `world.logistics.ledger`.
import { countdown as cdData, propellant as pd } from '@data/index';
import type { Propellant } from '@data/index';
import { emit } from '../core/events';
import { getEntity } from '../core/entities';
import { DT_S, secondsToTicks } from '../core/time';
import { countdownIds } from '../core/world';
import type { World } from '../core/world';
import { boosterFsm, fire, shipFsm } from '../entities/machines';
import type { Countdown, EntityOf, Fluid, PropTanks } from '../types';
import { isPreLiftoff } from './countdown';

export const PROPELLANTS: readonly Propellant[] = ['LOX', 'CH4'];
const LOAD_START_TICKS = secondsToTicks(cdData.loadStartTS);
const HEEL = pd.farm.heelFraction;

type Stage = EntityOf<'booster'> | EntityOf<'ship'>;

// --- Farm -------------------------------------------------------------------------------------------

type Tank = EntityOf<'tank'>;

function tankAt(world: World, id: string): Tank | null {
  const e = world.entities.byId[id];
  return e?.kind === 'tank' ? e : null;
}

const usable = (t: Tank): number => Math.max(0, t.massKg - HEEL * t.capKg);
const free = (t: Tank): number => Math.max(0, t.capKg - t.massKg);
const mass = (t: Tank): number => t.massKg;

/** Σ f(tank) over the farm tanks of a fluid (allocation-free: runs several times per tick). */
function sumFarm(world: World, fluid: Fluid, f: (t: Tank) => number): number {
  let sum = 0;
  for (const id of world.logistics.farm[fluid]) {
    const t = tankAt(world, id);
    if (t) sum += f(t);
  }
  return sum;
}

export function farmMassKg(world: World, fluid: Fluid): number {
  return sumFarm(world, fluid, mass);
}

/** Farm mass above the heel of every tank, kg. */
export function farmUsableKg(world: World, fluid: Fluid): number {
  return sumFarm(world, fluid, usable);
}

export function farmFreeKg(world: World, fluid: Fluid): number {
  return sumFarm(world, fluid, free);
}

/** Moves up to `kg` between the farm and the caller, tank by tank (most available first). */
function transfer(world: World, fluid: Fluid, kg: number, avail: (t: Tank) => number, sign: 1 | -1): number {
  const ids = world.logistics.farm[fluid];
  let left = kg;
  while (left > 0) {
    let best: Tank | null = null;
    let bestAvail = 0;
    for (const id of ids) {
      const t = tankAt(world, id);
      const a = t ? avail(t) : 0;
      if (t && a > 0 && (!best || a > bestAvail)) {
        best = t;
        bestAvail = a;
      }
    }
    if (!best) break;
    const take = Math.min(left, bestAvail);
    best.massKg += sign * take;
    left = take === left ? 0 : left - take;
  }
  return kg - left;
}

/** Takes up to `kg` of usable propellant from the farm; returns the mass actually drawn. */
export function drawFromFarm(world: World, fluid: Propellant, kg: number): number {
  return transfer(world, fluid, kg, usable, -1);
}

/** Puts up to `kg` into the farm (tank with most free space first); returns the mass accepted. */
export function addToFarm(world: World, fluid: Propellant, kg: number): number {
  return transfer(world, fluid, kg, free, 1);
}

function farmBoilOff(world: World): void {
  for (const fluid of PROPELLANTS) {
    const f = pd.farm.boilOffFractionPerS[fluid] * DT_S;
    const ledger = world.logistics.ledger[fluid];
    for (const id of world.logistics.farm[fluid]) {
      const t = tankAt(world, id);
      if (!t) continue;
      const loss = t.massKg * f;
      t.massKg -= loss;
      t.boiledOffKg += loss;
      ledger.farmBoilOffKg += loss;
    }
  }
}

// --- Vehicle lines ----------------------------------------------------------------------------------

const MASS_KEY = { LOX: 'loxKg', CH4: 'ch4Kg' } as const satisfies Record<Propellant, keyof PropTanks>;
const CAP_KEY = { LOX: 'loxCapKg', CH4: 'ch4CapKg' } as const satisfies Record<Propellant, keyof PropTanks>;

export function stageFull(prop: PropTanks): boolean {
  return prop.loxKg >= prop.loxCapKg && prop.ch4Kg >= prop.ch4CapKg;
}

const stageEmpty = (prop: PropTanks): boolean => prop.loxKg <= 0 && prop.ch4Kg <= 0;

function rateKgPerS(stage: Stage, fluid: Propellant): number {
  return pd.loadRateKgPerS[stage.kind][fluid];
}

function vehicleBoilOff(world: World, stage: Stage): void {
  for (const fluid of PROPELLANTS) {
    const key = MASS_KEY[fluid];
    const loss = stage.prop[key] * pd.vehicleBoilOffFractionPerS[fluid] * DT_S;
    stage.prop[key] -= loss;
    world.logistics.ledger[fluid].vehicleBoilOffKg += loss;
  }
}

/** Load / topping: fills each line toward its capacity at the line rate, from the farm. */
function fillStage(world: World, stage: Stage): void {
  for (const fluid of PROPELLANTS) {
    const key = MASS_KEY[fluid];
    const room = stage.prop[CAP_KEY[fluid]] - stage.prop[key];
    if (room <= 0) continue;
    const want = Math.min(rateKgPerS(stage, fluid) * world.logistics.loadRateFactor * DT_S, room);
    const got = drawFromFarm(world, fluid, want);
    stage.prop[key] = got === room ? stage.prop[CAP_KEY[fluid]] : stage.prop[key] + got;
    world.logistics.ledger[fluid].farmToVehicleKg += got;
  }
}

/** Detank one tick at the line rates: the configured loss fraction is vented, the rest returns to the farm. */
function drainStage(world: World, stage: Stage): void {
  for (const fluid of PROPELLANTS) {
    const key = MASS_KEY[fluid];
    const m = stage.prop[key];
    if (m <= 0) continue;
    const d = Math.min(rateKgPerS(stage, fluid) * DT_S, m);
    stage.prop[key] = d === m ? 0 : m - d;
    const returned = addToFarm(world, fluid, d * (1 - pd.scrubDetankLossFraction));
    const ledger = world.logistics.ledger[fluid];
    ledger.detankReturnedKg += returned;
    ledger.detankLostKg += d - returned;
  }
}

function fireStage(world: World, stage: Stage, on: 'loadStart' | 'loadFull' | 'scrub' | 'detanked'): void {
  if (stage.kind === 'booster') fire(world, boosterFsm, stage, on);
  else fire(world, shipFsm, stage, on);
}

const ON_PAD_FOR_LOAD: readonly string[] = ['STACKED', 'LOADING', 'LOADED'];

function load(world: World, cd: Countdown, stages: readonly Stage[]): void {
  const active =
    (cd.phase.state === 'PropellantLoad' || cd.phase.state === 'TerminalCount') && cd.tClockTicks >= LOAD_START_TICKS;
  if (active) {
    for (const stage of stages) {
      if (!ON_PAD_FOR_LOAD.includes(stage.fsm.state)) continue;
      fireStage(world, stage, 'loadStart');
      fillStage(world, stage);
      if (stageFull(stage.prop)) fireStage(world, stage, 'loadFull');
    }
  }
  cd.inputs.loadComplete = stages.every((s) => stageFull(s.prop));
}

function detank(world: World, cd: Countdown, stages: readonly Stage[]): void {
  for (const stage of stages) {
    fireStage(world, stage, 'scrub');
    drainStage(world, stage);
  }
  if (!stages.every((s) => stageEmpty(s.prop))) return;
  for (const stage of stages) fireStage(world, stage, 'detanked');
  cd.inputs.detankComplete = true;
  const l = world.logistics.ledger;
  emit(world, {
    t: 'DetankCompleted',
    countdownId: cd.id,
    returnedKg: { LOX: l.LOX.detankReturnedKg, CH4: l.CH4.detankReturnedKg },
    lostKg: { LOX: l.LOX.detankLostKg, CH4: l.CH4.detankLostKg },
  });
}

function stagesOf(world: World, cd: Countdown): Stage[] | null {
  const b = getEntity(world, cd.boosterId);
  const s = getEntity(world, cd.shipId);
  return b?.kind === 'booster' && s?.kind === 'ship' ? [b, s] : null;
}

function updateCountdown(world: World, cd: Countdown): void {
  const phase = cd.phase.state;
  const scrubbing = phase === 'Scrubbed' && !cd.inputs.detankComplete;
  if (!isPreLiftoff(phase) && !scrubbing) return;
  const stages = stagesOf(world, cd);
  if (!stages) return; // countdown without spawned vehicles (unit tests drive its inputs directly)
  for (const stage of stages) vehicleBoilOff(world, stage);
  if (scrubbing) detank(world, cd, stages);
  else load(world, cd, stages);
}

/** Pipeline system: farm boil-off first, then each countdown's vehicles (sorted countdown ids). */
export function propellantSystem(world: World): void {
  farmBoilOff(world);
  for (const id of countdownIds(world)) {
    const cd = world.countdowns[id];
    if (cd) updateCountdown(world, cd);
  }
}

/** Farm draw needed per second to top both stages of a countdown (PROPELLANT station input, 3.7), kg/s. */
export function toppingDemandKgPerS(world: World, cd: Countdown, fluid: Propellant): number {
  const stages = stagesOf(world, cd) ?? [];
  return stages.reduce((s, st) => s + st.prop[MASS_KEY[fluid]] * pd.vehicleBoilOffFractionPerS[fluid], 0);
}
