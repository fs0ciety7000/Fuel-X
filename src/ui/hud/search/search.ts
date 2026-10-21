// Top-bar search, MVP stub (DESIGN_SYSTEM §6.3, GDD §10, task 8.2): one query that filters the rows of the
// tabbed panel's current tab by call-sign / text. UI-local view state (not a sim or projection concern), shared by
// the top-bar field and the tabbed panel through this store. `/` focuses the field, Esc clears then blurs.
import { createStore } from 'zustand/vanilla';
import type { EventVM, ListRowVM, ListsVM, StationVM } from '../../types';

export interface SearchUiState {
  query: string;
}

export const searchUi = createStore<SearchUiState>(() => ({ query: '' }));

export const setSearchQuery = (query: string): void => searchUi.setState({ query });
export const clearSearch = (): void => searchUi.setState({ query: '' });

/** Normalised needle: trimmed, case-folded; '' = no filter. */
export const needle = (q: string): string => q.trim().toLowerCase();

const hit = (n: string, ...fields: (string | null | undefined)[]): boolean =>
  fields.some((f) => typeof f === 'string' && f.toLowerCase().includes(n));

const rowHit =
  (n: string) =>
  (r: ListRowVM): boolean =>
    hit(n, r.name, r.sub, r.status, r.id, r.kind);
const stationHit =
  (n: string) =>
  (s: StationVM): boolean =>
    hit(n, s.code, s.label, s.driver, s.status);
const eventHit =
  (n: string) =>
  (e: EventVM): boolean =>
    hit(n, e.entityCode, e.message, e.code);

/**
 * The lists with every tab's rows narrowed to the query (case-insensitive substring on call-sign, name, sub-line,
 * status; stations on code/label/driver; events on entity code/message). Badges are left untouched: they count
 * the site's alerts, not the filtered view. Same object back when the query is empty (no re-render churn).
 */
export function filterLists(lists: ListsVM, query: string): ListsVM {
  const n = needle(query);
  if (!n) return lists;
  return {
    ...lists,
    vehicles: lists.vehicles.filter(rowHit(n)),
    tanks: lists.tanks.filter(rowHit(n)),
    tasks: lists.tasks.filter(rowHit(n)),
    range: lists.range.filter(stationHit(n)),
    ...(lists.rangeAssets ? { rangeAssets: lists.rangeAssets.filter(rowHit(n)) } : {}),
    events: lists.events.filter(eventHit(n)),
  };
}
