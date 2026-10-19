// Debug hooks are on in dev builds or with `?debug=1` (ARCHITECTURE §9: perf-audit runs on production builds).
export function debugEnabled(search: string = typeof location === 'undefined' ? '' : location.search): boolean {
  return import.meta.env.DEV || new URLSearchParams(search).get('debug') === '1';
}

/** `?lowfx=1` (with debug hooks): low-cost visuals for software GL runs (e2e smoke paths, not screenshots). */
export function lowFxRequested(search: string = typeof location === 'undefined' ? '' : location.search): boolean {
  return new URLSearchParams(search).get('lowfx') === '1';
}
