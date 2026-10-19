import type { SegmentsVM } from '../types';
import styles from './Progress.module.css';

/** §6.9 segmented progress: `3 OF 5 ■■■□□`; one optional in-work cell in accent with ink border. */
export function SegmentedProgress({ seg, showText = true }: { seg: SegmentsVM; showText?: boolean }) {
  const cells = Array.from({ length: seg.max }, (_, i) =>
    i === seg.current ? 'current' : i < seg.value ? 'on' : 'off',
  );
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
