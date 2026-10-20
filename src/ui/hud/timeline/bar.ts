// Countdown bar geometry (DESIGN_SYSTEM §6.17): pure, unit-tested. The projector gives every phase its planned share
// of the bar and every mark (playhead, polls, window) as a fraction of the *planned* bar. Planned shares are wildly
// uneven (hours of prep vs seconds of flight), so the display gives each phase a floor and maps every planned
// fraction through the same piecewise-linear function — marks stay inside the phase they belong to.
import type { PhaseVM } from '../../types';

/** Floor share per phase: with 8 phases, 40 % of the bar is shared equally, 60 % proportionally. */
export const MIN_SHARE = 0.05;

export interface BarSegment {
  /** Planned start / share (fractions of the planned bar). */
  start: number;
  share: number;
  /** Display start / width (fractions of the drawn bar). */
  x: number;
  w: number;
}

export function barSegments(phases: readonly Pick<PhaseVM, 'share'>[], min = MIN_SHARE): BarSegment[] {
  const n = phases.length;
  if (n === 0) return [];
  const total = phases.reduce((a, p) => a + Math.max(0, p.share), 0) || 1;
  const floor = Math.min(min, 1 / n);
  const free = 1 - floor * n;
  let start = 0;
  let x = 0;
  return phases.map((p) => {
    const share = Math.max(0, p.share) / total;
    const w = floor + free * share;
    const seg = { start, share, x, w };
    start += share;
    x += w;
    return seg;
  });
}

/** Planned fraction (playhead, poll, window marker) → display fraction. Clamped to [0, 1]. */
export function mapFraction(f: number, segs: readonly BarSegment[]): number {
  if (segs.length === 0) return Math.max(0, Math.min(1, f));
  const c = Math.max(0, Math.min(1, f));
  for (const s of segs) {
    if (c <= s.start + s.share || s === segs[segs.length - 1]) {
      const local = s.share > 0 ? (c - s.start) / s.share : 0;
      return Math.max(0, Math.min(1, s.x + Math.max(0, Math.min(1, local)) * s.w));
    }
  }
  return 1;
}

/** Fill of one segment, 0–1: done = 1, current / held = its progress, pending / skipped = 0. */
export function segmentFill(p: Pick<PhaseVM, 'state' | 'progress'>): number {
  if (p.state === 'done') return 1;
  if (p.state === 'current' || p.state === 'held') return Math.max(0, Math.min(1, p.progress));
  return 0;
}

/** T-clock seconds that get a polite announcement when crossed downward (§6.17). */
export const MILESTONE_S = [-10, -5, 0] as const;

/** Milestone crossed between two T-clock samples (s), or null. */
export function crossedMilestone(prev: number | null | undefined, next: number | null | undefined): number | null {
  if (prev === null || prev === undefined || next === null || next === undefined || next <= prev) return null;
  for (const m of MILESTONE_S) if (prev < m && next >= m) return m;
  return null;
}
