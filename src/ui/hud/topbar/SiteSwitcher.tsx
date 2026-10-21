import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Glyph } from '../../components';
import type { SiteVM } from '../../types';
import styles from './TopBar.module.css';

/** Reason printed on a site the MVP cannot switch to (no projection field yet; see DESIGN_SYSTEM §6.2). */
export const SITE_LOCKED = 'LOCKED IN THIS BUILD';

export const isPlayable = (s: SiteVM): boolean => s.interactive ?? s.state !== 'disabled';

/** Next option index for a listbox key (arrows wrap, Home/End), or null for other keys. */
export function nextIndex(key: string, i: number, n: number): number | null {
  if (n === 0) return null;
  if (key === 'ArrowDown') return (i + 1) % n;
  if (key === 'ArrowUp') return (i - 1 + n) % n;
  if (key === 'Home') return 0;
  if (key === 'End') return n - 1;
  return null;
}

export interface SiteSwitcherProps {
  sites: SiteVM[];
  onSelect?: (id: string) => void;
  /** Force open (gallery). */
  open?: boolean;
  /** Initially active option (gallery hover/focus demo). */
  activeIndex?: number;
}

/**
 * §6.2 breadcrumb site switcher: last crumb opens a listbox of sites. Disabled sites stay navigable and print why
 * (hatch, status + LOCKED reason, aria-disabled); Enter on the playable one switches (camera cuts home), Esc closes.
 */
export function SiteSwitcher({ sites, onSelect, open: forced, activeIndex }: SiteSwitcherProps) {
  const id = useId();
  const [ownOpen, setOpen] = useState(false);
  const open = forced ?? ownOpen;
  const cur = Math.max(
    0,
    sites.findIndex((s) => s.current),
  );
  const [active, setActive] = useState(activeIndex ?? cur);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLUListElement | null>(null);
  const current = sites[cur];

  useEffect(() => {
    if (!open || forced !== undefined) return;
    list.current?.focus();
    const onDown = (e: PointerEvent): void => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !trigger.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, forced]);

  const close = (focusTrigger: boolean): void => {
    setOpen(false);
    if (focusTrigger) trigger.current?.focus();
  };
  const choose = (i: number): void => {
    const s = sites[i];
    if (!s || !isPlayable(s)) return;
    if (!s.current) onSelect?.(s.id);
    close(true);
  };
  const openList = (): void => {
    setActive(cur);
    setOpen(true);
  };
  const onListKey = (e: KeyboardEvent<HTMLUListElement>): void => {
    const n = nextIndex(e.key, active, sites.length);
    if (n !== null) {
      e.preventDefault();
      setActive(n);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === 'Tab') close(false);
  };

  return (
    <div className={styles.sites}>
      <button
        ref={trigger}
        type="button"
        className={styles.crumbButton}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        data-testid="site-switcher"
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            openList();
          }
        }}
      >
        {/* Name = `Site LC-1 BRACKWATER` from the visible text (WCAG 2.5.3); the popup role says "switch". */}
        <span className={styles.sr}>Site </span>
        <span className={styles.crumbCode}>{current?.code ?? '—'}</span>
        {current?.name ? <span className={styles.crumbName}> {current.name}</span> : null}
        <Glyph id="caret" />
      </button>
      {open ? (
        <div className={styles.sitesSheet} data-static={forced !== undefined || undefined}>
          <p className={styles.sheetHead}>[ SITES ]</p>
          <ul
            ref={list}
            id={`${id}-list`}
            role="listbox"
            aria-label="Sites"
            tabIndex={-1}
            aria-activedescendant={`${id}-opt-${active}`}
            className={styles.siteList}
            onKeyDown={onListKey}
          >
            {sites.map((s, i) => {
              const playable = isPlayable(s);
              return (
                <li
                  key={s.id}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={s.current}
                  aria-disabled={!playable || undefined}
                  aria-description={playable ? undefined : `${s.status}, ${SITE_LOCKED}`}
                  className={styles.siteRow}
                  data-current={s.current || undefined}
                  data-active={i === active || undefined}
                  data-testid={`site-${s.code}`}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                >
                  <Glyph id={s.glyph ?? (playable ? 'ok' : 'offline')} />
                  <span className={styles.siteCode}>{s.code}</span>
                  <span className={styles.siteName}>
                    {s.name ?? s.kind}
                    <span className={styles.siteKind}>{s.kind}</span>
                  </span>
                  <span className={styles.siteStatus}>
                    {s.status}
                    {playable ? null : <span className={styles.siteReason}>{SITE_LOCKED}</span>}
                  </span>
                  {s.alertCount > 0 ? (
                    <span className={styles.siteAlerts}>
                      <Glyph id="danger" />
                      {s.alertCount}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
