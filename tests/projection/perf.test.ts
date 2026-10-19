// Projector cost (6.1): µs per projection on the MVP world at the reference states, with `prev` (steady state,
// structural sharing). Budget: ≤ 1 ms mean in Node (10 Hz ⇒ ≤ 1 % of a frame budget per second). Logged for QA.md.
import { describe, expect, it } from 'vitest';
import { secondsToTicks } from '../../src/sim/index';
import { projectedRun } from './harness';

describe('projector cost', () => {
  it.each([
    ['T-00:00:04', -4],
    ['T+00:01:45', 105],
  ])('%s', (name, tS) => {
    const p = projectedRun(42, (w) => (w.countdowns.cd01?.tClockTicks ?? -Infinity) >= secondsToTicks(tS));
    const view = { selectedId: p.run.countdown.boosterId, followId: p.run.countdown.boosterId };
    let prev = p.project(view);
    for (let i = 0; i < 50; i++) prev = p.project(view, prev, i + 2); // warm-up
    const n = 400;
    const xs: number[] = [];
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      prev = p.project(view, prev, i + 100);
      xs.push((performance.now() - t0) * 1000);
    }
    xs.sort((a, b) => a - b);
    const mean = xs.reduce((a, b) => a + b, 0) / n;
    const p95 = xs[Math.floor(n * 0.95)] ?? 0;
    console.log(`projector ${name}: ${mean.toFixed(0)} µs mean, ${p95.toFixed(0)} µs p95`);
    expect(mean).toBeLessThan(1000);
  });
});
