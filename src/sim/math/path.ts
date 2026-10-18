// Polyline paths from the site layout (src/data/site-lc1.ts) and compass-heading helpers. Pure functions;
// site frame is Y-up, X east, Z south, heading 0 = north = −Z (ARCHITECTURE §6).
import { lc1Layout } from '@data/index';
import type { Lc1PathId, SitePath, V3 } from '@data/index';
import type { Quat, Vec3 } from '../types';

function vertices(p: SitePath): readonly V3[] {
  const first = p.points[0];
  return p.closed && first ? [...p.points, first] : p.points;
}

function segmentLength(a: V3, b: V3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

interface PathTable {
  readonly verts: readonly V3[];
  /** Cumulative length at each vertex, m. */
  readonly cum: readonly number[];
  readonly lengthM: number;
  readonly closed: boolean;
}

function buildTable(p: SitePath): PathTable {
  const verts = vertices(p);
  const cum = [0];
  for (let i = 1; i < verts.length; i++) {
    cum.push((cum[i - 1] ?? 0) + segmentLength(verts[i - 1] as V3, verts[i] as V3));
  }
  return { verts, cum, lengthM: cum[cum.length - 1] ?? 0, closed: p.closed };
}

const TABLES = Object.fromEntries(Object.entries(lc1Layout.paths).map(([id, p]) => [id, buildTable(p)])) as Record<
  Lc1PathId,
  PathTable
>;

export function pathLengthM(id: Lc1PathId): number {
  return TABLES[id].lengthM;
}

/** Compass heading of a horizontal direction (dx east, dz south), rad in [0, 2π). */
export function headingOf(dx: number, dz: number): number {
  const h = Math.atan2(dx, -dz);
  return h < 0 ? h + 2 * Math.PI : h;
}

/** Rotation about +Y that turns an asset facing +Z (heading π) to face `headingRad`. */
export function headingToQuat(headingRad: number): Quat {
  const half = (Math.PI - headingRad) / 2;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

export interface PathPoint {
  pos: Vec3;
  headingRad: number;
}

/** Point at distance `sM` along the path (clamped for open paths, wrapped for loops). */
export function pointAt(id: Lc1PathId, sM: number): PathPoint {
  const t = TABLES[id];
  let s = t.closed && t.lengthM > 0 ? ((sM % t.lengthM) + t.lengthM) % t.lengthM : Math.min(Math.max(sM, 0), t.lengthM);
  let i = 1;
  while (i < t.verts.length - 1 && (t.cum[i] ?? 0) < s) i++;
  const a = t.verts[i - 1] as V3;
  const b = t.verts[i] as V3;
  const segLen = (t.cum[i] ?? 0) - (t.cum[i - 1] ?? 0);
  s -= t.cum[i - 1] ?? 0;
  const f = segLen > 0 ? Math.min(s / segLen, 1) : 0;
  return {
    pos: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f },
    headingRad: headingOf(b.x - a.x, b.z - a.z),
  };
}
