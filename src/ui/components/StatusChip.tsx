import type { GlyphId, Severity } from '../types';
import { cx } from './cx';
import { Glyph } from './Glyph';
import { HazardBand } from './HazardBand';
import styles from './StatusChip.module.css';

export type ChipState = Severity | 'selected';

export interface StatusChipProps {
  glyph: GlyphId;
  label: string;
  state: ChipState;
  meta?: string | null;
  full?: boolean;
  /** `status` for the inspector's live chip; plain span in rows. */
  live?: boolean;
  className?: string | undefined;
}

/** §6.12 status chip: glyph + uppercase word; treatment per §2.3 (warn = orange line, danger = orange mass). */
export function StatusChip({ glyph, label, state, meta, full = false, live = false, className }: StatusChipProps) {
  return (
    <span
      className={cx(styles.chip, full && styles.full, className)}
      data-state={state}
      role={live ? 'status' : undefined}
    >
      {state === 'danger' ? <HazardBand /> : null}
      <Glyph id={glyph} />
      <span className={styles.text}>{label}</span>
      {meta ? <span className={styles.meta}>{meta}</span> : null}
    </span>
  );
}
