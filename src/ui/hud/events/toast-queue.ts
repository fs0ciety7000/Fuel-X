// Toast queue (DESIGN_SYSTEM §6.23): which projected alerts / log events become toasts and for how long. Pure and
// wall-clock-injected so it is unit-tested; the Toasts component owns the timer. Toast timing is UI (wall) time —
// it never touches the sim.
//
// Sources
// - Alerts (condition-based, `alerts.items`): warn → 8 s, danger → sticky until ACK (`view.ackAlert`). A toast
//   leaves as soon as its alert is acked or its condition clears.
// - Log events (`lists.events`, newest first): ok / info → 4 s, warn → 8 s, danger → sticky until dismissed;
//   events whose code already has a dedicated surface (alert, decision strip, timeline) or is per-step noise are
//   not toasted, so a condition never shows twice.
import type { AlertsVM, EventVM, Severity } from '../../types';

export const TOAST_MS: Record<Severity, number | null> = {
  ok: 4000,
  info: 4000,
  active: 4000,
  neutral: 4000,
  disabled: 4000,
  warn: 8000,
  danger: null,
};

export const MAX_VISIBLE = 3;
const MAX_KEPT = 24;
const MAX_SEEN = 512;

/** Log codes not toasted: covered by an alert / the decision strip / the timeline, or per-step noise. */
export const LOG_SKIP: ReadonlySet<string> = new Set([
  'StationChanged',
  'HoldStarted',
  'DecisionRequired',
  'AnomalyFired',
  'EnginesChanged',
  'WindowMissed',
  'RecoveryOutcome',
  'EntityStateChanged',
  'FlightEvent',
  'ArmsChanged',
  'Despawned',
]);

const LOG_STATES: ReadonlySet<Severity> = new Set<Severity>(['ok', 'info', 'warn', 'danger']);

export interface ToastItem {
  /** `alert:<id>` or `log:<id>`. */
  key: string;
  source: 'alert' | 'log';
  event: EventVM;
  /** Wall ms; null = sticky. */
  expiresAt: number | null;
}

export interface ToastState {
  ready: boolean;
  items: ToastItem[];
  seenLog: string[];
  seenAlerts: string[];
  /** Wall ms when hover / focus paused the timers; null while running. */
  pausedAt: number | null;
}

export const initialToasts = (): ToastState => ({
  ready: false,
  items: [],
  seenLog: [],
  seenAlerts: [],
  pausedAt: null,
});

const expiry = (e: EventVM, now: number): number | null => {
  const ms = TOAST_MS[e.state];
  return ms === null ? null : now + ms;
};

/** Fold one projection (alerts + log) into the queue. The first call only marks the log as seen. */
export function ingest(
  s: ToastState,
  alerts: Pick<AlertsVM, 'items'>,
  events: readonly EventVM[],
  now: number,
): ToastState {
  const openAlerts = new Map(alerts.items.filter((a) => !a.acked).map((a) => [a.id, a]));
  // Drop toasts of acked / cleared alerts; refresh the event of the ones still open (message may change).
  let items = s.items.flatMap((t) => {
    if (t.source !== 'alert') return [t];
    const a = openAlerts.get(t.event.id);
    return a ? [a === t.event ? t : { ...t, event: a }] : [];
  });
  const seenA = new Set(s.seenAlerts);
  const fresh: ToastItem[] = [];
  for (const a of alerts.items) {
    if (seenA.has(a.id)) continue;
    seenA.add(a.id);
    if (a.acked || (a.state !== 'warn' && a.state !== 'danger')) continue;
    fresh.push({ key: `alert:${a.id}`, source: 'alert', event: a, expiresAt: expiry(a, now) });
  }
  // An alert id leaves `seen` when its condition clears, so it toasts again if it comes back.
  const seenAlerts = [...seenA].filter((id) => alerts.items.some((a) => a.id === id));

  const seenL = new Set(s.seenLog);
  const newLog: ToastItem[] = [];
  for (const e of events) {
    if (seenL.has(e.id)) continue;
    seenL.add(e.id);
    if (!s.ready) continue;
    if (!LOG_STATES.has(e.state) || (e.code !== undefined && LOG_SKIP.has(e.code))) continue;
    newLog.push({ key: `log:${e.id}`, source: 'log', event: e, expiresAt: expiry(e, now) });
  }
  const seenLog = [...seenL].slice(-MAX_SEEN);

  // Newest first: log rows arrive newest first already; fresh alerts go on top of them.
  items = [...fresh, ...newLog, ...items];
  if (items.length > MAX_KEPT) {
    const sticky = items.filter((t) => t.expiresAt === null);
    const timed = items.filter((t) => t.expiresAt !== null).slice(0, Math.max(0, MAX_KEPT - sticky.length));
    items = items.filter((t) => sticky.includes(t) || timed.includes(t));
  }
  const same = s.ready && items.length === s.items.length && items.every((t, i) => t === s.items[i]) && !fresh.length;
  if (same && seenLog.length === s.seenLog.length && seenAlerts.length === s.seenAlerts.length) return s;
  return { ...s, ready: true, items, seenLog, seenAlerts };
}

/** Remove expired toasts (no-op while paused). */
export function prune(s: ToastState, now: number): ToastState {
  if (s.pausedAt !== null) return s;
  const items = s.items.filter((t) => t.expiresAt === null || t.expiresAt > now);
  return items.length === s.items.length ? s : { ...s, items };
}

export function dismiss(s: ToastState, key: string): ToastState {
  return { ...s, items: s.items.filter((t) => t.key !== key) };
}

/** Hover / focus pauses every timer; resuming shifts the deadlines by the paused span. */
export function pause(s: ToastState, now: number): ToastState {
  return s.pausedAt === null ? { ...s, pausedAt: now } : s;
}

export function resume(s: ToastState, now: number): ToastState {
  if (s.pausedAt === null) return s;
  const d = now - s.pausedAt;
  return {
    ...s,
    pausedAt: null,
    items: s.items.map((t) => (t.expiresAt === null ? t : { ...t, expiresAt: t.expiresAt + d })),
  };
}

/** Earliest pending expiry (ms), for the component's single timer. */
export function nextExpiry(s: ToastState): number | null {
  if (s.pausedAt !== null) return null;
  let next: number | null = null;
  for (const t of s.items) if (t.expiresAt !== null && (next === null || t.expiresAt < next)) next = t.expiresAt;
  return next;
}

export function visible(s: ToastState): { shown: ToastItem[]; overflow: number } {
  return { shown: s.items.slice(0, MAX_VISIBLE), overflow: Math.max(0, s.items.length - MAX_VISIBLE) };
}
