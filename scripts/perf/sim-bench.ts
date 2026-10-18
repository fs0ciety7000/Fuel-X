// Sim micro-benchmarks for `npm run perf` (ARCHITECTURE §13.3). Plain timing harness: Vitest 5 replaced
// the `bench()` API, and a dozen lines here avoid a dependency. Phase 3.10 adds the MVP + stress worlds.
import { SIM_TICK_HZ } from '../../src/sim/index.ts';

type Case = { name: string; budgetUs?: number; fn: () => void };

const cases: Case[] = [
  {
    name: 'fixed-step accumulator (1 s of ticks)',
    fn: () => {
      let acc = 0;
      for (let i = 0; i < SIM_TICK_HZ; i++) acc += 1 / SIM_TICK_HZ;
      if (acc < 0) throw new Error('unreachable');
    },
  },
];

function measure(fn: () => void, iterations = 20_000): { meanUs: number; p95Us: number } {
  for (let i = 0; i < 1_000; i++) fn(); // warm-up
  const samples = new Float64Array(iterations);
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn();
    samples[i] = (performance.now() - t0) * 1000;
  }
  samples.sort();
  const meanUs = samples.reduce((s, x) => s + x, 0) / iterations;
  return { meanUs, p95Us: samples[Math.floor(iterations * 0.95)] ?? meanUs };
}

let failed = false;
for (const c of cases) {
  const { meanUs, p95Us } = measure(c.fn);
  const over = c.budgetUs !== undefined && meanUs > c.budgetUs;
  failed ||= over;
  console.log(`${c.name.padEnd(44)} mean ${meanUs.toFixed(3)} µs  p95 ${p95Us.toFixed(3)} µs${over ? '  OVER' : ''}`);
}
process.exit(failed ? 1 : 0);
