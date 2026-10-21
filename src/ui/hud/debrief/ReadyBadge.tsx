import { Glyph } from '../../components';
import styles from './ReadyBadge.module.css';

/** Collapsed state: the `[■ DEBRIEF READY B]` badge that reopens the sheet (eager: the top bar renders it). */
export function DebriefReadyBadge({ onOpen, inline = false }: { onOpen: () => void; inline?: boolean }) {
  const button = (
    <button type="button" className={styles.ready} onClick={onOpen} data-testid="debrief-ready" aria-keyshortcuts="B">
      <Glyph id="parked" />
      DEBRIEF READY
      <kbd className={styles.kbd} aria-hidden="true">
        B
      </kbd>
    </button>
  );
  // `inline`: a top-bar cell (§6.29 VIEW SITE collapses the sheet to a badge in the top bar).
  return inline ? button : <div className={styles.readyWrap}>{button}</div>;
}
