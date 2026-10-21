import { hashWorld } from '@sim/index';
import { describe, expect, it } from 'vitest';
import { drive } from '../../../tests/harness';
import { createMvpScenario } from '@sim/index';
import { parseJumpTarget } from '../jump';
import { InlineSimHost } from './inline';

const clock = (): number => 0;

describe('InlineSimHost', () => {
  it('jumpTo reaches the same world as the golden harness (same autopilot, same ticks)', async () => {
    const host = new InlineSimHost(clock);
    await host.newGame({ seed: 42 });
    const { ticks } = await host.jump(parseJumpTarget('T-00:00:04'));
    const { world, countdown } = host.inspect();
    expect(countdown?.tClockTicks).toBe(-120);
    expect(countdown?.phase.state).toBe('TerminalCount');

    const sc = createMvpScenario({ seed: 42 });
    sc.world.outbox.length = 0;
    const run = drive(sc, { until: (w) => (w.countdowns[sc.countdown.id]?.tClockTicks ?? -Infinity) >= -120 });
    expect(run.ticks).toBe(ticks);
    expect(hashWorld(world)).toBe(hashWorld(sc.world));
    expect(host.snapshot.tick).toBe(world.tick);
    expect(host.drainEvents()).toEqual([]);
  });

  it("autopilot commands carry source DIRECTOR; a sent command stays the player's (AC 33)", async () => {
    const host = new InlineSimHost(clock);
    await host.newGame({ seed: 42 });
    host.advance({ maxSteps: 2, budgetMs: Number.POSITIVE_INFINITY });
    const { world, countdown } = host.inspect();
    host.send({ t: 'OrderDelivery', fluid: 'LOX', rush: true });
    host.advance({ maxSteps: 1, budgetMs: Number.POSITIVE_INFINITY });
    const log = host.sessionLog().commandLog;
    expect(log.slice(0, 5).map((c) => c.cmd.source)).toEqual(Array(5).fill('DIRECTOR'));
    expect(log.at(-1)?.cmd).toEqual({ t: 'OrderDelivery', fluid: 'LOX', rush: true });
    const by = (world.decisions[countdown?.id ?? ''] ?? []).map((d) => `${d.kind} ${d.by}`);
    expect(by.slice(0, 5).every((x) => x.endsWith(' DIRECTOR'))).toBe(true);
    expect(by.at(-1)).toBe('OrderDelivery PLAYER');
  });

  it('advance honours maxSteps, buffers events, and save/load round-trips the world', async () => {
    const host = new InlineSimHost(clock);
    await host.newGame({ seed: 7 });
    const t0 = host.inspect().world.tick;
    const r = host.advance({ maxSteps: 45, budgetMs: Number.POSITIVE_INFINITY });
    expect(r.steps).toBe(45);
    expect(host.inspect().world.tick).toBe(t0 + 45);
    expect(host.inspect().world.outbox).toHaveLength(0);
    expect(host.drainEvents().length).toBeGreaterThan(0); // StartRollout, orders, …
    const json = host.saveSync({ game: 'test', createdAt: '2026-10-18T00:00:00Z' });
    const hash = hashWorld(host.inspect().world);
    host.advance({ maxSteps: 30, budgetMs: Number.POSITIVE_INFINITY });
    await host.load(json);
    expect(hashWorld(host.inspect().world)).toBe(hash);
  });

  it('stops right after a stopOn event and rejects unreachable jumps', async () => {
    const host = new InlineSimHost(clock);
    await host.newGame({ seed: 7 });
    const r = host.advance({ maxSteps: 100, budgetMs: Number.POSITIVE_INFINITY, stopOn: ['PhaseChanged'] });
    expect(r.stopped).toBe(true);
    expect(r.steps).toBe(1);
    await expect(host.jump({ tick: 10_000_000 }, 100)).rejects.toThrow('JUMP_TARGET_NOT_REACHED');
  });
});

describe('InlineSimHost timings (8.1 F5)', () => {
  it('mean µs/tick is total ms / total steps over the window, not a mean of per-advance ratios', async () => {
    // Scripted wall clock: the first read of an advance is its start, every later read (budget checks, end) is
    // start + the wall time the test assigns to that call.
    let start = 0;
    let end = 0;
    let first = true;
    const host = new InlineSimHost(() => (first ? ((first = false), start) : end));
    await host.newGame({ seed: 7 });
    const advance = (steps: number, ms: number): void => {
      start = end;
      end = start + ms;
      first = true;
      host.advance({ maxSteps: steps, budgetMs: Number.POSITIVE_INFINITY });
    };
    advance(1, 1); // 1 000 µs/tick (a 1-step call dominated by clock clamp)
    advance(99, 9.9); // 100 µs/tick
    const s = host.timings();
    // Σ ms / Σ steps = 10.9 ms / 100 steps = 109 µs; the old mean of ratios would say (1000 + 100) / 2 = 550 µs.
    expect(s.usPerTickMean).toBeCloseTo(109, 6);
    expect(s.usPerTickP95).toBeCloseTo(1000, 6);
    expect(s.lastAdvanceMs).toBeCloseTo(9.9, 6);
  });

  it('reports zeros before the first advance', () => {
    const host = new InlineSimHost(() => 0);
    expect(host.timings()).toMatchObject({ usPerTickMean: 0, usPerTickP95: 0, lastAdvanceMs: 0 });
  });
});
