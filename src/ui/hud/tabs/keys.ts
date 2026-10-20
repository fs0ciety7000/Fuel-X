// Global keyboard helpers for the HUD panels (DESIGN_SYSTEM §8 keyboard map). Single-letter keys never fire while
// the player types in an input, and modifier chords other than the documented ones are left to the browser.
import type { HudTab } from '../../types';

export const TAB_ORDER: readonly HudTab[] = ['vehicles', 'tanks', 'tasks', 'range', 'events'];

/** True when the key event comes from a text field (search) or a contenteditable. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as (HTMLElement & { isContentEditable?: boolean }) | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
}

/** `Alt+1…5` → tab (§6.14); null for any other key. Uses `code` so layouts with shifted digits still work. */
export function tabForKey(e: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'code' | 'key'>): HudTab | null {
  if (!e.altKey || e.ctrlKey || e.metaKey) return null;
  const m = /^Digit([1-5])$/.exec(e.code) ?? /^([1-5])$/.exec(e.key);
  return m ? (TAB_ORDER[Number(m[1]) - 1] ?? null) : null;
}

/** A bare letter key (no modifiers, not typing) — `F` follow, `B` debrief. */
export function isPlainKey(e: KeyboardEvent, letter: string): boolean {
  return !e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === letter.toLowerCase() && !isTyping(e.target);
}
