// Eager surface of the debrief (8.1 F2): container, badge and UI state. The sheet (`./Debrief`) is loaded on demand
// by the container; import it directly (tests, /design gallery), never re-export it here.
export { DebriefContainer, SESSION_DEBRIEF_HANDLERS, prefetchDebrief } from './DebriefContainer';
export { DebriefReadyBadge } from './ReadyBadge';
export * from './debrief-ui';
export type { DebriefHandlers, DebriefProps } from './Debrief';
