// Table-driven finite state machines (ARCHITECTURE §7). A machine is a constant table of guarded
// transitions; the state itself lives in the world as `{ state, enteredTick }`. Every transition
// emits the event built by the definition's `event` function — there is no silent transition.
import type { FsmState } from '../types';
import { emit } from './events';
import type { SimEventInput } from './events';
import type { World } from './world';

export interface FsmContext {
  readonly world: World;
}

export interface FsmTransition<S extends string, T extends string, C extends FsmContext> {
  readonly from: S | readonly S[];
  readonly to: S;
  /** Trigger: a command type, an internal signal, or 'auto' (evaluated every tick). */
  readonly on: T;
  readonly guard?: (ctx: C) => boolean;
  /** Runs after the state change and its event; mutates data / emits further events only. */
  readonly effect?: (ctx: C) => void;
}

export interface FsmDefinition<S extends string, T extends string, C extends FsmContext> {
  readonly name: string;
  readonly states: readonly S[];
  readonly transitions: readonly FsmTransition<S, T, C>[];
  /** Event emitted for every transition. */
  readonly event: (ctx: C, from: S, to: S, on: T) => SimEventInput;
}

export interface Fsm<S extends string, T extends string, C extends FsmContext> extends FsmDefinition<S, T, C> {
  /** First transition from `state` on `on` whose guard passes, or null. */
  find(state: S, on: T, ctx: C): FsmTransition<S, T, C> | null;
  /** True when the table lists any transition from `state` on `on` (guards ignored). Cheap: lets hot callers skip
   * building a context for a trigger that cannot fire. */
  canFire(state: S, on: T): boolean;
  /** Fires the first matching transition: sets state + enteredTick, emits, runs the effect. */
  fire(machine: FsmState<S>, on: T, ctx: C): FsmTransition<S, T, C> | null;
  /** Static table query, guards ignored. */
  hasTransition(from: S, to: S, on?: T): boolean;
  /** Triggers listed for a state, guards ignored, in table order without duplicates. */
  triggersFrom(state: S): T[];
}

function fromList<S extends string>(from: S | readonly S[]): readonly S[] {
  return typeof from === 'string' ? [from as S] : (from as readonly S[]);
}

export function defineFsm<S extends string, T extends string, C extends FsmContext>(
  def: FsmDefinition<S, T, C>,
): Fsm<S, T, C> {
  const known = new Set<string>(def.states);
  for (const tr of def.transitions) {
    for (const s of [...fromList(tr.from), tr.to]) {
      if (!known.has(s)) throw new Error(`defineFsm(${def.name}): unknown state '${s}'`);
    }
  }
  // Index (trigger → from-state → transitions in table order), built once: `find` scans only the candidates, in the
  // same order as a scan of the whole table, without allocating.
  const NONE: readonly FsmTransition<S, T, C>[] = [];
  const index = new Map<T, Map<S, FsmTransition<S, T, C>[]>>();
  for (const tr of def.transitions) {
    let byState = index.get(tr.on);
    if (!byState) index.set(tr.on, (byState = new Map()));
    for (const s of fromList(tr.from)) {
      const list = byState.get(s);
      if (list) {
        if (!list.includes(tr)) list.push(tr);
      } else byState.set(s, [tr]);
    }
  }
  const candidates = (state: S, on: T): readonly FsmTransition<S, T, C>[] => index.get(on)?.get(state) ?? NONE;

  const find = (state: S, on: T, ctx: C): FsmTransition<S, T, C> | null => {
    const list = candidates(state, on);
    for (let i = 0; i < list.length; i++) {
      const tr = list[i] as FsmTransition<S, T, C>;
      if (!tr.guard || tr.guard(ctx)) return tr;
    }
    return null;
  };

  return {
    ...def,
    find,
    canFire(state, on) {
      return candidates(state, on).length > 0;
    },
    fire(machine, on, ctx) {
      const tr = find(machine.state, on, ctx);
      if (!tr) return null;
      const from = machine.state;
      machine.state = tr.to;
      machine.enteredTick = ctx.world.tick;
      emit(ctx.world, def.event(ctx, from, tr.to, on));
      tr.effect?.(ctx);
      return tr;
    },
    hasTransition(from, to, on) {
      return def.transitions.some(
        (tr) => tr.to === to && fromList(tr.from).includes(from) && (on === undefined || tr.on === on),
      );
    },
    triggersFrom(state) {
      const out: T[] = [];
      for (const tr of def.transitions) {
        if (fromList(tr.from).includes(state) && !out.includes(tr.on)) out.push(tr.on);
      }
      return out;
    },
  };
}
