import type { GlyphId, Severity } from '../types';
import { cx, type DemoState } from './cx';
import { Glyph } from './Glyph';
import { HazardBand } from './HazardBand';
import styles from './Badge.module.css';

export interface BadgeProps {
  /** Static prefix, e.g. `RANGE`. */
  label: string;
  /** Live part, e.g. `GO`, `NO-GO`, or a count. */
  value: string;
  glyph: GlyphId;
  state: Severity | 'selected';
  /** Optional trailing note (`·2 NEW`). */
  note?: string;
  tooltip?: string;
  onClick?: () => void;
  live?: 'polite' | 'assertive' | 'off';
  demo?: DemoState;
  className?: string | undefined;
}

/** §6.4 / §6.5 status badge (RANGE GO / NO-GO, alert counter): a button carrying an `<output>`. */
export function Badge({
  label,
  value,
  glyph,
  state,
  note,
  tooltip,
  onClick,
  live = 'polite',
  demo,
  className,
}: BadgeProps) {
  const disabled = state === 'disabled';
  return (
    <button
      type="button"
      className={cx(styles.badge, className)}
      data-state={state}
      data-demo={demo}
      aria-disabled={disabled || undefined}
      // The text sits in an <output>, which does not name the button: spell it out (RANGE MARGINAL, 2 ALERTS · 1 NEW).
      aria-label={[label, value, note].filter(Boolean).join(' ')}
      title={tooltip}
      onClick={disabled ? undefined : onClick}
    >
      {state === 'danger' ? <HazardBand /> : null}
      <Glyph id={glyph} />
      <output className={styles.output} aria-live={live}>
        {label} <span className={/^\d+$/.test(value) ? styles.count : undefined}>{value}</span>
        {note ? ` ${note}` : null}
      </output>
    </button>
  );
}
