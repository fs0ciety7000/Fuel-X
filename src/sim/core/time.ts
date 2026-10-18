// Fixed timestep (ADR 0003). Sim time = tick × DT_S, never an accumulated float.
import type { Tick } from '../types';

export const SIM_TICK_HZ = 30;
export const DT_S = 1 / SIM_TICK_HZ;

/** Seconds → whole ticks (rounded to the nearest tick). */
export function secondsToTicks(seconds: number): Tick {
  return Math.round(seconds * SIM_TICK_HZ);
}

export function ticksToSeconds(ticks: Tick): number {
  return ticks / SIM_TICK_HZ;
}
