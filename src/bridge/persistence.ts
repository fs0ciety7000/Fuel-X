// Persistence port (8.3, ARCHITECTURE §10): autosave resume offer, export / import of save files. The app's
// PersistenceController is the only writer of the state below (except `menuOpen`, a UI intent); the HUD reads it and
// calls the port. Like `session`, a call is a no-op (counted as dropped) while the app has not bound its handlers.
import { createStore } from 'zustand/vanilla';

/** An unfinished autosaved run found at boot (texts are display-ready, formatted by the app). */
export interface ResumeOfferVM {
  seed: string;
  tClock: string;
  phase: string;
  /** Wall time of the autosave, `2026-10-21 14:22 UTC`. */
  savedAt: string;
  /** Why it was written: `MILESTONE ROAD CLOSURE`, `TAB HIDDEN`, … */
  reason: string;
}

export interface PersistenceStatusVM {
  state: 'ok' | 'danger';
  text: string;
}

export interface PersistenceState {
  /** Boot found an unfinished autosave: CONTINUE vs NEW RUN (the run is paused while this is set). */
  offer: ResumeOfferVM | null;
  /** SAVE · LOAD sheet open (UI intent: `Ctrl/⌘+S`, or any HUD control through `persistence.openMenu()`). */
  menuOpen: boolean;
  /** Export / import / continue in flight. */
  busy: boolean;
  /** Result of the last export / import (errors are explicit, never silent). */
  status: PersistenceStatusVM | null;
  /** `T-04:45:00 · 2026-10-21 14:22 UTC · MILESTONE`, or null before the first autosave of this page. */
  lastAutosave: string | null;
  /** Why autosave is off on this page (`DEMO RUN (AUTOPILOT)`, `STORAGE UNAVAILABLE`), null when on. */
  autosaveOff: string | null;
}

export function initialPersistenceState(): PersistenceState {
  return { offer: null, menuOpen: false, busy: false, status: null, lastAutosave: null, autosaveOff: null };
}

export const persistenceStore = createStore<PersistenceState>(() => initialPersistenceState());

export interface PersistenceHandlers {
  /** CONTINUE: load the offered autosave (the run resumes paused on its saved tick). */
  continueRun(): void;
  /** NEW RUN: drop the offer and run the fresh world the page booted (the autosave stays in the ring). */
  newRun(): void;
  /** EXPORT SAVE: download the current run as `.fuelx.json.gz` (plain `.fuelx.json` without CompressionStream). */
  exportSave(): void;
  /** IMPORT SAVE: validate, migrate and load a save file picked by the player. */
  importSave(file: Blob): void;
}

export interface PersistencePort extends PersistenceHandlers {
  openMenu(): void;
  closeMenu(): void;
  /** Composition root only. Returns the unbind function. */
  bind(handlers: PersistenceHandlers): () => void;
  readonly stats: { calls: number; dropped: number };
}

export function createPersistencePort(store = persistenceStore): PersistencePort {
  let h: PersistenceHandlers | null = null;
  const stats = { calls: 0, dropped: 0 };
  const call = <K extends keyof PersistenceHandlers>(k: K, ...args: Parameters<PersistenceHandlers[K]>): void => {
    if (!h) {
      stats.dropped++;
      return;
    }
    stats.calls++;
    (h[k] as (...a: Parameters<PersistenceHandlers[K]>) => void)(...args);
  };
  return {
    continueRun: () => call('continueRun'),
    newRun: () => call('newRun'),
    exportSave: () => call('exportSave'),
    importSave: (file) => call('importSave', file),
    openMenu: () => store.setState({ menuOpen: true, status: null }),
    closeMenu: () => store.setState({ menuOpen: false, status: null }),
    bind(next) {
      h = next;
      return () => {
        if (h === next) h = null;
      };
    },
    stats,
  };
}

/** The game's persistence port (one per page). */
export const persistence: PersistencePort = createPersistencePort();
