import { cx } from './cx';
import styles from './Sparkline.module.css';

const W = 120;
const H = 20;
const PAD = 2;

export interface SparklineProps {
  series: readonly (number | null)[];
  label: string;
  /** Fixed domain; defaults to the series min/max. */
  min?: number;
  max?: number;
  threshold?: number;
  stale?: boolean;
  className?: string | undefined;
}

/** Polyline segments split at null gaps, in the 120×20 box. Pure, exported for tests. */
export function sparkPaths(
  series: readonly (number | null)[],
  min?: number,
  max?: number,
): { paths: string[]; last: [number, number] | null; y: (v: number) => number } {
  const nums = series.filter((v): v is number => v !== null && Number.isFinite(v));
  const lo = min ?? (nums.length ? Math.min(...nums) : 0);
  const hiRaw = max ?? (nums.length ? Math.max(...nums) : 1);
  const hi = hiRaw === lo ? lo + 1 : hiRaw;
  const step = series.length > 1 ? W / (series.length - 1) : 0;
  const y = (v: number): number => {
    const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
    return +(H - PAD - t * (H - 2 * PAD)).toFixed(2);
  };
  const paths: string[] = [];
  let cur: string[] = [];
  let last: [number, number] | null = null;
  series.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      if (cur.length) paths.push(cur.join(' '));
      cur = [];
      return;
    }
    const pt: [number, number] = [+(i * step).toFixed(2), y(v)];
    cur.push(`${pt[0]},${pt[1]}`);
    last = pt;
  });
  if (cur.length) paths.push(cur.join(' '));
  return { paths, last, y };
}

/** §6.8 sparkline: 1 px ink polyline, ink-5 baseline, 3 px last-point square, dashed ink-4 threshold. No fill. */
export function Sparkline({ series, label, min, max, threshold, stale, className }: SparklineProps) {
  const { paths, last, y } = sparkPaths(series, min, max);
  const empty = stale || paths.length === 0;
  return (
    <svg
      className={cx(styles.spark, empty && styles.empty, className)}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={empty ? `${label}, no data` : label}
    >
      <line className={styles.base} x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} vectorEffect="non-scaling-stroke" />
      {threshold !== undefined && !empty ? (
        <line
          className={styles.threshold}
          x1="0"
          x2={W}
          y1={y(threshold)}
          y2={y(threshold)}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {!empty
        ? paths.map((d, i) => <polyline key={i} className={styles.line} points={d} vectorEffect="non-scaling-stroke" />)
        : null}
      {!empty && last ? (
        <rect className={styles.last} x={last[0] - 1.5} y={last[1] - 1.5} width="3" height="3" />
      ) : null}
    </svg>
  );
}
