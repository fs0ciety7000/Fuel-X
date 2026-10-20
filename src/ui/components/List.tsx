import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { ListRowVM } from '../types';
import type { DemoState } from './cx';
import { Glyph } from './Glyph';
import { HazardBand } from './HazardBand';
import { Value } from './Value';
import styles from './List.module.css';

export interface ListProps<R extends ListRowVM = ListRowVM> {
  label: string;
  rows: R[];
  /** Replaces the key-value cell (tank fill bar, …); defaults to `<Value v={row.keyValue}>`. */
  trail?: (row: R) => ReactNode;
  onSelect?: (id: string) => void;
  onFollow?: (id: string) => void;
  /** Shown when `rows` is empty. */
  emptyText?: string;
  demo?: Record<string, DemoState>;
}

/** §6.13 list rows in a single-select listbox: ↑/↓/Home/End move, Enter selects, F follows. */
export function List<R extends ListRowVM = ListRowVM>({
  label,
  rows,
  trail,
  onSelect,
  onFollow,
  emptyText = 'NO ITEMS',
  demo,
}: ListProps<R>) {
  const refs = useRef<(HTMLLIElement | null)[]>([]);
  if (rows.length === 0) {
    return (
      <div className={styles.list} role="listbox" aria-label={label}>
        <p className={styles.empty}>{emptyText}</p>
      </div>
    );
  }
  const active = Math.max(
    0,
    rows.findIndex((r) => r.selected),
  );
  const onKey = (e: KeyboardEvent<HTMLUListElement>, i: number, id: string): void => {
    const last = rows.length - 1;
    const to =
      e.key === 'ArrowDown'
        ? Math.min(last, i + 1)
        : e.key === 'ArrowUp'
          ? Math.max(0, i - 1)
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : -1;
    if (to >= 0) {
      e.preventDefault();
      refs.current[to]?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.(id);
    } else if ((e.key === 'f' || e.key === 'F') && onFollow) {
      // Handled here: the HUD's global `F` (follow / unfollow the selection) skips prevented events.
      e.preventDefault();
      onFollow(id);
    }
  };
  return (
    <ul className={styles.list} role="listbox" aria-label={label}>
      {rows.map((r, i) => (
        <li
          key={r.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          role="option"
          aria-selected={r.selected}
          aria-disabled={r.state === 'disabled' || undefined}
          tabIndex={i === active ? 0 : -1}
          className={styles.row}
          data-state={r.state}
          data-demo={demo?.[r.id]}
          onClick={() => onSelect?.(r.id)}
          onDoubleClick={() => onFollow?.(r.id)}
          onKeyDown={(e) => onKey(e as unknown as KeyboardEvent<HTMLUListElement>, i, r.id)}
        >
          {r.state === 'danger' ? (
            <span className={styles.edge}>
              <HazardBand />
            </span>
          ) : null}
          <Glyph id={r.state === 'danger' ? 'danger' : r.state === 'warn' ? 'warn' : r.glyph} />
          <span className={styles.names}>
            <span className={styles.name}>{r.name}</span>
            <span className={styles.sub}>
              {r.sub}
              {r.following ? ' · FOLLOWING' : ''}
            </span>
          </span>
          {trail ? <span className={styles.key}>{trail(r)}</span> : <Value v={r.keyValue} className={styles.key} />}
        </li>
      ))}
    </ul>
  );
}
