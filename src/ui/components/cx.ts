/** Joins truthy class names. */
export const cx = (...names: (string | false | null | undefined)[]): string => names.filter(Boolean).join(' ');

/** Forced interaction state, only for the `/design` gallery (renders `data-demo`). */
export type DemoState = 'hover' | 'focus' | 'pressed';
