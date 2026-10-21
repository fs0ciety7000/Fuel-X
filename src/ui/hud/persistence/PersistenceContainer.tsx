import { persistence, persistenceStore } from '@bridge/index';
import type { PersistenceState } from '@bridge/index';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useStore } from 'zustand';

// Eager part of the 8.3 persistence UI (8.1 F2, ARCHITECTURE §10): the `Ctrl/⌘+S` key and a latch. The resume offer
// and the SAVE · LOAD sheet (`Persistence.tsx` + CSS) are a lazy chunk fetched the first time either is wanted and
// kept mounted afterwards, so closing a dialog behaves exactly as before (the §6.27 `Dialog` closes itself).

const LazyDialogs = lazy(() => import('./Persistence').then((m) => ({ default: m.PersistenceDialogs })));

/** `Ctrl/⌘+S` opens the SAVE · LOAD sheet (the browser's "save page" is pre-empted on /play). */
export function isSaveMenuKey(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's';
}

/** A persistence dialog has to be on screen (boot offer or the sheet): load the dialogs chunk. */
export const wantsPersistenceDialogs = (p: Pick<PersistenceState, 'offer' | 'menuOpen'>): boolean =>
  p.offer !== null || p.menuOpen;

/** Connected: resume offer + SAVE · LOAD sheet (mounted in the overlay slot). */
export function PersistenceContainer() {
  const wanted = useStore(persistenceStore, wantsPersistenceDialogs);
  const blocked = useStore(persistenceStore, (p) => p.offer !== null);
  const [mounted, setMounted] = useState(wanted);
  if (wanted && !mounted) setMounted(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!isSaveMenuKey(e)) return;
      e.preventDefault();
      if (!blocked) persistence.openMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [blocked]);

  return mounted ? (
    <Suspense fallback={null}>
      <LazyDialogs />
    </Suspense>
  ) : null;
}
