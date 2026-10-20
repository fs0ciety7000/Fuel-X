// Decision strip logic (DESIGN_SYSTEM §6.28): pure, unit-tested. The projector picks the decision (D3 > D3b > D2 >
// D1), computes every number, state and reason; the UI only maps keys, words and the collapsed D1 line.
import type {
  CatchDecisionVM,
  DecisionKind,
  DecisionOptionVM,
  DecisionVM,
  PropMarginDecisionVM,
  Severity,
} from '../../types';

export const KIND_CODE: Record<DecisionKind, string> = {
  CATCH: 'D3',
  LEAK: 'D3B',
  POLL: 'D2',
  PROP_MARGIN: 'D1',
};

/** Same order as the projector's DECISION_PRIORITY (GDD §13.2.1, AC 30); used only to sort the queued chip. */
export const PRIORITY: readonly DecisionKind[] = ['CATCH', 'LEAK', 'POLL', 'PROP_MARGIN'];

/** `p` band → severity (§6.28: CLEAR ok, LEAN info, CONTESTED warn, AGAINST danger). */
export const BAND_STATE: Record<CatchDecisionVM['band'], Severity> = {
  CLEAR: 'ok',
  LEAN: 'info',
  CONTESTED: 'warn',
  AGAINST: 'danger',
};

/** Keyboard key for an option hint (`⏎` = Enter, `Esc` = Escape, letters case-insensitive); '' = none. */
export function keyOf(hint: string): string {
  if (hint === '⏎' || hint.toLowerCase() === 'enter') return 'Enter';
  if (hint.toLowerCase() === 'esc') return 'Escape';
  return hint.length === 1 ? hint.toLowerCase() : '';
}

/** Option bound to a key press inside the strip, or null. Disabled options still match (the caller announces). */
export function optionForKey(options: readonly DecisionOptionVM[], key: string): DecisionOptionVM | null {
  const k = key.length === 1 ? key.toLowerCase() : key;
  return options.find((o) => o.key && keyOf(o.key) === k) ?? null;
}

/** `+2 QUEUED · D2 D1` (empty when nothing waits). */
export function queuedLabel(d: DecisionVM): string {
  if (d.queued <= 0) return '';
  const kinds = [...(d.queuedKinds ?? [])].sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b));
  return `+${d.queued} QUEUED${kinds.length ? ` · ${kinds.map((k) => KIND_CODE[k]).join(' ')}` : ''}`;
}

/** Advisory D1 opens collapsed to one line (§6.28 Time); blocking decisions always open expanded. */
export function startsCollapsed(d: DecisionVM): boolean {
  return d.kind === 'PROP_MARGIN' && !d.blocking;
}

/** Collapsed D1 line: `D1 · ROAD CLOSURE IN 03:12:00 · LOX RESERVE 0.60 H · CH4 RESERVE 0.90 H`. */
export function collapsedLine(d: PropMarginDecisionVM): string {
  const rem = d.deadline.remaining.text || '—';
  const res = d.reserves.map((r) => `${r.label} ${r.value.text}${r.value.unit ? ` ${r.value.unit}` : ''}`);
  return [`${KIND_CODE.PROP_MARGIN} · ${d.deadline.label} IN ${rem}`, ...res].join(' · ');
}

/** What a press does: `send` the command, `confirm` first, `collapse` (UI-only D1 NO ORDER), or `blocked`. */
export function pressOutcome(o: DecisionOptionVM): 'send' | 'confirm' | 'collapse' | 'blocked' {
  if (!o.enabled) return 'blocked';
  if (!o.command) return 'collapse';
  return o.confirm ? 'confirm' : 'send';
}

/** Assertive announcement when a decision opens (§6.28 Element). */
export function openAnnouncement(d: DecisionVM): string {
  const p = d.kind === 'CATCH' ? ` P ${d.p.text} ${d.band},` : '';
  return `DECISION: ${d.question}${p} DEADLINE ${d.deadline.label} ${d.deadline.remaining.text}`.trim();
}

/** Strip frame severity: the projector's state, info when it says nothing stronger. */
export function stripState(d: DecisionVM): Severity {
  return d.state === 'neutral' ? 'info' : d.state;
}
