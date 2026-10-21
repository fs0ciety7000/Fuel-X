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
