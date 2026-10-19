import type { ProgressVM } from '../types';
import { Value } from './Value';
import styles from './Progress.module.css';

/** §6.10 linear progress: label + value, 6 px bar (ink; hazard tone = accent fill with ink end-cap). */
export function LinearProgress({ p }: { p: ProgressVM }) {
  const pct = Math.round(Math.min(1, Math.max(0, p.fraction)) * 1000) / 10;
  return (
    <div className={styles.linear} data-tone={p.tone} data-stale={p.value.stale ? 'true' : undefined}>
      <div className={styles.row}>
        <span>{p.label}</span>
        <Value v={p.value} />
      </div>
      <progress className={styles.sr} max={1} value={p.fraction} aria-label={p.label}>
        {p.value.text}
      </progress>
      <div className={styles.track} aria-hidden="true">
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
