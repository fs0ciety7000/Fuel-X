import type { DeadlineVM } from '../types';
import { Glyph } from './Glyph';
import { Value } from './Value';
import styles from './DeadlineBar.module.css';

/** §6.30 deadline bar: remaining share shrinks right→left; warn = accent frame; danger = accent fill + ink cap. */
export function DeadlineBar({ d }: { d: DeadlineVM }) {
  const frac = Math.min(1, Math.max(0, d.fraction));
  const expired = d.remaining.value !== null && d.remaining.value <= 0;
  const pct = Math.round(frac * 1000) / 10;
  return (
    <div
      role="group"
      aria-label={`${d.label} ${d.at}`}
      className={styles.deadline}
      data-state={d.state}
      data-expired={expired || undefined}
    >
      <span className={styles.label}>
        {d.state === 'warn' || d.state === 'danger' ? <Glyph id={d.state} /> : null}
        {d.label}
        <time className={styles.at}>{d.at}</time>
        {d.held ? <span className={styles.tag}>HELD</span> : null}
        {expired ? <span className={styles.tag}>EXPIRED</span> : null}
      </span>
      <output className={styles.remaining}>
        <Value v={d.remaining} />
      </output>
      <progress className={styles.sr} max={1} value={frac} aria-label={`${d.label}, remaining`}>
        {pct} %
      </progress>
      <div className={styles.track} aria-hidden="true">
        <div className={styles.fill} style={{ width: `${pct}%` }} />
        {d.marker !== undefined ? <div className={styles.marker} style={{ left: `${d.marker * 100}%` }} /> : null}
      </div>
    </div>
  );
}
