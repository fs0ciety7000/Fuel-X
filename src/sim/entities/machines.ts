// Entity state machines (ARCHITECTURE §7.2). Each class is a constant transition table; systems fire
// triggers, the table decides, and every transition emits `EntityStateChanged`.
import { defineFsm } from '../core/fsm';
import type { Fsm, FsmContext, FsmTransition } from '../core/fsm';
import type { World } from '../core/world';
import { emit } from '../core/events';
import type {
  ArmsState,
  BoatState,
  BoosterState,
  CraneState,
  FsmState,
  Id,
  Kind,
  ShipState,
  TankerState,
  TowerState,
  TransporterState,
  VanState,
} from '../types';

interface StatefulEntity<S extends string> {
  id: Id;
  kind: Kind;
  fsm: FsmState<S>;
}

export interface EntityCtx<S extends string> extends FsmContext {
  readonly e: StatefulEntity<S>;
}

export type EntityFsm<S extends string, T extends string> = Fsm<S, T, EntityCtx<S>>;

function entityFsm<S extends string, T extends string>(
  name: string,
  states: readonly S[],
  transitions: readonly FsmTransition<S, T, EntityCtx<S>>[],
): EntityFsm<S, T> {
  return defineFsm<S, T, EntityCtx<S>>({
    name,
    states,
    transitions,
    event: (c, from, to) => ({ t: 'EntityStateChanged', id: c.e.id, kind: c.e.kind, from, to }),
  });
}

/** Fires `on` for `e`; true when a transition happened. */
export function fire<S extends string, T extends string>(
  world: World,
  fsm: EntityFsm<S, T>,
  e: StatefulEntity<S>,
  on: T,
): boolean {
  return fsm.fire(e.fsm, on, { world, e }) !== null;
}

// --- Booster / ship -------------------------------------------------------------------------------

export const BOOSTER_STATES: readonly BoosterState[] = [
  'IN_YARD',
  'ON_TRANSPORTER',
  'STACKING',
  'STACKED',
  'LOADING',
  'LOADED',
  'DETANKING',
  'ASCENT',
  'BOOSTBACK',
  'DESCENT',
  'DIVERTED',
  'CAUGHT_SAFING',
  'LOST',
];

export type StageTrigger =
  | 'craneLoaded'
  | 'stackStart'
  | 'stacked'
  | 'loadStart'
  | 'loadFull'
  | 'scrub'
  | 'detanked'
  | 'liftoff'
  | 'boostbackStart'
  | 'boostbackEnd'
  | 'divert'
  | 'caught'
  | 'lost';

/** Ground part shared by booster and ship: prep (3.5) and propellant (3.4). */
function groundTransitions<S extends BoosterState | ShipState>(): FsmTransition<S, StageTrigger, EntityCtx<S>>[] {
  const t = (from: string | string[], to: string, on: StageTrigger): FsmTransition<S, StageTrigger, EntityCtx<S>> => ({
    from: from as S | S[],
    to: to as S,
    on,
  });
  return [
    t('IN_YARD', 'ON_TRANSPORTER', 'craneLoaded'),
    t('ON_TRANSPORTER', 'STACKING', 'stackStart'),
    t('STACKING', 'STACKED', 'stacked'),
    t('STACKED', 'LOADING', 'loadStart'),
    t('LOADING', 'LOADED', 'loadFull'),
    t(['LOADING', 'LOADED'], 'DETANKING', 'scrub'),
    t('DETANKING', 'STACKED', 'detanked'),
  ];
}

export const boosterFsm = entityFsm<BoosterState, StageTrigger>('booster', BOOSTER_STATES, [
  ...groundTransitions<BoosterState>(),
  { from: 'LOADED', to: 'ASCENT', on: 'liftoff' },
  { from: 'ASCENT', to: 'BOOSTBACK', on: 'boostbackStart' },
  { from: 'BOOSTBACK', to: 'DESCENT', on: 'boostbackEnd' },
  { from: ['BOOSTBACK', 'DESCENT'], to: 'DIVERTED', on: 'divert' },
  { from: 'DESCENT', to: 'CAUGHT_SAFING', on: 'caught' },
  { from: ['ASCENT', 'BOOSTBACK', 'DESCENT', 'DIVERTED'], to: 'LOST', on: 'lost' },
]);

export const SHIP_STATES: readonly ShipState[] = [
  'IN_YARD',
  'ON_TRANSPORTER',
  'STACKING',
  'STACKED',
  'LOADING',
  'LOADED',
  'DETANKING',
  'ASCENT',
  'SEPARATED',
  'SECO',
  'OFF_SCENE',
  'LOST',
];

export type ShipTrigger = StageTrigger | 'separation' | 'seco' | 'leave';

export const shipFsm = entityFsm<ShipState, ShipTrigger>('ship', SHIP_STATES, [
  ...(groundTransitions<ShipState>() as FsmTransition<ShipState, ShipTrigger, EntityCtx<ShipState>>[]),
  { from: 'LOADED', to: 'ASCENT', on: 'liftoff' },
  { from: 'ASCENT', to: 'SEPARATED', on: 'separation' },
  { from: 'SEPARATED', to: 'SECO', on: 'seco' },
  { from: 'SECO', to: 'OFF_SCENE', on: 'leave' },
  { from: ['ASCENT', 'SEPARATED'], to: 'LOST', on: 'lost' },
]);

// --- Tanker ---------------------------------------------------------------------------------------

export const TANKER_STATES: readonly TankerState[] = ['OFFMAP', 'INBOUND', 'GATE_WAIT', 'OFFLOADING', 'OUTBOUND'];
export type TankerTrigger = 'depart' | 'gateClosed' | 'gateOpen' | 'atBay' | 'offloadEnd' | 'offMap';

export const tankerFsm = entityFsm<TankerState, TankerTrigger>('tanker', TANKER_STATES, [
  { from: 'OFFMAP', to: 'INBOUND', on: 'depart' },
  { from: 'INBOUND', to: 'GATE_WAIT', on: 'gateClosed' },
  { from: 'GATE_WAIT', to: 'INBOUND', on: 'gateOpen' },
  { from: 'INBOUND', to: 'OFFLOADING', on: 'atBay' },
  { from: 'OFFLOADING', to: 'OUTBOUND', on: 'offloadEnd' },
  { from: 'OUTBOUND', to: 'OFFMAP', on: 'offMap' },
]);

// --- Prep assets (3.5) and tower catch (3.6) --------------------------------------------------------

export const TOWER_STATES: readonly TowerState[] = [
  'IDLE',
  'STACKING',
  'WIND_HOLD',
  'CATCH_READY',
  'CATCHING',
  'DAMAGED',
];
export type TowerTrigger =
  'stackStart' | 'windHigh' | 'windOk' | 'stackDone' | 'catchArmed' | 'catchStart' | 'caught' | 'catchFailed';

export const towerFsm = entityFsm<TowerState, TowerTrigger>('tower', TOWER_STATES, [
  { from: 'IDLE', to: 'STACKING', on: 'stackStart' },
  { from: 'STACKING', to: 'WIND_HOLD', on: 'windHigh' },
  { from: 'WIND_HOLD', to: 'STACKING', on: 'windOk' },
  { from: 'STACKING', to: 'IDLE', on: 'stackDone' },
  { from: 'IDLE', to: 'CATCH_READY', on: 'catchArmed' },
  { from: 'CATCH_READY', to: 'CATCHING', on: 'catchStart' },
  { from: 'CATCHING', to: 'IDLE', on: 'caught' },
  { from: 'CATCHING', to: 'DAMAGED', on: 'catchFailed' },
]);

/** Tower arms OPEN ⇄ CLOSED; emits `ArmsChanged` on a change. */
export function setArms(world: World, tower: { id: Id; arms: ArmsState }, to: ArmsState): void {
  if (tower.arms === to) return;
  const from = tower.arms;
  tower.arms = to;
  emit(world, { t: 'ArmsChanged', id: tower.id, from, to });
}

export const TRANSPORTER_STATES: readonly TransporterState[] = [
  'IDLE',
  'LOADING',
  'MOVING',
  'WIND_HOLD',
  'AT_PAD',
  'RETURNING',
];
/** `depart` / `turnBack`: ambient duty only (SP-42, 7.3) — leave the yard empty, turn back mid-leg before road closure. */
export type TransporterTrigger =
  | 'loadStart'
  | 'loaded'
  | 'windHigh'
  | 'windOkLoaded'
  | 'windOkEmpty'
  | 'arrived'
  | 'unloaded'
  | 'home'
  | 'depart'
  | 'turnBack';

export const transporterFsm = entityFsm<TransporterState, TransporterTrigger>('transporter', TRANSPORTER_STATES, [
  { from: 'IDLE', to: 'LOADING', on: 'loadStart' },
  { from: 'LOADING', to: 'MOVING', on: 'loaded' },
  { from: ['MOVING', 'RETURNING'], to: 'WIND_HOLD', on: 'windHigh' },
  { from: 'WIND_HOLD', to: 'MOVING', on: 'windOkLoaded' },
  { from: 'WIND_HOLD', to: 'RETURNING', on: 'windOkEmpty' },
  { from: 'MOVING', to: 'AT_PAD', on: 'arrived' },
  { from: 'AT_PAD', to: 'RETURNING', on: 'unloaded' },
  { from: 'RETURNING', to: 'IDLE', on: 'home' },
  { from: 'IDLE', to: 'MOVING', on: 'depart' },
  { from: 'MOVING', to: 'RETURNING', on: 'turnBack' },
]);

export const CRANE_STATES: readonly CraneState[] = ['IDLE', 'LIFTING'];
export type CraneTrigger = 'liftStart' | 'liftDone';

export const craneFsm = entityFsm<CraneState, CraneTrigger>('crane', CRANE_STATES, [
  { from: 'IDLE', to: 'LIFTING', on: 'liftStart' },
  { from: 'LIFTING', to: 'IDLE', on: 'liftDone' },
]);

// --- Range boats and crew vans (3.7) ----------------------------------------------------------------

export const BOAT_STATES: readonly BoatState[] = [
  'DOCKED',
  'PATROL',
  'INTERCEPT',
  'ESCORT',
  'RETURNING',
  'ON_STATION',
  'IN_AREA',
  'INTERCEPTED',
  'LEAVING',
];
export type BoatTrigger = 'undock' | 'dispatch' | 'intercepted' | 'escortDone' | 'onLoop' | 'leave';

/** One table for the three boat roles (states are disjoint per role). */
export const boatFsm = entityFsm<BoatState, BoatTrigger>('boat', BOAT_STATES, [
  // PICKET PK-
  { from: 'DOCKED', to: 'PATROL', on: 'undock' },
  { from: 'PATROL', to: 'INTERCEPT', on: 'dispatch' },
  { from: 'INTERCEPT', to: 'ESCORT', on: 'intercepted' },
  { from: 'ESCORT', to: 'RETURNING', on: 'escortDone' },
  { from: 'RETURNING', to: 'PATROL', on: 'onLoop' },
  // Intruder UNK-
  { from: 'IN_AREA', to: 'INTERCEPTED', on: 'intercepted' },
  { from: 'INTERCEPTED', to: 'LEAVING', on: 'leave' },
]);

export const VAN_STATES: readonly VanState[] = ['PARKED', 'TO_PAD', 'AT_PAD', 'TO_SAFE'];
export type VanTrigger = 'toSafe' | 'toPad' | 'arrived';

export const vanFsm = entityFsm<VanState, VanTrigger>('van', VAN_STATES, [
  { from: 'AT_PAD', to: 'TO_SAFE', on: 'toSafe' },
  { from: 'TO_SAFE', to: 'PARKED', on: 'arrived' },
  { from: 'PARKED', to: 'TO_PAD', on: 'toPad' },
  { from: 'TO_PAD', to: 'AT_PAD', on: 'arrived' },
]);
