// Sparkline ring buffers (ADR 0004): 120 samples at 1 Hz **sim** time, so a sparkline compresses with the time
// scale. `sample(world)` runs every frame (cheap reads) and pushes one sample per whole sim second crossed since the
// last call (step-hold fill when a frame spans several seconds at 100×; capped at the buffer length after a jump).
// The projector reads immutable arrays that keep identity until a new sample lands.
import { DT_S, farmUsableKg } from '@sim/index';
import { weather as wxData } from '@data/index';
import type { Countdown, World } from '@sim/types';

export const SPARK_SAMPLES = 120;

export type SparkKey = 'propLoaded' | 'weatherMargin' | 'farmLox' | 'farmCh4' | `alt:${string}` | `prop:${string}`;

class Ring {
  private readonly buf: (number | null)[] = [];
  private cache: readonly (number | null)[] | null = null;
  push(v: number | null): void {
    this.buf.push(v);
    if (this.buf.length > SPARK_SAMPLES) this.buf.shift();
    this.cache = null;
  }
  values(): readonly (number | null)[] {
    return (this.cache ??= Object.freeze(this.buf.slice()));
  }
}

const EMPTY: readonly (number | null)[] = Object.freeze([]);

/** Loaded fraction of the countdown's two stages (LOX + CH4 mass over capacity), 0–1. */
export function stagesLoadedFraction(world: Readonly<World>, cd: Readonly<Countdown>): number | null {
  let m = 0;
  let cap = 0;
  for (const id of [cd.boosterId, cd.shipId]) {
    const e = world.entities.byId[id];
    if (e?.kind !== 'booster' && e?.kind !== 'ship') continue;
    m += e.prop.loxKg + e.prop.ch4Kg;
    cap += e.prop.loxCapKg + e.prop.ch4CapKg;
  }
  return cap > 0 ? m / cap : null;
}

/** Weather margin: 1 − worst(ground/limit, upper/limit), clamped to [−1, 1] (0 = at a limit). */
export function weatherMargin(world: Readonly<World>): number {
  const w = world.weather;
  const L = wxData.launchLimit;
  const worst = Math.max(w.groundWindMPerS / L.groundWindMPerS, w.upperWindMPerS / L.upperWindMPerS);
  return Math.max(-1, Math.min(1, 1 - worst));
}

export class SparkSampler {
  private readonly rings = new Map<SparkKey, Ring>();
  /** Last sim second sampled (floor(tick·DT)); −1 = none. */
  private lastSecond = -1;
  /** Bumped whenever any ring changed. */
  version = 0;

  reset(): void {
    this.rings.clear();
    this.lastSecond = -1;
    this.version++;
  }

  /** Push samples for every whole sim second crossed since the last call. */
  sample(world: Readonly<World>, cd: Readonly<Countdown> | null): void {
    const second = Math.floor(world.tick * DT_S + 1e-9);
    if (second < this.lastSecond) this.reset(); // new game / load
    if (second === this.lastSecond) return;
    const n = this.lastSecond < 0 ? 1 : Math.min(SPARK_SAMPLES, second - this.lastSecond);
    this.lastSecond = second;
    const vals = this.read(world, cd);
    // Keys absent this second get a gap so all series stay time-aligned.
    for (const key of this.rings.keys()) if (!vals.has(key)) vals.set(key, null);
    for (const [key, v] of vals) {
      let ring = this.rings.get(key);
      if (!ring) this.rings.set(key, (ring = new Ring()));
      for (let i = 0; i < n; i++) ring.push(v);
    }
    this.version++;
  }

  values(key: SparkKey): readonly (number | null)[] {
    return this.rings.get(key)?.values() ?? EMPTY;
  }

  private read(world: Readonly<World>, cd: Readonly<Countdown> | null): Map<SparkKey, number | null> {
    const out = new Map<SparkKey, number | null>();
    out.set('weatherMargin', weatherMargin(world));
    out.set('farmLox', farmUsableKg(world as World, 'LOX'));
    out.set('farmCh4', farmUsableKg(world as World, 'CH4'));
    if (!cd) return out;
    out.set('propLoaded', stagesLoadedFraction(world, cd));
    for (const id of [cd.boosterId, cd.shipId]) {
      const e = world.entities.byId[id];
      if (e?.kind !== 'booster' && e?.kind !== 'ship') continue;
      const flying = e.flight !== null && !e.flight.done;
      out.set(`alt:${id}`, flying ? (e.flight?.altitudeM ?? null) : null);
      const cap = e.prop.loxCapKg + e.prop.ch4CapKg;
      out.set(`prop:${id}`, cap > 0 ? (e.prop.loxKg + e.prop.ch4Kg) / cap : null);
    }
    return out;
  }
}
