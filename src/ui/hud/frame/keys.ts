// Global HUD keys (DESIGN_SYSTEM §8 keyboard map). One window listener; reads the projection at key time (no
// subscription). Single-letter keys never fire while typing, and Space never steals a focused control's activation.
import { useEffect } from 'react';
import { projectionStore, view, viewStore } from '@bridge/index';
import { announce } from './live';
import { rateAnnouncement, runEnded, steppedRate, toggledRate } from '../topbar/rate';
import { runSkip } from '../topbar/RateControl';
import { clearSearch, searchUi } from '../search/search';

/** Keymap source for the `?` sheet and `/design` (§9.10). Entries owned by other tasks are listed by them. */
export const HUD_KEYS: readonly { keys: string; action: string; owner: string }[] = [
  { keys: '/', action: 'Focus the search (filters the open tab) · Esc in it clears, again leaves', owner: '8.2' },
  { keys: 'Esc', action: 'Close popover / dialog → clear search → deselect (one step per press)', owner: '8.2' },
  { keys: 'Enter', action: 'Follow the focused row / label tag (Space / click = select only)', owner: '6.4 / 6.6' },
  { keys: 'Space', action: 'Pause / resume', owner: '6.3' },
  { keys: ', / .', action: 'Time rate down / up (capped steps announce their reason)', owner: '6.3' },
  { keys: 'N', action: 'Skip to next milestone (when allowed) · again = cancel the skip', owner: '6.3 / 7.2' },
  { keys: 'Shift+H', action: 'Hold the count (while counting; timeline header). Plain H = camera home', owner: '6.5' },
  { keys: 'G', action: 'Focus the decision strip (when open)', owner: '6.5' },
  { keys: 'O', action: 'Expand the D1 propellant strip', owner: '6.5' },
  { keys: 'F', action: 'Follow / unfollow the selected entity', owner: '6.4 inspector' },
  { keys: 'B', action: 'Reopen the collapsed debrief', owner: '6.7 debrief' },
  { keys: 'Ctrl/⌘+S', action: 'SAVE · LOAD sheet (also the top-bar SAVE · LOAD button)', owner: '8.3 persistence' },
  { keys: 'Alt+1…5', action: 'Vehicles / Tanks / Tasks / Range / Events tab', owner: '6.4 tabs' },
  { keys: '+ / −', action: 'Zoom in / out (hold to repeat)', owner: '6.6 map controls' },
  { keys: 'Q / E', action: 'Rotate view left / right', owner: '6.6 map controls' },
  { keys: 'Z', action: 'Frame the selection', owner: '6.6 map controls' },
  { keys: 'C', action: 'Recenter on the followed entity', owner: '6.6 map controls' },
  { keys: 'H', action: 'Home view (plain H; Shift+H holds the count)', owner: '6.6 map controls / 8.2' },
];

/** Every single key a HUD_KEYS entry binds (`', / .'` → `,` `.`; `Alt+1…5` → `Alt+1` … `Alt+5`). */
export function boundKeys(entries: readonly { keys: string }[] = HUD_KEYS): string[] {
  return entries.flatMap((k) =>
    k.keys === 'Alt+1…5' ? ['Alt+1', 'Alt+2', 'Alt+3', 'Alt+4', 'Alt+5'] : k.keys.split(' / ').map((x) => x.trim()),
  );
}

const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const ACTIVATES = new Set(['BUTTON', 'A', 'SUMMARY']);
const ACTIVATING_ROLES = new Set(['button', 'radio', 'option', 'tab', 'checkbox', 'switch', 'menuitem', 'link']);

/** True when the key belongs to the focused element (typing, or Space/Enter on a control). */
export function ownedByTarget(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (TYPING.has(target.tagName) || target.isContentEditable) return true;
  if (key === ' ' || key === 'Enter') {
    if (ACTIVATES.has(target.tagName)) return true;
    const role = target.getAttribute('role');
    if (role && ACTIVATING_ROLES.has(role)) return true;
  }
  return false;
}

/**
 * `Esc` outside any field (§8): popovers / tooltips / dialogs consume it first (they prevent the default, a modal
 * `<dialog>` owns it while open); then one step per press — clear the search query, else drop the selection.
 */
export function escapeStep(): boolean {
  if (typeof document !== 'undefined' && document.querySelector('dialog[open]')) return false;
  if (searchUi.getState().query) {
    clearSearch();
    announce('SEARCH CLEARED');
    return true;
  }
  if (viewStore.getState().selectedId) {
    view.select(null);
    announce('SELECTION CLEARED');
    return true;
  }
  return false;
}

export interface HudKeyHandlers {
  /** Extra single-key handlers registered by HUD parts (e.g. `G`, `H`); return true when handled. */
  extra?: (e: KeyboardEvent) => boolean;
}

export function handleHudKey(e: KeyboardEvent, extra?: (e: KeyboardEvent) => boolean): boolean {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (ownedByTarget(e.target, e.key)) return false;
  const p = projectionStore.getState();
  const ended = runEnded(p.timeScale, p.debrief !== null);
  if (e.key === ' ') {
    if (ended) {
      announce('RATE DISABLED, RUN ENDED');
      return true;
    }
    const r = toggledRate(p.timeScale);
    view.timeScale(r);
    announce(r === 0 ? 'PAUSED' : rateAnnouncement(r, p.timeScale));
    return true;
  }
  if (e.key === ',' || e.key === '.') {
    if (ended) {
      announce('RATE DISABLED, RUN ENDED');
      return true;
    }
    const { rate, blocked } = steppedRate(p.timeScale, e.key === '.' ? 1 : -1);
    if (rate !== null) {
      view.timeScale(rate);
      announce(rateAnnouncement(rate, p.timeScale));
    } else if (blocked) announce(`RATE LOCKED, ${blocked}`);
    return true;
  }
  if (e.key.toLowerCase() === 'n' && !e.shiftKey) {
    runSkip(p.timeScale, ended);
    return true;
  }
  if (e.key === 'Escape') return escapeStep();
  return extra ? extra(e) : false;
}

/** Install the global HUD key listener for the lifetime of the HUD root. */
export function useHudKeys(enabled = true, extra?: (e: KeyboardEvent) => boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent): void => {
      if (handleHudKey(e, extra)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, extra]);
}
