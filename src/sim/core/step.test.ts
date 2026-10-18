import { describe, expect, it } from 'vitest';
import { createCommandQueue, enqueueCommand, takeCommands } from './commands';
import { drainEvents, emit, eventsThisTick } from './events';
import { createWorld } from './world';
import { DT_S, SIM_TICK_HZ, secondsToTicks, ticksToSeconds } from './time';
import { advance, step, SYSTEMS } from '../step';

describe('time', () => {
  it('uses a fixed 30 Hz step and integer ticks', () => {
    expect(SIM_TICK_HZ).toBe(30);
    expect(DT_S).toBeCloseTo(1 / 30, 12);
    expect(secondsToTicks(-4_800)).toBe(-144_000);
    expect(ticksToSeconds(90)).toBe(3);
  });
});

describe('step pipeline', () => {
  it('runs systems in a fixed order and increments the tick last', () => {
    expect(SYSTEMS.map((s) => s.name)).toEqual([
      'applyCommands',
      'countdown',
      'prep',
      'logistics',
      'propellant',
      'flight',
      'bookkeeping',
    ]);
    const w = createWorld({ seed: 1 });
    step(w);
    step(w);
    expect(w.tick).toBe(2);
  });

  it('stamps events with the executing tick and returns this tick’s events', () => {
    const w = createWorld({ seed: 1 });
    advance(w, 4);
    const events = step(w, [{ t: 'OrderDelivery', fluid: 'LOX', rush: false }]);
    expect(events).toEqual([{ t: 'CommandRejected', tick: 4, cmd: 'OrderDelivery', reason: 'NO_TANKER_AVAILABLE' }]);
    expect(w.tick).toBe(5);
  });

  it('rejects commands aimed at unknown countdowns', () => {
    const w = createWorld({ seed: 1 });
    const events = step(w, [
      { t: 'Go', countdownId: 'cd99' },
      { t: 'StartRollout', boosterId: 'e000001' },
    ]);
    expect(events.map((e) => (e.t === 'CommandRejected' ? e.reason : e.t))).toEqual([
      'UNKNOWN_COUNTDOWN',
      'NO_COUNTDOWN_FOR_BOOSTER',
    ]);
  });
});

describe('command queue', () => {
  it('applies commands at the tick they were stamped for, in send order', () => {
    const q = createCommandQueue();
    enqueueCommand(q, 3, { t: 'Scrub', countdownId: 'b' });
    enqueueCommand(q, 2, { t: 'Hold', countdownId: 'a' });
    enqueueCommand(q, 3, { t: 'Go', countdownId: 'c' });
    expect(takeCommands(q, 1)).toEqual([]);
    expect(takeCommands(q, 2)).toEqual([{ t: 'Hold', countdownId: 'a' }]);
    expect(takeCommands(q, 3).map((c) => c.t)).toEqual(['Scrub', 'Go']);
    expect(q.pending).toHaveLength(0);
    expect(q.nextSeq).toBe(3);
  });

  it('advance feeds each tick its stamped commands', () => {
    const w = createWorld({ seed: 1 });
    const q = createCommandQueue();
    enqueueCommand(q, 2, { t: 'LeakResponse', choice: 'DEGRADED' });
    advance(w, 5, q);
    expect(w.outbox).toEqual([{ t: 'CommandRejected', tick: 2, cmd: 'LeakResponse', reason: 'NOT_IMPLEMENTED' }]);
  });
});

describe('outbox', () => {
  it('eventsThisTick sees only the executing tick; drain empties the outbox', () => {
    const w = createWorld({ seed: 1 });
    emit(w, { t: 'CommandRejected', cmd: 'Go', reason: 'a' });
    w.tick = 1;
    emit(w, { t: 'CommandRejected', cmd: 'Go', reason: 'b' });
    expect(eventsThisTick(w).map((e) => e.tick)).toEqual([1]);
    expect(drainEvents(w)).toHaveLength(2);
    expect(w.outbox).toHaveLength(0);
    expect(eventsThisTick(w)).toEqual([]);
  });
});
