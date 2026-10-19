import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { DemoState } from './cx';
import { Glyph } from './Glyph';
import styles from './Tabs.module.css';

export interface TabDef {
  id: string;
  label: string;
  /** Count of items in warn/danger (§6.14 tab badge). */
  badge?: { count: number; state: 'warn' | 'danger' };
  disabledReason?: string;
}

export interface TabsProps {
  label: string;
  tabs: TabDef[];
  active: string;
  onChange?: (id: string) => void;
  children: ReactNode;
  demo?: { id: string; state: DemoState };
  className?: string;
}

/** §6.34 tabs: roving tabindex, ←/→/Home/End with automatic activation, hard-cut panels. */
export function Tabs({ label, tabs, active, onChange, children, demo, className }: TabsProps) {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = Math.max(
    0,
    tabs.findIndex((t) => t.id === active),
  );
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const n = tabs.length;
    const to =
      e.key === 'ArrowRight'
        ? (idx + 1) % n
        : e.key === 'ArrowLeft'
          ? (idx - 1 + n) % n
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : -1;
    if (to < 0) return;
    e.preventDefault();
    refs.current[to]?.focus();
    const t = tabs[to];
    if (t && !t.disabledReason) onChange?.(t.id);
  };
  return (
    <div className={[styles.tabs, className].filter(Boolean).join(' ')}>
      <div role="tablist" aria-label={label} className={styles.list} onKeyDown={onKey}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${base}-tab-${t.id}`}
            type="button"
            role="tab"
            className={styles.tab}
            aria-selected={t.id === active}
            aria-controls={`${base}-panel`}
            aria-disabled={t.disabledReason ? true : undefined}
            title={t.disabledReason}
            tabIndex={i === idx ? 0 : -1}
            data-demo={demo?.id === t.id ? demo.state : undefined}
            onClick={() => {
              if (!t.disabledReason) onChange?.(t.id);
            }}
          >
            {t.label}
            {t.badge && t.badge.count > 0 ? (
              <span className={styles.count} data-state={t.badge.state}>
                <Glyph id={t.badge.state} />
                {t.badge.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div
        id={`${base}-panel`}
        role="tabpanel"
        aria-labelledby={`${base}-tab-${active}`}
        className={styles.panel}
        tabIndex={0}
      >
        {children}
      </div>
    </div>
  );
}
