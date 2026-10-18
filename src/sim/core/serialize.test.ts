import { describe, expect, it } from 'vitest';
import { canonicalStringify, deserializeWorld, hashWorld, serializeWorld } from './serialize';
import { createWorld } from './world';
import { createCountdown } from '../systems/countdown';
import { advance } from '../step';

describe('canonicalStringify', () => {
  it('sorts keys recursively and keeps array order', () => {
    expect(canonicalStringify({ b: 1, a: { d: [3, 1], c: null } })).toBe('{"a":{"c":null,"d":[3,1]},"b":1}');
    expect(canonicalStringify({ x: 1, y: 2 })).toBe(canonicalStringify({ y: 2, x: 1 }));
  });

  it.each([
    ['undefined', { a: undefined }],
    ['NaN', { a: Number.NaN }],
    ['Infinity', [Number.POSITIVE_INFINITY]],
    ['Map', { m: new Map() }],
    ['Set', { s: new Set() }],
    ['function', { f: () => 1 }],
    ['class instance', { d: new Date(0) }],
  ])('rejects %s', (_name, value) => {
    expect(() => canonicalStringify(value)).toThrow(/canonicalStringify/);
  });
});

function worldWithCountdown(seed = 3) {
  const w = createWorld({ seed });
  createCountdown(w, {
    flightName: 'LC-1 FLIGHT 7',
    siteId: 'LC-1',
    contractId: 'NRL-3',
    boosterId: 'e000001',
    shipId: 'e000002',
    padId: 'e000003',
  });
  return w;
}

describe('world serialization', () => {
  it('round-trips to an identical canonical form and hash', () => {
    const w = worldWithCountdown();
    advance(w, 500);
    const json = serializeWorld(w);
    const back = deserializeWorld(json);
    expect(serializeWorld(back)).toBe(json);
    expect(hashWorld(back)).toBe(hashWorld(w));
    expect(hashWorld(w)).toMatch(/^[0-9a-f]{32}$/);
  });

  it('hash ignores key insertion order but sees any value change', () => {
    const w = worldWithCountdown();
    const reordered = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(w).reverse()))) as typeof w;
    expect(hashWorld(reordered)).toBe(hashWorld(w));
    reordered.economy.moneyCr += 1;
    expect(hashWorld(reordered)).not.toBe(hashWorld(w));
  });

  it('is stable for a fixed seed and tick count', () => {
    const a = worldWithCountdown(11);
    const b = worldWithCountdown(11);
    advance(a, 1_000);
    advance(b, 1_000);
    expect(hashWorld(a)).toBe(hashWorld(b));
    expect(hashWorld(worldWithCountdown(12))).not.toBe(hashWorld(worldWithCountdown(11)));
  });

  it('save at K, load, run M ≡ run K+M straight', () => {
    const straight = worldWithCountdown();
    advance(straight, 3_000);
    const first = worldWithCountdown();
    advance(first, 1_200);
    const loaded = deserializeWorld(serializeWorld(first));
    advance(loaded, 1_800);
    expect(hashWorld(loaded)).toBe(hashWorld(straight));
  });

  it('rejects other schemas and malformed input', () => {
    const w = createWorld({ seed: 1 });
    expect(() => deserializeWorld(JSON.stringify({ ...w, schema: 999 }))).toThrow(/schema/);
    expect(() => deserializeWorld('[]')).toThrow();
    expect(() => deserializeWorld(JSON.stringify({ schema: 1 }))).toThrow(/missing/);
  });
});
