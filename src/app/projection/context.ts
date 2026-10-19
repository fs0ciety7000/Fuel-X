// Shared inputs of the projection sub-projectors.
import type { EventVM, UiProjection } from '@bridge/projection-types';
import type { ViewState } from '@bridge/stores';
import { DT_S, isPreLiftoff } from '@sim/index';
import type { Countdown, Entity, Id, Kind, World } from '@sim/types';
import type { DropCode, SkipBlockCode, SkipTarget } from '../time/rules';
import type { TimeScale } from '../time/time-control';
import type { SparkKey } from './spark';

/**
 * Sim UTC at tick 0, s since 00:00 (scenario start T-06:00:00 = 07:15:00 UTC, planned T-0 13:15:00 UTC).
 * Display-only; moves to src/data/time.ts when the designer fixes a scenario date (open question, 6.1).
 */
export const UTC_AT_TICK0_S = 7 * 3_600 + 15 * 60;

/** Time-control state the projector reads (app-owned, not sim state). */
export interface TimeInputs {
  requested: Exclude<TimeScale, 0>;
  paused: boolean;
  effective: TimeScale;
  maxAllowed: TimeScale;
  lagging: boolean;
  /** Measured sim s per wall s. */
  effectiveRate: number;
  /** Skip in progress → its target; null otherwise (7.2). */
  skipping?: SkipTarget | null;
  /** SKIP blocked now (null = available or already skipping). Absent = computed from the world. */
  skipBlocker?: SkipBlockCode | null;
  /** Last drop to 1× (GDD §6). */
  drop?: { code: DropCode; tick: number } | null;
}

export interface SparkSource {
  values(key: SparkKey): readonly (number | null)[];
}

export interface ProjectEnv {
  countdown: Readonly<Countdown> | null;
  time: TimeInputs;
  spark: SparkSource;
  /** Newest-first event rows (EventLog). */
  events: readonly EventVM[];
  seq: number;
  utcAtTick0S?: number;
  /** Render-side visibility (snapshot flags); entities it hides get no label. */
  hidden?: (id: Id) => boolean;
}

export interface Ctx {
  world: Readonly<World>;
  cd: Readonly<Countdown> | null;
  view: Readonly<ViewState>;
  env: ProjectEnv;
  prev: UiProjection | null;
  tick: number;
  /** Sim UTC seconds now. */
  utcS: number;
  utc0: number;
  preLiftoff: boolean;
}

export function makeCtx(
  world: Readonly<World>,
  prev: UiProjection | null,
  view: Readonly<ViewState>,
  env: ProjectEnv,
): Ctx {
  const utc0 = env.utcAtTick0S ?? UTC_AT_TICK0_S;
  const cd = env.countdown;
  return {
    world,
    cd,
    view,
    env,
    prev,
    tick: world.tick,
    utcS: utc0 + world.tick * DT_S,
    utc0,
    preLiftoff: cd ? isPreLiftoff(cd.phase.state) : false,
  };
}

export function entity(c: Ctx, id: Id | null | undefined): Entity | null {
  return id ? (c.world.entities.byId[id] ?? null) : null;
}

export function* entitiesOf<K extends Kind>(c: Ctx, kind: K): Generator<Extract<Entity, { kind: K }>> {
  for (const id of c.world.entities.order) {
    const e = c.world.entities.byId[id];
    if (e?.kind === kind) yield e as Extract<Entity, { kind: K }>;
  }
}

/** T-clock (ticks) at absolute tick `t` if the clock counts from now on (for deadlines / markers). */
export function tClockAt(c: Ctx, t: number): number {
  return c.cd ? c.cd.tClockTicks + (t - c.tick) : 0;
}
