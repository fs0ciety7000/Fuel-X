import styles from './live.module.css';

// DESIGN_SYSTEM §8 live regions: one polite (phase changes, range status, poll result, rate changes), one assertive
// (danger only). Written imperatively (no React state), throttled to one announcement per 2 s; messages that
// arrive inside the window are merged into the next one.

export type LiveLevel = 'polite' | 'assertive';

export const LIVE_IDS: Record<LiveLevel, string> = { polite: 'fx-live-polite', assertive: 'fx-live-assertive' };
export const LIVE_THROTTLE_MS = 2000;

interface Channel {
  last: number;
  queue: string[];
  timer: ReturnType<typeof setTimeout> | null;
}

/** Pure merge/throttle state machine (unit-tested): returns what to write now, or null to wait. */
export function createAnnouncer(
  write: (level: LiveLevel, text: string) => void,
  now: () => number,
  schedule: (fn: () => void, ms: number) => ReturnType<typeof setTimeout> = setTimeout,
) {
  const ch: Record<LiveLevel, Channel> = {
    polite: { last: -Infinity, queue: [], timer: null },
    assertive: { last: -Infinity, queue: [], timer: null },
  };
  const flush = (level: LiveLevel): void => {
    const c = ch[level];
    c.timer = null;
    if (c.queue.length === 0) return;
    const text = [...new Set(c.queue)].join('. ');
    c.queue = [];
    c.last = now();
    write(level, text);
  };
  return (text: string, level: LiveLevel = 'polite'): void => {
    if (!text) return;
    const c = ch[level];
    c.queue.push(text);
    const wait = c.last + LIVE_THROTTLE_MS - now();
    if (wait <= 0 && c.timer === null) flush(level);
    else if (c.timer === null) c.timer = schedule(() => flush(level), Math.max(0, wait));
  };
}

const writeDom = (level: LiveLevel, text: string): void => {
  const el = typeof document === 'undefined' ? null : document.getElementById(LIVE_IDS[level]);
  if (el) el.textContent = text;
};

/** Announce in the HUD live regions (no-op when the HUD is not mounted). */
export const announce = createAnnouncer(writeDom, () =>
  typeof performance === 'undefined' ? Date.now() : performance.now(),
);

/** Mount once inside the HUD root. */
export function LiveRegions() {
  return (
    <div className={styles.sr}>
      <div id={LIVE_IDS.polite} aria-live="polite" aria-atomic="true" data-testid="live-polite" />
      <div id={LIVE_IDS.assertive} aria-live="assertive" aria-atomic="true" data-testid="live-assertive" />
    </div>
  );
}
