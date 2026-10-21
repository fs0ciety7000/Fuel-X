// Rate control logic (DESIGN_SYSTEM §6.25): pure functions over TimeScaleVM, unit-tested. The projector owns every
// rule (caps, drops, run end); this file only maps the VM to segments and keyboard steps. No threshold maths.
import type { RateStateVM } from '@bridge/index';
import type { Rate, TimeScaleVM } from '../../types';

export const RATES: readonly Rate[] = [0, 1, 10, 100];
const RUNNING: readonly Exclude<Rate, 0>[] = [1, 10, 100];
export const RUN_ENDED = 'RUN ENDED';
export const SKIPPING = 'SKIPPING';

export interface RateSegment {
  value: Rate;
  text: string;
  ariaLabel: string;
  /** Whole control off (run ended): aria-disabled with this reason. */
  disabledReason: string | null;
  /** Above the cap: hatched, still selectable, the request is remembered. */
  capReason: string | null;
}

/** Run over (debrief): projector flag, with a fallback for projections that predate it. */
export function runEnded(ts: TimeScaleVM, debriefOpen: boolean): boolean {
  return ts.runEnded ?? debriefOpen;
}

/** Text of the cap chip (`1× LOCKED · TERMINAL COUNT`) or null. */
export function capLabel(ts: TimeScaleVM): string | null {
  if (!ts.lockReason) return null;
  return ts.lockLabel || ts.lockReason;
}

/** The segment value shown as selected: the *requested* rate (0 = paused). */
export function selectedRate(ts: TimeScaleVM): Rate {
  return ts.paused ? 0 : ts.requested;
}

export function rateSegments(ts: TimeScaleVM, ended: boolean): RateSegment[] {
  const cap = capLabel(ts);
  return RATES.map((r) => ({
    value: r,
    text: r === 0 ? 'II' : `${r}×`,
    ariaLabel: r === 0 ? 'Pause' : `${r} times`,
    disabledReason: ended ? RUN_ENDED : ts.skip.active ? SKIPPING : null,
    capReason: !ended && !ts.skip.active && r !== 0 && r > ts.maxAllowed ? cap : null,
  }));
}

/**
 * Time scale the rate keys act on (8.2): the projection with its rate fields replaced by the app's synchronous
 * `session.rateState()` (null while unbound → the projection as is). A request applies at once in the app but shows in
 * the projection only up to 100 ms later, so a second `Space` / `,` / `.` must not start from the stale copy.
 */
export function liveTimeScale(ts: TimeScaleVM, live: RateStateVM | null): TimeScaleVM {
  return live ? { ...ts, ...live } : ts;
}

/** Rate `Space` toggles to: pause when running, else the last running request. */
export function toggledRate(ts: TimeScaleVM): Rate {
  if (!ts.paused) return 0;
  return ts.resumeRate ?? (ts.requested === 0 ? 1 : ts.requested);
}

/**
 * `,` / `.` (dir −1 / +1): next running rate from the current request, skipping capped steps upward
 * (`blocked` = the cap stops it; the caller announces the reason). Paused: steps from the resume rate and resumes.
 */
export function steppedRate(ts: TimeScaleVM, dir: 1 | -1): { rate: Rate | null; blocked: string | null } {
  const from: Exclude<Rate, 0> = ts.paused || ts.requested === 0 ? (ts.resumeRate ?? 1) : ts.requested;
  const i = RUNNING.indexOf(from);
  const next = RUNNING[i + dir];
  if (next === undefined) return { rate: ts.paused ? from : null, blocked: null };
  if (dir === 1 && next > ts.maxAllowed) return { rate: ts.paused ? from : null, blocked: capLabel(ts) };
  return { rate: next, blocked: null };
}

/** Polite announcement after a rate request (§6.25 keyboard). */
export function rateAnnouncement(rate: Rate, ts: TimeScaleVM): string {
  if (rate === 0) return 'PAUSED';
  const cap = capLabel(ts);
  return rate > ts.maxAllowed && cap ? `RATE ${rate}× QUEUED, ${cap}` : `RATE ${rate}×`;
}

/** Top-bar / header readout: `SIM 10×`, `SIM PAUSED`, `SIM 7.4× OF 100×`. */
export function readout(ts: TimeScaleVM): string {
  return ts.readout ?? (ts.paused ? 'SIM PAUSED' : `SIM ${ts.effectiveRate}`);
}

/** `N` / SKIP button: start a skip when allowed, cancel a running one, else say why not. */
export function skipIntent(ts: TimeScaleVM, ended: boolean): 'start' | 'cancel' | { blocked: string } {
  if (ts.skip.active) return 'cancel';
  if (ended) return { blocked: RUN_ENDED };
  if (ts.skip.enabled) return 'start';
  return { blocked: ts.skip.reason ?? 'NO MILESTONE SCHEDULED' };
}

/** Polite line for a one-shot drop to 1× (GDD §6), e.g. `RATE 1×, DECISION OPEN`. */
export function dropAnnouncement(ts: TimeScaleVM): string | null {
  if (!ts.drop) return null;
  return `RATE DROPPED TO ${ts.drop.label}`;
}
