import { useId, type ReactNode } from 'react';
import type { MetricVM } from '../types';
import { Glyph } from './Glyph';
import { Sparkline } from './Sparkline';
import { Value } from './Value';
import styles from './MetricTile.module.css';

export interface MetricTileProps {
  metric: MetricVM;
  /** Hide the sparkline (compact mode) even when a series exists. */
  noSpark?: boolean;
  /** Extra content under the value (sub-line, segmented bar). */
  children?: ReactNode;
  className?: string;
}

/** §6.8 metric tile: label / hero value / optional sparkline. Warn = accent frame, danger = accent label strip. */
export function MetricTile({ metric, noSpark = false, children, className }: MetricTileProps) {
  const id = useId();
  const { state } = metric;
  return (
    <div
      role="group"
      aria-labelledby={id}
      className={[styles.tile, className].filter(Boolean).join(' ')}
      data-state={state}
    >
      <dl className={styles.dl}>
        <dt id={id} className={styles.label}>
          {state === 'warn' || state === 'danger' ? <Glyph id={state} /> : null}
          {metric.label}
        </dt>
        <dd className={styles.value}>
          <Value v={metric.value} />
        </dd>
      </dl>
      {children || (metric.series && !noSpark) ? (
        <div className={styles.extra}>
          {children}
          {metric.series && !noSpark ? (
            <Sparkline
              series={metric.series}
              label={metric.seriesLabel ?? metric.label}
              stale={metric.value.stale === true}
              {...(metric.threshold !== undefined ? { threshold: metric.threshold } : {})}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
