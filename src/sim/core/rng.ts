// sfc32 seeded PRNG (ADR 0003): 128-bit state stored as plain numbers so it serializes with the world.
// One named stream per system, each derived independently from the world seed, so adding a stream
// never shifts another system's rolls.
import { hash128 } from './hash';
import type { World } from './world';

/** [a, b, c, d] — unsigned 32-bit integers. */
export type RngState = [number, number, number, number];

export const RNG_STREAMS = ['weather', 'director', 'anomaly', 'catch', 'logistics', 'flight'] as const;
export type RngStream = (typeof RNG_STREAMS)[number];

const WARMUP_DRAWS = 15;

/** Advances `s` in place and returns the next unsigned 32-bit output. */
export function sfc32Next(s: RngState): number {
  const [a, b, c, d0] = s;
  const d = (d0 + 1) | 0;
  const t = (((a + b) | 0) + d) | 0;
  s[3] = d >>> 0;
  s[0] = (b ^ (b >>> 9)) >>> 0;
  s[1] = (c + (c << 3)) >>> 0;
  const r = (c << 21) | (c >>> 11);
  s[2] = (r + t) >>> 0;
  return t >>> 0;
}

/** Derives the initial state of a named stream from the world seed. */
export function seedStream(seed: number, stream: string): RngState {
  const s: RngState = hash128(`fuelx:${seed}:${stream}`);
  for (let i = 0; i < WARMUP_DRAWS; i++) sfc32Next(s);
  return s;
}

export function seedAllStreams(seed: number): Record<RngStream, RngState> {
  const out = {} as Record<RngStream, RngState>;
  for (const name of RNG_STREAMS) out[name] = seedStream(seed, name);
  return out;
}

/** Thin view over a state tuple; every draw mutates that tuple (never stored in the world). */
export interface Rng {
  /** Unsigned 32-bit integer. */
  u32(): number;
  /** Uniform in [0, 1). */
  float(): number;
  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number;
  /** Integer uniform in [lo, hi] (inclusive). */
  int(lo: number, hi: number): number;
  /** true with probability p. */
  chance(p: number): boolean;
  /** Gaussian (Box–Muller, no cached spare so the state stays the only state). */
  normal(mean?: number, sd?: number): number;
  /** Index drawn proportionally to non-negative weights. */
  weightedIndex(weights: readonly number[]): number;
}

interface RngImpl extends Rng {
  s: RngState;
}

// Shared method table: a view is one small object per call (no closures to allocate on the hot path).
const RNG_METHODS: Omit<RngImpl, 's'> & ThisType<RngImpl> = {
  u32() {
    return sfc32Next(this.s);
  },
  float() {
    return sfc32Next(this.s) / 4294967296;
  },
  range(lo, hi) {
    return lo + (hi - lo) * this.float();
  },
  int(lo, hi) {
    return lo + Math.floor(this.float() * (hi - lo + 1));
  },
  chance(p) {
    return this.float() < p;
  },
  normal(mean = 0, sd = 1) {
    const u1 = 1 - this.float(); // (0, 1]
    const u2 = this.float();
    return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  },
  weightedIndex(weights) {
    const total = weights.reduce((sum, w) => sum + w, 0);
    if (!(total > 0)) throw new Error('weightedIndex: weights must sum to > 0');
    let x = this.float() * total;
    for (let i = 0; i < weights.length; i++) {
      x -= weights[i] ?? 0;
      if (x < 0) return i;
    }
    return weights.length - 1;
  },
};

export function rngFromState(s: RngState): Rng {
  const r = Object.create(RNG_METHODS) as RngImpl;
  r.s = s;
  return r;
}

/** The named stream of a world (state lives in `world.rng[stream]`). */
export function rng(world: World, stream: RngStream): Rng {
  return rngFromState(world.rng[stream]);
}
