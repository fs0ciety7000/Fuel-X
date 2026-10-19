// React commit counter for `__fuelx.stats().reactCommitsPerS` (perf-audit: ≤ 12 commits/s, 0 scene commits/s
// while nothing spawns). React (DOM and the R3F reconciler) reports every commit to the DevTools global hook, also in
// production builds, so a minimal hook counts commits of both roots. Must be imported before react-dom; installed
// only when debug hooks are enabled, and it chains to a real DevTools hook when one is present.
import { debugEnabled } from './enabled';

const WINDOW_MS = 1000;
const stamps: number[] = [];

function record(): void {
  const now = performance.now();
  stamps.push(now);
  while (stamps.length > 0 && (stamps[0] ?? now) < now - WINDOW_MS * 5) stamps.shift();
}

/** Commits in the last second (both React roots). */
export function reactCommitsPerS(): number {
  const now = performance.now();
  let n = 0;
  for (let i = stamps.length - 1; i >= 0 && (stamps[i] ?? 0) >= now - WINDOW_MS; i--) n++;
  return n;
}

/** Total commits recorded so far (window-limited history). */
export function reactCommitLog(): readonly number[] {
  return stamps;
}

interface DevtoolsHook {
  isDisabled?: boolean;
  supportsFiber?: boolean;
  renderers?: Map<number, unknown>;
  inject?: (internals: unknown) => number;
  onCommitFiberRoot?: (...args: unknown[]) => void;
  onCommitFiberUnmount?: (...args: unknown[]) => void;
  onPostCommitFiberRoot?: (...args: unknown[]) => void;
  checkDCE?: () => void;
}

type HookWindow = Window & { __REACT_DEVTOOLS_GLOBAL_HOOK__?: DevtoolsHook };

function install(): void {
  const w = window as HookWindow;
  const existing = w.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (existing) {
    const original = existing.onCommitFiberRoot?.bind(existing);
    existing.onCommitFiberRoot = (...args: unknown[]) => {
      record();
      original?.(...args);
    };
    return;
  }
  let nextId = 1;
  w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    isDisabled: false,
    supportsFiber: true,
    renderers: new Map(),
    inject: () => nextId++,
    onCommitFiberRoot: record,
    onCommitFiberUnmount: () => undefined,
    onPostCommitFiberRoot: () => undefined,
    checkDCE: () => undefined,
  };
}

if (typeof window !== 'undefined' && debugEnabled()) install();
