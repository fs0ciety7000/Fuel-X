// Story progress driver (ADR 0009): CSS `position: sticky` pins the stage; this passive, rAF-batched scroll listener
// turns the dossier's scroll position into p ∈ [0, 1] for the stage (read per frame) and the HUD fragments (notified
// per change). No scroll hijack, no React state at frame rate.
import type { StoryFeed } from '@data/showcase';

export interface StoryDriver extends StoryFeed {
  /** Measure `el` (the dossier sheets container) on scroll/resize. Returns the detach function. */
  attach(el: HTMLElement): () => void;
  /** Set p directly (tests, reduced-motion jumps). */
  set(p: number): void;
}

export function createStory(): StoryDriver {
  let p = 0;
  const listeners = new Set<() => void>();
  const set = (next: number): void => {
    const clamped = Math.min(1, Math.max(0, next));
    if (clamped === p) return;
    p = clamped;
    for (const fn of listeners) fn();
  };
  return {
    get p() {
      return p;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    set,
    attach(el) {
      let frame = 0;
      const measure = (): void => {
        frame = 0;
        const rect = el.getBoundingClientRect();
        // 0 when the first sheet's top reaches the middle of the viewport, 1 when the last sheet's bottom does.
        const mid = window.innerHeight / 2;
        set((mid - rect.top) / Math.max(1, rect.height));
      };
      const schedule = (): void => {
        if (frame === 0) frame = requestAnimationFrame(measure);
      };
      window.addEventListener('scroll', schedule, { passive: true });
      window.addEventListener('resize', schedule);
      measure();
      return () => {
        window.removeEventListener('scroll', schedule);
        window.removeEventListener('resize', schedule);
        if (frame !== 0) cancelAnimationFrame(frame);
      };
    },
  };
}
