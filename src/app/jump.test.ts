import { describe, expect, it } from 'vitest';
import { formatTClock, parseJumpTarget } from './jump';

describe('jumpTo targets', () => {
  it('parses T-clock strings into T-clock ticks', () => {
    expect(parseJumpTarget('T-00:00:04')).toEqual({ tClockTicks: -120 });
    expect(parseJumpTarget('T+00:01:45')).toEqual({ tClockTicks: 105 * 30 });
    expect(parseJumpTarget('T-01:20:00')).toEqual({ tClockTicks: -80 * 60 * 30 });
  });

  it('parses phases (case-insensitive) and explicit objects', () => {
    expect(parseJumpTarget('Liftoff')).toEqual({ phase: 'Liftoff' });
    expect(parseJumpTarget('terminalcount')).toEqual({ phase: 'TerminalCount' });
    expect(parseJumpTarget({ tick: 900 })).toEqual({ tick: 900 });
    expect(parseJumpTarget({ phase: 'Boostback' })).toEqual({ phase: 'Boostback' });
  });

  it('rejects malformed targets with codes', () => {
    expect(() => parseJumpTarget('T-0:4')).toThrow('JUMP_BAD_TARGET');
    expect(() => parseJumpTarget({ tick: -1 })).toThrow('JUMP_BAD_TICK');
  });

  it('formats the T-clock (ceil while counting down, floor after T-0)', () => {
    expect(formatTClock(-120)).toBe('T-00:00:04');
    expect(formatTClock(-119)).toBe('T-00:00:04');
    expect(formatTClock(0)).toBe('T+00:00:00');
    expect(formatTClock(105 * 30 + 29)).toBe('T+00:01:45');
    expect(formatTClock(-6 * 3600 * 30)).toBe('T-06:00:00');
  });
});
