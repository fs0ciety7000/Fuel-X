import type { GlyphId } from '../types';
import { cx, type DemoState } from './cx';
import { Glyph } from './Glyph';
import { HazardBand } from './HazardBand';
import styles from './LabelTag.module.css';

export type TagState = 'default' | 'selected' | 'alert' | 'selected-alert' | 'disabled';

export interface LabelTagProps {
  callSign: string;
  glyph: GlyphId;
  state?: TagState;
  /** Accessible name for the button form, e.g. `B-09, booster, ascent`. */
  description?: string;
  onSelect?: () => void;
  demo?: DemoState;
  className?: string | undefined;
}

/** §6.20 / §6.35 label tag. Button when selectable, span when static (inline mentions). */
export function LabelTag({
  callSign,
  glyph,
  state = 'default',
  description,
  onSelect,
  demo,
  className,
}: LabelTagProps) {
  const alert = state === 'alert' || state === 'selected-alert';
  const body = (
    <>
      <Glyph id={alert ? 'danger' : glyph} />
      <span className={styles.text}>{callSign}</span>
      {state === 'selected-alert' ? <HazardBand /> : null}
    </>
  );
  if (!onSelect) {
    return (
      <span className={cx(styles.tag, className)} data-state={state} data-demo={demo}>
        {body}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={cx(styles.tag, className)}
      data-state={state}
      data-demo={demo}
      aria-label={description ?? callSign}
      aria-pressed={state === 'selected' || state === 'selected-alert'}
      aria-disabled={state === 'disabled' || undefined}
      onClick={state === 'disabled' ? undefined : onSelect}
    >
      {body}
    </button>
  );
}
