// Path following (ARCHITECTURE §4 slot 6): constant speed along a named site path, integer tick counter so
// arrival is exact (= ceil(length / (speed·DT)) ticks) and independent of step batching.
import type { Lc1PathId } from '@data/index';
import { DT_S } from '../core/time';
import { headingToQuat, pathLengthM, pointAt } from '../math/path';
import type { Quat, RouteState, Vec3 } from '../types';

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
  const p = pointAt(route.pathId, Math.min(route.movedTicks * route.speedMPerS * DT_S, pathLengthM(route.pathId)));
  e.pos = p.pos;
  e.rot = headingToQuat(p.headingRad);
}

/** Puts `e` at the start of `pathId`. */
export function startRoute(e: Mobile, pathId: Lc1PathId, speedMPerS: number): void {
  e.route = { pathId, movedTicks: 0, speedMPerS };
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
