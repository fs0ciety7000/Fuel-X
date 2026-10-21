// Path following (ARCHITECTURE §4 slot 6): constant speed along a named site path, integer tick counter so
// arrival is exact (= ceil(length / (speed·DT)) ticks) and independent of step batching.
import type { Lc1PathId } from '@data/index';
import { DT_S as dtS } from '../core/time';
import { headingOf, headingToQuat, pathLengthM, pointInto, setHeadingQuat } from '../math/path';
import type { Leg, Quat, RouteState, Vec3 } from '../types';

// Module-level alias: a local const, not the import binding (a getter per access under Vitest / tsx).
const DT_S = dtS;

// Movers write `pos` / `rot` in place every tick (same values as fresh objects, no garbage). Safe because every
// entity owns its pose objects: `spawnEntity` copies them and the sim never shares one between entities.
interface Mobile {
  pos: Vec3;
  rot: Quat;
  route: RouteState | null;
}

/** Ticks needed to cover `pathId` at `speedMPerS`. */
export function routeTicks(pathId: Lc1PathId, speedMPerS: number): number {
  return Math.ceil(pathLengthM(pathId) / (speedMPerS * DT_S) - 1e-9);
}

function place(e: Mobile, route: RouteState): void {
  const s = Math.min(route.movedTicks * route.speedMPerS * DT_S, pathLengthM(route.pathId));
  setHeadingQuat(e.rot, pointInto(route.pathId, s, e.pos));
}

/** Puts `e` at the start of `pathId`. */
export function startRoute(e: Mobile, pathId: Lc1PathId, speedMPerS: number): void {
  e.route = { pathId, movedTicks: 0, speedMPerS };
  place(e, e.route);
}

/** Puts `e` on `pathId` as if it had already covered `movedTicks` of it (a mid-path start, e.g. a turn-back). */
export function startRouteAt(e: Mobile, pathId: Lc1PathId, speedMPerS: number, movedTicks: number): void {
  e.route = { pathId, movedTicks: Math.max(0, Math.min(movedTicks, routeTicks(pathId, speedMPerS))), speedMPerS };
  place(e, e.route);
}

/** Moves one tick; true once the end of the path is reached (stays there). */
export function advanceRoute(e: Mobile): boolean {
  const r = e.route;
  if (!r) return true;
  const total = routeTicks(r.pathId, r.speedMPerS);
  if (r.movedTicks < total) {
    r.movedTicks++;
    place(e, r);
  }
  return r.movedTicks >= total;
}

// --- Straight legs and patrol loops (3.7 boats) -------------------------------------------------------

interface LegMobile {
  pos: Vec3;
  leg: Leg | null;
}

/** Starts a straight-line leg from the current position to `to` at `speedMPerS`. */
export function startLeg(e: LegMobile & { rot: Quat }, to: Vec3, speedMPerS: number): void {
  const from = { ...e.pos };
  const dist = Math.hypot(to.x - from.x, to.z - from.z);
  e.leg = { from, to: { ...to }, speedMPerS, movedTicks: 0, totalTicks: Math.ceil(dist / (speedMPerS * DT_S) - 1e-9) };
  if (dist > 0) e.rot = headingToQuat(headingOf(to.x - from.x, to.z - from.z));
}

/** Moves one tick along the leg; true once at its end (stays there). */
export function advanceLeg(e: LegMobile): boolean {
  const l = e.leg;
  if (!l) return true;
  if (l.movedTicks < l.totalTicks) l.movedTicks++;
  const f = l.totalTicks > 0 ? l.movedTicks / l.totalTicks : 1;
  const pos = e.pos;
  pos.x = l.from.x + (l.to.x - l.from.x) * f;
  pos.y = l.from.y;
  pos.z = l.from.z + (l.to.z - l.from.z) * f;
  return l.movedTicks >= l.totalTicks;
}

/** One tick around a closed patrol loop (`movedTicks` wraps at one lap). */
export function advancePatrol(e: Mobile): void {
  const r = e.route;
  if (!r) return;
  const lap = routeTicks(r.pathId, r.speedMPerS);
  r.movedTicks = r.movedTicks + 1 >= lap ? 0 : r.movedTicks + 1;
  setHeadingQuat(e.rot, pointInto(r.pathId, r.movedTicks * r.speedMPerS * DT_S, e.pos));
}
