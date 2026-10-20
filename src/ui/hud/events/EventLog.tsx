import { useState } from 'react';
import { Glyph, SegmentedControl } from '../../components';
import type { EventVM, GlyphId, Severity } from '../../types';
import styles from './events.module.css';

// §6.23 log lines for the Events tab (review / causality): `<time>` + glyph + entity code (link) + message, newest
// first, never truncated mid-number. The severity filter is local view state.

export type EventFilter = 'all' | 'warn' | 'danger';

const RANK: Record<Severity, number> = { disabled: 0, neutral: 0, info: 1, active: 1, ok: 1, warn: 2, danger: 3 };

/** Rows at or above the filter's severity. Pure, exported for tests. */
export function filterEvents(events: readonly EventVM[], filter: EventFilter): EventVM[] {
  if (filter === 'all') return events as EventVM[];
  const min = filter === 'warn' ? 2 : 3;
  return events.filter((e) => RANK[e.state] >= min);
}

const GLYPH: Record<Severity, GlyphId> = {
  neutral: 'idle',
  info: 'pending',
  ok: 'ok',
  active: 'current',
  warn: 'warn',
  danger: 'danger',
  disabled: 'offline',
};

/** Glyph of a row: the projected one, except warn / danger always print their triangle (§2.3). */
export const eventGlyph = (e: EventVM): GlyphId =>
  e.state === 'warn' || e.state === 'danger' ? e.state : (e.glyph ?? GLYPH[e.state]);

export interface EventLogProps {
  events: readonly EventVM[];
  onSelect?: (entityId: string) => void;
  /** Controlled filter (gallery); otherwise local. */
  filter?: EventFilter;
  /** Rows rendered at most (the projection keeps ≤ 200). */
  limit?: number;
}

export function EventLog({ events, onSelect, filter: forced, limit = 200 }: EventLogProps) {
  const [own, setOwn] = useState<EventFilter>('all');
  const filter = forced ?? own;
  const rows = filterEvents(events, filter).slice(0, limit);
  return (
    <div className={styles.log}>
      <div className={styles.toolbar}>
        <SegmentedControl<EventFilter>
          label="Event severity"
          value={filter}
          onChange={setOwn}
          options={[
            { value: 'all', label: 'ALL' },
            { value: 'warn', label: 'WARN +' },
            { value: 'danger', label: 'DANGER' },
          ]}
        />
        <span className={styles.count}>{rows.length} EVENTS</span>
      </div>
      {rows.length === 0 ? (
        <p className={styles.empty}>NO EVENTS</p>
      ) : (
        <ol className={styles.lines} aria-label="Event log">
          {rows.map((e) => (
            <li key={e.id} className={styles.line} data-state={e.state}>
              <samp className={styles.samp}>
                <time className={styles.time}>{e.time}</time>
                <Glyph id={eventGlyph(e)} label={e.state.toUpperCase()} />
                {e.entityId && onSelect ? (
                  <button type="button" className={styles.entity} onClick={() => onSelect(e.entityId as string)}>
                    {e.entityCode ?? e.entityId}
                  </button>
                ) : (
                  <span className={styles.entityStatic}>{e.entityCode ?? ''}</span>
                )}
                <span className={styles.message}>
                  {e.message}
                  {e.tClock ? <span className={styles.tclock}> · {e.tClock}</span> : null}
                </span>
              </samp>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
