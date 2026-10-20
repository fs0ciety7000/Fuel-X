// Phase-transition stamp logic (DESIGN_SYSTEM §6.26): pure, unit-tested.
import type { CountdownVM } from '../../types';

/** Wall-clock life of the stamp: `--fx-dur-stamp` (640 ms), a static 1 s plate under reduced motion (§2.8). */
export const STAMP_MS = 640;
export const STAMP_REDUCED_MS = 1000;

export interface StampVM {
  /** Phase id the stamp belongs to (a new phase replaces it). */
  id: string;
  label: string;
  /** `PHASE 05 / 08`. */
  header: string;
}

/** The phase the countdown is in (current or held), or null. */
export function activePhase(cd: CountdownVM | null): StampVM | null {
  if (!cd) return null;
  const i = cd.phases.findIndex((p) => p.state === 'current' || p.state === 'held');
  const p = cd.phases[i];
  if (!p) return null;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return { id: p.id, label: p.label, header: `PHASE ${pad(i + 1)} / ${pad(cd.phases.length)}` };
}

/**
 * Stamp to print after a projection: only on a real phase *change* while the sim runs. A phase reached by a
 * headless jump or a load (sim paused) is not stamped, so frozen screenshots never catch a transient plate.
 */
export function stampFor(prev: StampVM | null, next: StampVM | null, running: boolean): StampVM | null {
  if (!next || !prev || !running) return null;
  return next.id !== prev.id ? next : null;
}
