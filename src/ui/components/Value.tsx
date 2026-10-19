import type { ValueVM } from '../types';
import { cx } from './cx';
import styles from './Value.module.css';

export const MISSING = '—';

/** §6.36 value cell: `<data value={SI}>` + unit, fixed slot, `—` when missing, hatch when stale. */
export function Value({ v, className }: { v: ValueVM; className?: string | undefined }) {
  const missing = v.value === null && v.text === '';
  const text = missing ? MISSING : v.text;
  return (
    <span
      className={cx(styles.value, v.stale && styles.stale, className)}
      aria-description={v.stale ? 'stale' : undefined}
    >
      <data
        className={styles.digits}
        value={v.value === null ? '' : String(v.value)}
        style={v.width ? { minWidth: `${v.width}ch` } : undefined}
      >
        {text}
      </data>
      {v.unit && !missing ? <span className={styles.unit}>{v.unit}</span> : null}
    </span>
  );
}

/** Shorthand used by fixtures and tests. */
export const val = (text: string, value: number | null, unit?: string, extra: Partial<ValueVM> = {}): ValueVM => ({
  text,
  value,
  ...(unit ? { unit } : {}),
  ...extra,
});
