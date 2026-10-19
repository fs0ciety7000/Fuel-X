// Bridge between the app and the HUD (ADR 0004): Zustand stores + the command port. No React, no render, no app.
export type * from './projection-types';
export { commands, createCommandPort } from './commands';
export type { CommandPort, CommandSink } from './commands';
export { emptyProjection, missing } from './empty-projection';
export { DEFAULT_SITE_ID, initialViewState, projectionStore, view, viewStore } from './stores';
export type { CameraIntent, ViewState } from './stores';
