// Bridge between the app and the HUD (ADR 0004): Zustand stores + the command port. No React, no render, no app.
export type * from './projection-types';
export { commands, createCommandPort, createSessionPort, session } from './commands';
export type { CommandPort, CommandSink, RateStateVM, SessionHandlers, SessionPort } from './commands';
export { emptyProjection, missing } from './empty-projection';
export { DEFAULT_SITE_ID, initialViewState, projectionStore, view, viewStore } from './stores';
export type { CameraIntent, ViewState } from './stores';
export { createPersistencePort, initialPersistenceState, persistence, persistenceStore } from './persistence';
export type {
  PersistenceHandlers,
  PersistencePort,
  PersistenceState,
  PersistenceStatusVM,
  ResumeOfferVM,
} from './persistence';
