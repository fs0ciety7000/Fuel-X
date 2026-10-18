import { describe, expect, it } from 'vitest';
import { RNG_STREAMS, rng, rngFromState, seedAllStreams, seedStream, sfc32Next } from './rng';
import type { RngState } from './rng';
import { createWorld } from './world';

/** Reference sfc32 (Chris Doty-Humphrey's algorithm as commonly published for JS). */
function referenceSfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return t >>> 0;
  };
}

describe('sfc32', () => {
  it('matches the reference algorithm', () => {
    const state: RngState = [0x9e3779b9, 0x243f6a88, 0xb7e15162, 0x12345678];
    const ref = referenceSfc32(...state);
    for (let i = 0; i < 1_000; i++) expect(sfc32Next(state)).toBe(ref());
  });

  it('keeps the state as unsigned 32-bit integers (JSON-safe)', () => {
    const s = seedStream(1, 'weather');
    for (let i = 0; i < 100; i++) sfc32Next(s);
    for (const w of s) {
      expect(Number.isInteger(w)).toBe(true);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('seeded streams', () => {
  it('same seed + stream → same sequence; pinned first values', () => {
    const a = rngFromState(seedStream(42, 'weather'));
    const b = rngFromState(seedStream(42, 'weather'));
    const seqA = Array.from({ length: 5 }, () => a.u32());
    const seqB = Array.from({ length: 5 }, () => b.u32());
    expect(seqA).toEqual(seqB);
    // Pinned so an accidental change to seeding/warm-up shows up as a determinism break.
    expect(seqA).toMatchInlineSnapshot(`
      [
        1213961422,
        420718133,
        3463412619,
        1541327090,
        2375532663,
      ]
    `);
  });

  it('different seeds and different streams diverge', () => {
    const first = (seed: number, stream: string): number => rngFromState(seedStream(seed, stream)).u32();
    expect(first(1, 'weather')).not.toBe(first(2, 'weather'));
    expect(first(1, 'weather')).not.toBe(first(1, 'anomaly'));
    const all = seedAllStreams(7);
    expect(Object.keys(all).sort()).toEqual([...RNG_STREAMS].sort());
    expect(new Set(Object.values(all).map((s) => s.join(','))).size).toBe(RNG_STREAMS.length);
  });

  it('streams are independent: drawing from one never shifts another', () => {
    const w1 = createWorld({ seed: 99 });
    const w2 = createWorld({ seed: 99 });
    for (let i = 0; i < 50; i++) rng(w1, 'weather').float();
    expect(rng(w1, 'anomaly').u32()).toBe(rng(w2, 'anomaly').u32());
  });

  it('draws mutate the world state, which round-trips through JSON', () => {
    const w = createWorld({ seed: 5 });
    rng(w, 'director').float();
    const copy = JSON.parse(JSON.stringify(w.rng.director)) as RngState;
    expect(rngFromState(copy).u32()).toBe(rng(w, 'director').u32());
  });
});

describe('Rng helpers', () => {
  const r = rngFromState(seedStream(2024, 'test'));
  const N = 20_000;

  it('float is in [0, 1) with mean ≈ 0.5', () => {
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const x = r.float();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      sum += x;
    }
    expect(sum / N).toBeCloseTo(0.5, 1);
  });

  it('int is inclusive on both ends; range stays in [lo, hi)', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 1_000; i++) seen.add(r.int(3, 6));
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
    for (let i = 0; i < 1_000; i++) {
      const x = r.range(-2, 5);
      expect(x).toBeGreaterThanOrEqual(-2);
      expect(x).toBeLessThan(5);
    }
  });

  it('chance, normal and weightedIndex follow their distributions', () => {
    let hits = 0;
    let sum = 0;
    let sumSq = 0;
    const counts = [0, 0, 0];
    for (let i = 0; i < N; i++) {
      if (r.chance(0.3)) hits++;
      const g = r.normal(10, 2);
      sum += g;
      sumSq += g * g;
      const k = r.weightedIndex([0.2, 0.5, 0.3]);
      counts[k] = (counts[k] ?? 0) + 1;
    }
    expect(hits / N).toBeCloseTo(0.3, 1);
    const mean = sum / N;
    expect(mean).toBeCloseTo(10, 1);
    expect(Math.sqrt(sumSq / N - mean * mean)).toBeCloseTo(2, 1);
    expect(counts.map((c) => c / N)).toEqual([expect.closeTo(0.2, 1), expect.closeTo(0.5, 1), expect.closeTo(0.3, 1)]);
    expect(() => r.weightedIndex([0, 0])).toThrow();
  });
});
