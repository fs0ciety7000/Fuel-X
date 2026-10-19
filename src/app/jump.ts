// `__fuelx.jumpTo` target parsing (ARCHITECTURE §9): 'T-00:00:04' | 'T+00:01:45' | 'Liftoff' | {tick} | {phase}.
import { PHASES, SIM_TICK_HZ } from '@sim/index';
import type { Phase } from '@sim/types';
import type { JumpTarget } from './sim-host/types';

const T_CLOCK = /^T([+-])(\d{1,3}):(\d{2}):(\d{2})$/;

export type JumpInput = string | { tick: number } | { phase: Phase };

export function parseJumpTarget(input: JumpInput): JumpTarget {
  if (typeof input !== 'string') {
    if ('tick' in input) {
      if (!Number.isInteger(input.tick) || input.tick < 0) throw new Error('JUMP_BAD_TICK');
      return { tick: input.tick };
    }
    if (!PHASES.includes(input.phase)) throw new Error('JUMP_BAD_PHASE');
    return { phase: input.phase };
  }
  const m = T_CLOCK.exec(input.trim());
  if (m) {
    const [, sign, h, mi, s] = m;
    const secs = Number(h) * 3600 + Number(mi) * 60 + Number(s);
    return { tClockTicks: (sign === '-' ? -1 : 1) * secs * SIM_TICK_HZ };
  }
  const phase = PHASES.find((p) => p.toLowerCase() === input.trim().toLowerCase());
  if (phase) return { phase };
  throw new Error('JUMP_BAD_TARGET');
}

/** 'T-00:00:04' style label of a T-clock in ticks. */
export function formatTClock(tClockTicks: number): string {
  const sign = tClockTicks < 0 ? '-' : '+';
  // Counting down shows the whole seconds still to go (ceil); counting up the elapsed ones (floor).
  const secs = Math.abs(tClockTicks) / SIM_TICK_HZ;
  const total = tClockTicks < 0 ? Math.ceil(secs) : Math.floor(secs);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `T${sign}${p(Math.floor(total / 3600))}:${p(Math.floor(total / 60) % 60)}:${p(total % 60)}`;
}
