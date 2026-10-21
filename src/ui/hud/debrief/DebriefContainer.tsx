import { projectionStore, session } from '@bridge/index';
import type { PhaseId } from '@bridge/index';
import { lazy, Suspense, useEffect } from 'react';
import { useStore } from 'zustand';
import { isPlainKey } from '../tabs/keys';
import type { Debrief, DebriefHandlers } from './Debrief';
import { collapseDebrief, debriefUi, isDebriefOpen, reopenDebrief } from './debrief-ui';

// Store-connected debrief for the HUD `overlay` slot: modal sheet while open, ready badge once collapsed (`B`
// reopens). `handlers` wires REPLAY / NEW SEED / EXPORT LOG; VIEW SITE (Esc) always collapses.
// The sheet itself (`Debrief.tsx` + its CSS, ≈ 2 KB gz) is a lazy chunk (8.1 F2, ARCHITECTURE §13.3): it is
// prefetched once the run reaches SAFING / SCRUBBED, so it is normally loaded before the debrief opens.

const loadSheet = (): Promise<{ default: typeof Debrief }> => import('./Debrief').then((m) => ({ default: m.Debrief }));
const LazyDebrief = lazy(loadSheet);

/** Phases from which the debrief is next: start fetching the sheet. */
const PREFETCH_FROM: ReadonlySet<PhaseId> = new Set<PhaseId>(['Safing', 'Scrubbed', 'Debrief']);

let prefetched: Promise<unknown> | null = null;
/** Starts loading the sheet chunk (idempotent; a failed fetch is retried by the next call). */
export function prefetchDebrief(): Promise<unknown> {
  prefetched ??= loadSheet().catch((e: unknown) => {
    prefetched = null;
    throw e;
  });
  return prefetched;
}

/** The app's session commands (GDD §13.2.3, AC 32) behind the exit actions. */
export const SESSION_DEBRIEF_HANDLERS: DebriefHandlers = {
  REPLAY: () => session.replaySameSeed(),
  NEW_SEED: () => session.newSeed(),
  EXPORT_LOG: () => session.exportLog(),
};

export function DebriefContainer({ handlers = SESSION_DEBRIEF_HANDLERS }: { handlers?: DebriefHandlers }) {
  const d = useStore(projectionStore, (p) => p.debrief);
  const near = useStore(projectionStore, (p) => p.clock.phase !== null && PREFETCH_FROM.has(p.clock.phase));
  const ui = useStore(debriefUi);
  const open = isDebriefOpen(d, ui);
  useEffect(() => {
    if (near || d) void prefetchDebrief().catch(() => undefined);
  }, [near, d]);
  useEffect(() => {
    if (!d || open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || !isPlainKey(e, 'b')) return;
      e.preventDefault();
      reopenDebrief();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [d, open]);
  if (!d) return null;
  // Collapsed: the DEBRIEF READY badge lives in the top bar (6.3 TopBar); `B` still reopens from here.
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <LazyDebrief
        d={d}
        handlers={{
          ...handlers,
          VIEW_SITE: () => {
            collapseDebrief(d);
            session.viewSite();
          },
        }}
      />
    </Suspense>
  );
}
