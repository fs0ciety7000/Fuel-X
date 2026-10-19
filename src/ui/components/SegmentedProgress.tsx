import type { SegmentsVM } from '../types';
import styles from './Progress.module.css';

const MAX_CELLS = 12;

/** §6.9 segmented progress: `3 OF 5 ■■■□□`; one optional in-work cell in accent with ink border. */
export function SegmentedProgress({ seg, showText = true }: { seg: SegmentsVM; showText?: boolean }) {
  // Above 12 units the bar compresses to ≤ 11 cells of `group` units (engines 33 → 11 × 3, §6.9).
  const group = seg.max > MAX_CELLS ? Math.ceil(seg.max / 11) : 1;
  const n = Math.ceil(seg.max / group);
  const cells = Array.from({ length: n }, (_, i) => {
    const lo = i * group;
    const units = Math.min(group, seg.max - lo);
    const filled = Math.min(units, Math.max(0, seg.value - lo));
    if (seg.current !== undefined && seg.current >= lo && seg.current < lo + units) return 'current';
    return filled >= units ? 'on' : filled > 0 ? 'part' : 'off';
  });
  return (
    <span className={styles.segmented}>
      {showText ? (
        <span className={styles.text} aria-hidden="true">
          {seg.value} OF {seg.max}
        </span>
      ) : null}
      <meter className={styles.sr} min={0} max={seg.max} value={seg.value} aria-label={seg.label}>
        {seg.value} OF {seg.max}
      </meter>
      <span className={styles.cells} aria-hidden="true">
        {cells.map((fill, i) => (
          <span key={i} className={styles.cell} data-fill={fill} />
        ))}
      </span>
    </span>
  );
}
