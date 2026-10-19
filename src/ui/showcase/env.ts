// Hydration-safe environment reads: the prerendered HTML (ADR 0009) is produced with the server snapshots, so the first
// client render matches it and the real values arrive in the commit right after hydration.
import { useSyncExternalStore } from 'react';

const noop = (): (() => void) => () => undefined;

/** False on the server and during hydration, true afterwards. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

const REDUCED = '(prefers-reduced-motion: reduce)';

function subscribeReduced(fn: () => void): () => void {
  const media = window.matchMedia(REDUCED);
  media.addEventListener('change', fn);
  return () => media.removeEventListener('change', fn);
}

/** `prefers-reduced-motion: reduce`; false on the server. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

/** Root-relative public URL under Vite's base path (ADR 0008: host-agnostic). */
export function publicUrl(path: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\//, '')}`;
}
