// Entity state machines (ARCHITECTURE §7.2). Each class is a constant transition table; systems fire
// triggers, the table decides, and every transition emits `EntityStateChanged`.
import { defineFsm } from '../core/fsm';
import type { Fsm, FsmContext, FsmTransition } from '../core/fsm';
import type { World } from '../core/world';
import type { BoosterState, FsmState, Id, Kind, ShipState, TankerState } from '../types';

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
  { from: 'DESCENT', to: 'DIVERTED', on: 'divert' },
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
