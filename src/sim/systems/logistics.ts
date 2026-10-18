// Logistics (ARCHITECTURE §4 slot 6, GDD §4.3, AC 7–8): road closure, tanker orders and the tanker
// cycle OFFMAP → INBOUND → (GATE_WAIT) → OFFLOADING → OUTBOUND → OFFMAP.
//
// Lead time = order → arrival at the road gate. The truck waits off-map, then drives the
// `tanker.offMapToGate` leg so that it reaches the gate at the ordered time. At the gate it waits
// (GATE_WAIT) while the road into the pad hazard radius is closed (T-00:40:00 → end of Safing), else
// drives on to its offload bay. A truck already past the gate when the road closes does not offload:
// it leaves with what is left (no tanker works inside the hazard radius during closure).
import { callSignPrefix, economy, lc1Layout, logistics as ld } from '@data/index';
import type { Lc1PathId, Propellant } from '@data/index';
import type { CommandOf } from '../core/commands';
import { despawnEntity, spawnEntity } from '../core/entities';
import { emit } from '../core/events';
import { DT_S, secondsToTicks } from '../core/time';
import { countdownIds } from '../core/world';
import type { World } from '../core/world';
import { fire, tankerFsm } from '../entities/machines';
import { tankerCapKg } from '../entities/site';
import { headingToQuat, pointAt } from '../math/path';
import type { EntityOf, Id, Phase } from '../types';
import { isPreLiftoff } from './countdown';
import { advanceRoute, routeTicks, startRoute } from './motion';
import { addToFarm } from './propellant';

type Tanker = EntityOf<'tanker'>;

const ROAD_CLOSURE_TICKS = secondsToTicks(ld.roadClosureStartTS);
/** After liftoff the road stays closed until Safing ends. */
const CLOSED_AFTER_LIFTOFF: readonly Phase[] = ['Liftoff', 'Boostback', 'TowerCatch', 'Divert', 'Safing'];
const SPEED = ld.tanker.speedOnSiteMPerS;
const LEG_TO_GATE: Lc1PathId = 'tanker.offMapToGate';
const LEG_TO_BAY: Record<Propellant, Lc1PathId> = { LOX: 'tanker.gateToLoxBay', CH4: 'tanker.gateToCh4Bay' };
const LEG_OUT: Record<Propellant, Lc1PathId> = { LOX: 'tanker.loxBayToOffMap', CH4: 'tanker.ch4BayToOffMap' };
const PREFIX: Record<Propellant, string> = { LOX: callSignPrefix.loxTanker, CH4: callSignPrefix.ch4Tanker };

// --- Road closure -----------------------------------------------------------------------------------

/** Closed while any LC-1 countdown is at or past T-00:40:00 and not yet out of Safing. */
export function roadShouldBeClosed(world: World): boolean {
  for (const id of countdownIds(world)) {
    const cd = world.countdowns[id];
    if (!cd || cd.siteId !== lc1Layout.siteId) continue;
    if (CLOSED_AFTER_LIFTOFF.includes(cd.phase.state)) return true;
    if (isPreLiftoff(cd.phase.state) && cd.tClockTicks >= ROAD_CLOSURE_TICKS) return true;
  }
  return false;
}

function updateRoad(world: World): void {
  const closed = roadShouldBeClosed(world);
  if (closed === world.logistics.roadClosed) return;
  world.logistics.roadClosed = closed;
  emit(world, { t: 'RoadClosureChanged', siteId: lc1Layout.siteId, closed });
}

// --- Orders -----------------------------------------------------------------------------------------

function freeFleetTanker(world: World, fluid: Propellant): Tanker | null {
  for (const id of world.entities.order) {
    const e = world.entities.byId[id];
    if (e?.kind === 'tanker' && e.fluid === fluid && !e.chartered && e.order === null && e.fsm.state === 'OFFMAP') {
      return e;
    }
  }
  return null;
}

function spawnCharter(world: World, fluid: Propellant): Tanker {
  const serial = world.logistics.charterSerial[fluid]++;
  const start = pointAt(LEG_TO_GATE, 0);
  return spawnEntity(world, {
    kind: 'tanker',
    callSign: `${PREFIX[fluid]}${String(serial).padStart(2, '0')}`,
    siteId: lc1Layout.siteId,
    pos: start.pos,
    rot: headingToQuat(start.headingRad),
    asset: 'tanker',
    fluid,
    fsm: { state: 'OFFMAP', enteredTick: world.tick },
    capKg: tankerCapKg(fluid),
    cargoKg: 0,
    chartered: true,
    order: null,
    route: null,
  });
}

/**
 * `OrderDelivery`: standard orders use a free fleet truck (`NO_TANKER_AVAILABLE` otherwise); rush orders
 * charter an extra truck. Emits `DeliveryOrdered` with the haulage fee (the propellant price is charged
 * on `DeliveryCompleted` for the mass actually delivered).
 */
export function commandOrderDelivery(world: World, cmd: CommandOf<'OrderDelivery'>): string | null {
  const tanker = cmd.rush ? spawnCharter(world, cmd.fluid) : freeFleetTanker(world, cmd.fluid);
  if (!tanker) return 'NO_TANKER_AVAILABLE';
  const terms = cmd.rush ? ld.delivery.rush : ld.delivery.standard;
  const gateEtaTick = world.tick + secondsToTicks(terms.leadTimeS);
  const id = `DO-${String(world.logistics.nextOrderSerial++).padStart(3, '0')}`;
  tanker.order = {
    id,
    rush: cmd.rush,
    placedTick: world.tick,
    departTick: Math.max(world.tick, gateEtaTick - routeTicks(LEG_TO_GATE, SPEED)),
    gateEtaTick,
    deliveredKg: 0,
  };
  tanker.cargoKg = tanker.capKg;
  emit(world, {
    t: 'DeliveryOrdered',
    orderId: id,
    tankerId: tanker.id,
    callSign: tanker.callSign,
    fluid: tanker.fluid,
    rush: cmd.rush,
    cargoKg: tanker.cargoKg,
    feeCr: terms.feeCrPerTruck,
    gateEtaTick,
  });
  return null;
}

// --- Tanker cycle -----------------------------------------------------------------------------------

function finishOffload(world: World, t: Tanker, aborted: boolean): void {
  fire(world, tankerFsm, t, 'offloadEnd');
  startRoute(t, LEG_OUT[t.fluid], SPEED);
  const deliveredKg = t.order?.deliveredKg ?? 0;
  emit(world, {
    t: 'DeliveryCompleted',
    orderId: t.order?.id ?? '',
    tankerId: t.id,
    fluid: t.fluid,
    deliveredKg,
    costCr: deliveredKg * economy.priceCrPerKg[t.fluid],
    aborted,
  });
}

function offload(world: World, t: Tanker): void {
  if (world.logistics.roadClosed) {
    finishOffload(world, t, true);
    return;
  }
  const amount = Math.min(ld.tanker.offloadRateKgPerS * DT_S, t.cargoKg);
  const accepted = addToFarm(world, t.fluid, amount);
  t.cargoKg = accepted === t.cargoKg ? 0 : t.cargoKg - accepted;
  if (t.order) t.order.deliveredKg += accepted;
  world.logistics.ledger[t.fluid].deliveredKg += accepted;
  if (t.cargoKg <= 0) finishOffload(world, t, false);
  else if (accepted < amount) finishOffload(world, t, true); // farm full
}

/** One tick of a tanker; returns true when a chartered truck has left and must be despawned. */
function updateTanker(world: World, t: Tanker): boolean {
  switch (t.fsm.state) {
    case 'OFFMAP':
      if (t.order && world.tick >= t.order.departTick) {
        fire(world, tankerFsm, t, 'depart');
        startRoute(t, LEG_TO_GATE, SPEED);
      }
      return false;
    case 'INBOUND':
      if (!advanceRoute(t)) return false;
      if (t.route?.pathId === LEG_TO_GATE) {
        if (world.logistics.roadClosed) fire(world, tankerFsm, t, 'gateClosed');
        else startRoute(t, LEG_TO_BAY[t.fluid], SPEED);
      } else {
        fire(world, tankerFsm, t, 'atBay');
      }
      return false;
    case 'GATE_WAIT':
      if (!world.logistics.roadClosed) {
        fire(world, tankerFsm, t, 'gateOpen');
        startRoute(t, LEG_TO_BAY[t.fluid], SPEED);
      }
      return false;
    case 'OFFLOADING':
      offload(world, t);
      return false;
    case 'OUTBOUND':
      if (!advanceRoute(t)) return false;
      fire(world, tankerFsm, t, 'offMap');
      t.order = null;
      t.route = null;
      t.cargoKg = 0;
      return t.chartered;
  }
}

/** Pipeline system: road closure first, then every tanker in entity order. */
export function logisticsSystem(world: World): void {
  updateRoad(world);
  let gone: Id[] | null = null;
  for (const id of world.entities.order) {
    const e = world.entities.byId[id];
    if (e?.kind === 'tanker' && updateTanker(world, e)) (gone ??= []).push(id);
  }
  if (gone) for (const id of gone) despawnEntity(world, id);
}
