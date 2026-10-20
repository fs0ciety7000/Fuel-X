// Debrief sheet view state (DESIGN_SYSTEM §6.29): VIEW SITE (Esc) collapses the sheet to a `DEBRIEF READY` badge,
// `B` reopens it. UI-local (not a sim or projection concern); keyed by the run so a new debrief opens again.
// Exit actions REPLAY SAME SEED / NEW SEED / EXPORT LOG are app session commands (GDD §13.2.3, AC 32).
import { createStore } from 'zustand/vanilla';
import type { ActionVM, DebriefVM } from '../../types';

export interface DebriefUiState {
  /** Run key whose sheet the player collapsed; null = open. */
  collapsedFor: string | null;
}

export const debriefUi = createStore<DebriefUiState>(() => ({ collapsedFor: null }));

/** Stable run key of a debrief (countdown id when projected, title otherwise). */
export const debriefKey = (d: Pick<DebriefVM, 'countdownId' | 'title'>): string => d.countdownId ?? d.title;

export const collapseDebrief = (d: Pick<DebriefVM, 'countdownId' | 'title'>): void =>
  debriefUi.setState({ collapsedFor: debriefKey(d) });

export const reopenDebrief = (): void => debriefUi.setState({ collapsedFor: null });

export const isDebriefOpen = (d: DebriefVM | null, s: DebriefUiState): boolean =>
  d !== null && s.collapsedFor !== debriefKey(d);

export type DebriefActionId = 'REPLAY' | 'NEW_SEED' | 'EXPORT_LOG' | 'VIEW_SITE';

/** The four MVP exit actions (GDD §13.2.3) — used when the projection does not list them (6.1 emits `[]`). */
export const DEFAULT_DEBRIEF_ACTIONS: readonly ActionVM[] = [
  { id: 'REPLAY', label: 'REPLAY SAME SEED', enabled: true, variant: 'primary', command: null },
  { id: 'NEW_SEED', label: 'NEW SEED', enabled: true, variant: 'secondary', command: null },
  { id: 'EXPORT_LOG', label: 'EXPORT LOG', enabled: true, variant: 'secondary', command: null },
  { id: 'VIEW_SITE', label: 'VIEW SITE', key: 'Esc', enabled: true, variant: 'secondary', command: null },
];

const ALIASES: Record<string, DebriefActionId> = {
  REPLAY: 'REPLAY',
  REPLAY_SAME_SEED: 'REPLAY',
  NEW_SEED: 'NEW_SEED',
  SEED: 'NEW_SEED',
  EXPORT_LOG: 'EXPORT_LOG',
  EXPORT: 'EXPORT_LOG',
  VIEW_SITE: 'VIEW_SITE',
  VIEW: 'VIEW_SITE',
};

/** Projected action id (`replay`, `REPLAY_SAME_SEED`, …) → the stable exit-action id, or null. */
export function debriefActionId(id: string): DebriefActionId | null {
  return ALIASES[id.toUpperCase().replace(/[^A-Z0-9]+/g, '_')] ?? null;
}

/** Actions to render: the projected ones when present, else the defaults; VIEW SITE always last. */
export function debriefActions(d: Pick<DebriefVM, 'actions'>): ActionVM[] {
  const list = d.actions.length ? [...d.actions] : [...DEFAULT_DEBRIEF_ACTIONS];
  if (!list.some((a) => debriefActionId(a.id) === 'VIEW_SITE')) list.push(DEFAULT_DEBRIEF_ACTIONS[3] as ActionVM);
  return [
    ...list.filter((a) => debriefActionId(a.id) !== 'VIEW_SITE'),
    ...list.filter((a) => debriefActionId(a.id) === 'VIEW_SITE'),
  ];
}
