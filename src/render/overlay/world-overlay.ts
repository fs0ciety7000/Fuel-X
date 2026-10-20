// Pure maths behind the world overlay (6.6): label declutter, altitude-scale steps, compass headings and the
// display strings the render loop writes into the world-HUD DOM. No DOM, no three scene access: unit-tested in Node.
import { ALTITUDE_TICKS } from '../dom-contract';

/** ARCHITECTURE §13.1: ≤ 64 DOM labels positioned per frame (declutter beyond). */
export const MAX_LABELS = 64;

/** Label render modes written to `data-mode`. */
export type LabelMode = 'tag' | 'anchor' | 'hidden';

/** One label candidate for this frame (preallocated, reused across frames). */
export interface LabelSlot {
  id: string;
  /** Declutter rank (LabelVM.priority: selected 5 > alert 4 > followed 3 > flying 2 > rest 1 > tanks/vans 0). */
  priority: number;
  /** Tag size, CSS px (measured when the layer mutates). */
  w: number;
  h: number;
  /** Anchor in viewport px; `visible` false when behind the camera, off-screen, beyond range or not drawn. */
  x: number;
  y: number;
  dist: number;
  visible: boolean;
  mode: LabelMode;
}

export function createLabelSlot(id: string): LabelSlot {
  return { id, priority: 1, w: 0, h: 0, x: 0, y: 0, dist: 0, visible: false, mode: 'hidden' };
}

/** Axis-aligned rectangle in viewport px (HUD card occluders). */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Label range by priority, m from the camera: followed / selected / alert always; tanks and vans close only. */
export function labelRangeM(priority: number): number {
  if (priority >= 3) return Number.POSITIVE_INFINITY;
  if (priority === 2) return 80_000;
  if (priority === 1) return 12_000;
  return 3_500;
}

/** Order: priority high first, then nearer first, then id (stable across frames). */
export function compareLabels(a: LabelSlot, b: LabelSlot): number {
  return b.priority - a.priority || a.dist - b.dist || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

const overlaps = (al: number, at: number, ar: number, ab: number, b: Rect): boolean =>
  al < b.right && ar > b.left && at < b.bottom && ab > b.top;

/**
 * Greedy declutter (DESIGN_SYSTEM §6.20): in priority order, a tag is placed above its anchor (`leaderPx` gap) unless
 * it overlaps an already placed tag — then it collapses to the anchor square; a tag (or anchor) under a HUD card is
 * hidden; at most `max` labels are positioned, the rest hidden. `sorted` must already be ordered by
 * {@link compareLabels}. `placed` is scratch storage (reused). Writes `mode` on every slot; returns positioned count.
 */
export function declutter(
  sorted: readonly LabelSlot[],
  occluders: readonly Rect[],
  leaderPx: number,
  placed: Rect[],
  max: number = MAX_LABELS,
): number {
  let n = 0;
  let tags = 0;
  for (const s of sorted) {
    if (!s.visible || n >= max) {
      s.mode = 'hidden';
      continue;
    }
    const l = s.x - s.w / 2;
    const r = s.x + s.w / 2;
    const b = s.y - leaderPx;
    const t = b - s.h;
    let under = false;
    for (const o of occluders) {
      if (overlaps(l, t, r, s.y + 2, o)) {
        under = true;
        break;
      }
    }
    if (under) {
      s.mode = 'hidden';
      continue;
    }
    let clash = false;
    for (let i = 0; i < tags; i++) {
      const p = placed[i];
      if (p && overlaps(l, t, r, b, p)) {
        clash = true;
        break;
      }
    }
    n++;
    if (clash) {
      s.mode = 'anchor';
      continue;
    }
    s.mode = 'tag';
    let p = placed[tags];
    if (!p) {
      p = { left: 0, top: 0, right: 0, bottom: 0 };
      placed[tags] = p;
    }
    p.left = l;
    p.top = t;
    p.right = r;
    p.bottom = b;
    tags++;
  }
  return n;
}

// --- altitude scale ----------------------------------------------------------------------------------------------

/** Scale class of the followed entity (DESIGN_SYSTEM §6.21); `null` = ground-bound, the scale is hidden. */
export type AltitudeClass = 'stage' | 'vessel' | null;

export function altitudeClassOf(asset: string): AltitudeClass {
  if (asset === 'booster' || asset === 'ship') return 'stage';
  if (asset === 'boat_range' || asset === 'vessel_recovery') return 'vessel';
  return null;
}

/** Stepped full-scale values, m (hard cut between them). Vessel 0–200 M; stages 0–2 KM … 0–600 KM (60 KM = §6.21). */
export const ALTITUDE_STEPS_M: Record<'stage' | 'vessel', readonly number[]> = {
  vessel: [200],
  stage: [2_000, 10_000, 60_000, 200_000, 600_000],
};
/** Step back down only below this share of the smaller scale (no flicker at a boundary). */
const ALTITUDE_DOWN_HYSTERESIS = 0.85;

/** Full scale for `altitudeM`, keeping `currentMaxM` while inside the hysteresis band. */
export function altitudeScaleM(cls: 'stage' | 'vessel', altitudeM: number, currentMaxM = 0): number {
  const steps = ALTITUDE_STEPS_M[cls];
  let pick = steps[steps.length - 1] ?? 1;
  for (const s of steps) {
    if (altitudeM <= s) {
      pick = s;
      break;
    }
  }
  if (currentMaxM > pick && steps.includes(currentMaxM) && altitudeM > pick * ALTITUDE_DOWN_HYSTERESIS) {
    return currentMaxM;
  }
  return pick;
}

const trimNum = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** Tick numerals bottom → top for a full scale (`ALTITUDE_TICKS` labels; km from 2 km, two-digit zero). */
export function altitudeTickLabels(maxM: number, ticks: number = ALTITUDE_TICKS): string[] {
  const km = maxM >= 2_000;
  const out: string[] = [];
  for (let i = 0; i < ticks; i++) {
    const v = (maxM * i) / (ticks - 1) / (km ? 1000 : 1);
    out.push(v === 0 ? '00' : trimNum(Math.round(v * 10) / 10));
  }
  return out;
}

/** Exact readout: `600 M` below 1 km, `8.3 KM` above (display only; the sim stays SI). */
export function altitudeReadout(altitudeM: number): string {
  const m = Math.max(0, altitudeM);
  return m < 1000 ? `${Math.round(m)} M` : `${(m / 1000).toFixed(1)} KM`;
}

/** Accessible name of the scale (`Altitude 8.3 kilometres`). */
export function altitudeAria(altitudeM: number): string {
  const m = Math.max(0, altitudeM);
  return m < 1000 ? `Altitude ${Math.round(m)} metres` : `Altitude ${(m / 1000).toFixed(1)} kilometres`;
}

// --- compass ---------------------------------------------------------------------------------------------------

/** Ground and sea vehicles: the compass shows their heading while followed (camera heading otherwise). */
const HEADING_ASSETS: ReadonlySet<string> = new Set([
  'transporter',
  'tanker',
  'van',
  'crane',
  'boat_range',
  'vessel_recovery',
]);

export function headingFollowsEntity(asset: string): boolean {
  return HEADING_ASSETS.has(asset);
}

/**
 * Compass heading of an asset's forward axis (local +Z, ASSETS_GUIDE) from its quaternion, degrees [0, 360).
 * Site axes: +x east, −z north.
 */
export function headingOfQuat(qx: number, qy: number, qz: number, qw: number): number {
  // forward = q · (0, 0, 1)
  const fx = 2 * (qx * qz + qw * qy);
  const fz = 1 - 2 * (qx * qx + qy * qy);
  const deg = (Math.atan2(fx, -fz) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

/** Readout text, fixed 4 ch: `222°`, `007°`. */
export function headingReadout(deg: number): string {
  const d = Math.round(((deg % 360) + 360) % 360) % 360;
  return `${String(d).padStart(3, '0')}°`;
}
