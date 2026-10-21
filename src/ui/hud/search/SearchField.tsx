import { useEffect, useId, useRef, type RefObject } from 'react';
import { useStore } from 'zustand';
import { Glyph } from '../../components';
import { ownedByTarget } from '../frame/keys';
import { clearSearch, searchUi, setSearchQuery } from './search';
import styles from './SearchField.module.css';

export interface SearchFieldViewProps {
  query: string;
  onQuery?: (q: string) => void;
  onClear?: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}

/**
 * §6.3 search, MVP stub: a `role="search"` form with one search field that filters the open tab of the tabbed
 * panel (no results popover). Esc clears the query, a second Esc leaves the field; `/` hint printed on the right.
 * Query text is typed as is (readability); matching is case-insensitive.
 */
export function SearchFieldView({ query, onQuery, onClear, inputRef }: SearchFieldViewProps) {
  const hint = useId();
  return (
    <form
      role="search"
      aria-label="Search"
      className={styles.search}
      data-testid="search"
      onSubmit={(e) => e.preventDefault()}
    >
      <Glyph id="search" />
      <input
        ref={inputRef}
        type="search"
        className={styles.input}
        value={query}
        placeholder="FILTER TAB"
        aria-label="Filter the open tab"
        aria-describedby={hint}
        aria-keyshortcuts="/"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onQuery?.(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          // Esc #1 clears, Esc #2 leaves the field (§6.3); never reaches the global deselect.
          e.preventDefault();
          e.stopPropagation();
          if (query) onClear?.();
          else e.currentTarget.blur();
        }}
      />
      <span id={hint} className={styles.sr}>
        Filters the rows of the open tab by call-sign or text. Escape clears.
      </span>
      <kbd className={styles.kbd} aria-hidden="true">
        /
      </kbd>
    </form>
  );
}

/** True for the keys that focus the search from anywhere in the HUD: `/` and `Ctrl/⌘+K` (§8). */
export function isSearchKey(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>): boolean {
  if (e.altKey) return false;
  if (e.key === '/' && !e.ctrlKey && !e.metaKey) return true;
  return (e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey);
}

/** Store-connected field for the top bar; installs the `/` (and `Ctrl/⌘+K`) focus key. */
export function SearchField() {
  const query = useStore(searchUi, (s) => s.query);
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || !isSearchKey(e) || ownedByTarget(e.target, e.key)) return;
      e.preventDefault();
      ref.current?.focus();
      ref.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return <SearchFieldView query={query} onQuery={setSearchQuery} onClear={clearSearch} inputRef={ref} />;
}
