import { useEffect, useState } from 'react';
import { projectionStore } from '@bridge/index';
import { activePhase, STAMP_MS, STAMP_REDUCED_MS, stampFor, type StampVM } from './stamp';
import styles from './PhaseStamp.module.css';

/** §6.26 plate: `[ PHASE 05 / 08 ]` + macro word, ink on paper, 2 px ink frame. `aria-hidden`: the countdown announces. */
export function PhaseStampView({ stamp, still = false }: { stamp: StampVM; still?: boolean }) {
  return (
    <div className={styles.stamp} data-still={still || undefined} aria-hidden="true" data-testid="phase-stamp">
      <span className={styles.head}>[ {stamp.header} ]</span>
      <span className={styles.word}>{stamp.label}</span>
    </div>
  );
}

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** Live stamp: subscribes to the projection, prints on each running phase change, cuts after 640 ms (1 s still). */
export function PhaseStamp() {
  const [stamp, setStamp] = useState<StampVM | null>(null);
  useEffect(() => {
    let prev = activePhase(projectionStore.getState().countdown);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = projectionStore.subscribe((p) => {
      const next = activePhase(p.countdown);
      const s = stampFor(prev, next, !p.timeScale.paused && p.timeScale.effective > 0);
      prev = next;
      if (!s) return;
      if (timer) clearTimeout(timer);
      setStamp(s);
      timer = setTimeout(() => setStamp(null), reducedMotion() ? STAMP_REDUCED_MS : STAMP_MS);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, []);
  return stamp ? <PhaseStampView key={stamp.id} stamp={stamp} still={reducedMotion()} /> : null;
}
