// Display formatting for the UI projection (ARCHITECTURE §8, DESIGN_SYSTEM §2.5): the only place SI becomes display
// units. Fixed decimals per field, true minus (U+2212), integer part grouped with a narrow no-break space (U+202F)
// from 1 000, `—` for missing data. Pure functions, unit-tested as a table (format.test.ts).
import type { ValueVM } from '@bridge/projection-types';
import { SIM_TICK_HZ } from '@sim/index';

export const MINUS = '−';
export const GROUP = ' ';
export const MISSING = '—';

/** `x` with `decimals` fixed places, true minus, grouped integer part; never `−0`. */
export function fixed(x: number, decimals: number): string {
  if (!Number.isFinite(x)) return MISSING;
  const abs = Math.abs(x).toFixed(decimals);
  const neg = x < 0 && Number(abs) !== 0;
  const [int = '0', frac] = abs.split('.');
  const grouped = int.length > 3 ? int.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP) : int;
  return `${neg ? MINUS : ''}${grouped}${frac !== undefined ? `.${frac}` : ''}`;
}

/** Like `fixed` with an explicit `+` on positive values (deltas). Zero has no sign. */
export function signed(x: number, decimals: number): string {
  const s = fixed(x, decimals);
  return x > 0 && Number(Math.abs(x).toFixed(decimals)) !== 0 ? `+${s}` : s;
}

/** Missing value in a fixed slot. */
export const missing = (unit = ''): ValueVM => ({ text: MISSING, unit, value: null });

/** ValueVM from a machine value and its display text (`—` when the value is missing). */
export function dv(value: number | null, text: string, unit: string): ValueVM {
  return { text: value === null ? MISSING : text, unit, value };
}

/** Generic: SI value × scale shown with fixed decimals. */
export function num(si: number | null | undefined, decimals: number, unit: string, scale = 1): ValueVM {
  if (si === null || si === undefined || !Number.isFinite(si)) return dv(null, MISSING, unit);
  return dv(si, fixed(si * scale, decimals), unit);
}

/** m → `8.3 KM` (1 decimal). */
export const km = (m: number | null | undefined, decimals = 1): ValueVM => num(m, decimals, 'KM', 1e-3);
/** m → `600 M`. */
export const metres = (m: number | null | undefined, decimals = 0): ValueVM => num(m, decimals, 'M');
/** m/s → `47 KM/H` (integer). */
export const kmh = (mps: number | null | undefined): ValueVM => num(mps, 0, 'KM/H', 3.6);
/** m/s → `8.1 M/S` (wind, 1 decimal). */
export const mps = (v: number | null | undefined): ValueVM => num(v, 1, 'M/S');
/** fraction 0–1 → `100.0 %` (1 decimal). */
export const pct = (fraction: number | null | undefined, decimals = 1): ValueVM => num(fraction, decimals, '%', 100);
/** kg → `4 028 T` (integer tonnes by default). */
export const tonnes = (kg: number | null | undefined, decimals = 0): ValueVM => num(kg, decimals, 'T', 1e-3);
/** cr → `29.98 M CR` (2 decimals, signed when `delta`). */
export function credits(cr: number | null | undefined, delta = false): ValueVM {
  if (cr === null || cr === undefined || !Number.isFinite(cr)) return dv(null, MISSING, 'M CR');
  return dv(cr, delta ? signed(cr / 1e6, 2) : fixed(cr / 1e6, 2), 'M CR');
}
/** rad → compass `222°` (integer, 0–359). */
export function degrees(rad: number | null | undefined): ValueVM {
  if (rad === null || rad === undefined || !Number.isFinite(rad)) return dv(null, MISSING, '°');
  const d = ((Math.round((rad * 180) / Math.PI) % 360) + 360) % 360;
  return dv(rad, String(d).padStart(3, '0'), '°');
}
/** Probability → `0.62` (2 decimals, shown to 1 %). */
export const prob = (p: number | null | undefined): ValueVM => num(p, 2, '');

const p2 = (n: number): string => String(n).padStart(2, '0');

/** s → `H:MM:SS` (`12:04:09`, hours unpadded beyond 2 digits); negative values clamp to 0. */
export function hms(s: number): string {
  const t = Math.max(0, Math.floor(s));
  return `${p2(Math.floor(t / 3600))}:${p2(Math.floor(t / 60) % 60)}:${p2(t % 60)}`;
}
/** Duration ValueVM `01:20:00` (unit ''). */
export const duration = (s: number | null | undefined): ValueVM =>
  s === null || s === undefined || !Number.isFinite(s) ? dv(null, MISSING, '') : dv(s, hms(s), '');
/** s → `6:10` with unit `H` (shift clocks). */
export function hoursMinutes(s: number | null | undefined): ValueVM {
  if (s === null || s === undefined || !Number.isFinite(s)) return dv(null, MISSING, 'H');
  const m = Math.floor(Math.max(0, s) / 60);
  return dv(s, `${Math.floor(m / 60)}:${p2(m % 60)}`, 'H');
}
/** s → hours with fixed decimals (`0.60 H`). */
export const hours = (s: number | null | undefined, decimals = 2): ValueVM => num(s, decimals, 'H', 1 / 3600);
/** s → days (`3.0 D`). */
export const days = (s: number | null | undefined, decimals = 1): ValueVM => num(s, decimals, 'D', 1 / 86_400);

/**
 * T-clock in ticks → `T−HH:MM:SS` / `T+HH:MM:SS` (DESIGN_SYSTEM §6.18). Counting down shows the whole seconds still
 * to go (ceil), counting up the elapsed ones (floor) — same rounding as `jumpTo` targets and the golden log.
 * Above 99 h: `T−4D 06:12`.
 */
export function tClock(tClockTicks: number): string {
  const neg = tClockTicks < 0;
  const secs = Math.abs(tClockTicks) / SIM_TICK_HZ;
  const total = neg ? Math.ceil(secs - 1e-9) : Math.floor(secs + 1e-9);
  const sign = neg ? MINUS : '+';
  if (total >= 100 * 3600) {
    const d = Math.floor(total / 86_400);
    const rem = total - d * 86_400;
    return `T${sign}${d}D ${p2(Math.floor(rem / 3600))}:${p2(Math.floor(rem / 60) % 60)}`;
  }
  return `T${sign}${hms(total)}`;
}

/** T-offset in seconds → T-clock string. */
export const tClockS = (s: number): string => tClock(Math.round(s * SIM_TICK_HZ));

/** Seconds since 00:00 UTC (may exceed a day) → `HH:MM:SS`. */
export function utc(s: number): string {
  const t = ((Math.floor(s) % 86_400) + 86_400) % 86_400;
  return `${p2(Math.floor(t / 3600))}:${p2(Math.floor(t / 60) % 60)}:${p2(t % 60)}`;
}

/** UPPER_SNAKE code → `UPPER SNAKE` (fallback label). */
export const words = (code: string): string => code.replace(/_/g, ' ').toUpperCase();

/** `33 OF 33`. */
export const ofTotal = (n: number, total: number): string => `${n} OF ${total}`;
