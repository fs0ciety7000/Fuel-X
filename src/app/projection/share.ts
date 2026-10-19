// Structural sharing for the projection (ADR 0004): returns `prev` (or prev's sub-objects) wherever `next` is
// deep-equal, so unchanged rows / cards keep object identity and `useStore(…, shallow)` selectors bail out. Plain
// JSON data only (objects, arrays, primitives). One pass over the new tree per projection (≤ 10 Hz). `next` is
// mutated in place (children replaced by their shared twins); frozen inputs are only written when a child differs.

type Json = unknown;

export function share<T>(prev: T | null | undefined, next: T): T {
  return shareAny(prev, next) as T;
}

function shareAny(prev: Json, next: Json): Json {
  if (Object.is(prev, next)) return prev;
  if (prev === null || next === null || typeof prev !== 'object' || typeof next !== 'object') return next;
  if (Array.isArray(next)) {
    if (!Array.isArray(prev)) return next;
    return shareArray(prev, next);
  }
  if (Array.isArray(prev)) return next;
  return shareObject(prev as Record<string, Json>, next as Record<string, Json>);
}

function shareArray(prev: readonly Json[], next: Json[]): Json[] | readonly Json[] {
  // Rows with an `id`/`key` are matched by identity key (lists insert / remove rows), others by index.
  const keyed = next.length > 0 && prev.length > 0 && rowKey(next[0]) !== null && rowKey(prev[0]) !== null;
  let byKey: Map<string, Json> | null = null;
  if (keyed) {
    byKey = new Map();
    for (const p of prev) {
      const k = rowKey(p);
      if (k !== null) byKey.set(k, p);
    }
  }
  let same = prev.length === next.length;
  for (let i = 0; i < next.length; i++) {
    const k = keyed ? rowKey(next[i]) : null;
    const p = k !== null && byKey ? byKey.get(k) : prev[i];
    const v = shareAny(p, next[i]);
    if (v !== next[i]) next[i] = v;
    if (v !== prev[i]) same = false;
  }
  return same ? prev : next;
}

function rowKey(x: Json): string | null {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as { id?: unknown; key?: unknown };
  if (typeof o.id === 'string') return o.id;
  if (typeof o.key === 'number' || typeof o.key === 'string') return String(o.key);
  return null;
}

function shareObject(prev: Record<string, Json>, next: Record<string, Json>): Record<string, Json> {
  let same = true;
  let n = 0;
  for (const k in next) {
    n++;
    const v = shareAny(prev[k], next[k]);
    if (v !== next[k]) next[k] = v;
    if (v !== prev[k]) same = false;
  }
  if (same) {
    let m = 0;
    for (const _ in prev) m++;
    if (m !== n) same = false;
  }
  return same ? prev : next;
}
