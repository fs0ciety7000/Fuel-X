import { describe, expect, it } from 'vitest';
import { GameLoop, MAX_STEPS_PER_FRAME } from './loop';
import type { AdvanceRequest, SimHost } from './sim-host/types';
import { TimeControl } from './time/time-control';

/** Host double: counts ticks, optionally costs `msPerTick` of fake wall time. */
function fakeHost(clock: { t: number }, msPerTick = 0) {
  const calls: AdvanceRequest[] = [];
  let ticks = 0;
  const host = {
    advance(req: AdvanceRequest) {
      calls.push(req);
      const t0 = clock.t;
      let steps = 0;
      while (steps < req.maxSteps && (steps === 0 || clock.t - t0 < req.budgetMs)) {
        clock.t += msPerTick;
        steps++;
      }
      ticks += steps;
      return { steps, stopped: false, ms: clock.t - t0 };
    },
    drainEvents: () => [],
    inspect: () => ({ world: {} as never, countdown: null, seed: 0, autopilot: false }),
  } as unknown as SimHost;
  return { host, calls, ticks: () => ticks };
}

function makeLoop(msPerTick = 0) {
  const clock = { t: 0 };
  const fh = fakeHost(clock, msPerTick);
  const time = new TimeControl();
  const alphas: number[] = [];
  const loop = new GameLoop({
    host: fh.host,
    time,
    onEvents: () => undefined,
    render: (_now, alpha) => alphas.push(alpha),
    now: () => clock.t,
    raf: () => 0,
    caf: () => undefined,
  });
  /** Run `frames` frames of `dtMs` wall time each. */
  const run = (frames: number, dtMs: number): void => {
    for (let i = 0; i < frames; i++) {
      clock.t += dtMs;
      loop.tick(clock.t);
    }
  };
  return { loop, time, run, alphas, ...fh };
}

describe('GameLoop fixed-step accumulator', () => {
  it('runs 30 ticks per wall second at 1× regardless of the frame rate', () => {
    for (const fps of [30, 60, 144]) {
      const l = makeLoop();
      l.run(fps * 10 + 1, 1000 / fps);
      expect(Math.abs(l.ticks() - 300)).toBeLessThanOrEqual(1);
    }
  });

  it('time scale = more steps per frame (10×, 100×), never more than the per-frame cap', () => {
    const l = makeLoop();
    l.time.setScale(10);
    l.run(601, 1000 / 60);
    expect(Math.abs(l.ticks() - 3000)).toBeLessThanOrEqual(10);
    const h = makeLoop();
    h.time.setScale(100);
    h.run(10, 250); // 4 fps: 750 ticks wanted per frame
    expect(Math.max(...h.calls.map((c) => c.maxSteps))).toBe(MAX_STEPS_PER_FRAME);
    expect(h.time.lagging).toBe(true);
  });

  it('drops the backlog when the sim budget is hit (no bigger dt, effective rate reported)', () => {
    const l = makeLoop(0.5); // 0.5 ms per tick → 8 ticks fit the 4 ms budget
    l.time.setScale(100);
    l.run(60, 1000 / 60);
    expect(l.time.lagging).toBe(true);
    expect(l.loop.lastSteps).toBeLessThanOrEqual(9);
    expect(l.time.effectiveRate).toBeLessThan(100);
  });

  it('pause stops stepping and freezes alpha; a long frame is clamped (background tab)', () => {
    const l = makeLoop();
    l.run(5, 10);
    const before = l.ticks();
    const alpha = l.alphas.at(-1);
    l.time.setScale(0);
    l.run(30, 16);
    expect(l.ticks()).toBe(before);
    expect(l.alphas.at(-1)).toBe(alpha);
    l.time.setScale(1);
    l.run(1, 60_000);
    expect(l.ticks() - before).toBeLessThanOrEqual(8); // 0.25 s max → 7.5 ticks
  });

  it('alpha stays in [0, 1)', () => {
    const l = makeLoop();
    l.run(200, 7);
    for (const a of l.alphas) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(1);
    }
  });
});
