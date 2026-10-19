import { describe, expect, it } from 'vitest';
import {
  credits,
  days,
  degrees,
  duration,
  fixed,
  hours,
  hoursMinutes,
  km,
  kmh,
  mps,
  pct,
  prob,
  signed,
  tClock,
  tonnes,
  utc,
} from './format';

const M = '−';
const G = ' ';

describe('format (DESIGN_SYSTEM §2.5: fixed decimals, true minus, grouping, —)', () => {
  it.each([
    [fixed(0, 1), '0.0'],
    [fixed(-0.04, 1), '0.0'], // never −0.0
    [fixed(-1.25, 2), `${M}1.25`],
    [fixed(999, 0), '999'],
    [fixed(1000, 0), `1${G}000`],
    [fixed(-4_028_123.4, 1), `${M}4${G}028${G}123.4`],
    [fixed(Number.NaN, 1), '—'],
    [signed(8, 0), '+8'],
    [signed(-12.4, 2), `${M}12.40`],
    [signed(0, 0), '0'],
  ])('%s → %s', (got, want) => expect(got).toBe(want));

  it.each([
    ['km', km(8_312), '8.3', 'KM', 8_312],
    ['km 0', km(20), '0.0', 'KM', 0],
    ['km/h', kmh(13.06), '47', 'KM/H', 13.06],
    ['km/h flight', kmh(1_016.6), `3${G}660`, 'KM/H', 1_016.6],
    ['m/s', mps(8.149), '8.1', 'M/S', 8.149],
    ['pct', pct(0.9995), '100.0', '%', 0.9995],
    ['pct 0dp', pct(0.824, 0), '82', '%', 0.824],
    ['tonnes', tonnes(4_028_000), `4${G}028`, 'T', 4_028_000],
    ['credits', credits(29_976_000), '29.98', 'M CR', 29_976_000],
    ['credits delta', credits(-12_400_000, true), `${M}12.40`, 'M CR', -12_400_000],
    ['credits +', credits(62_000_000, true), '+62.00', 'M CR', 62_000_000],
    ['degrees', degrees(Math.PI / 2), '090', '°', Math.PI / 2],
    ['degrees wrap', degrees(-Math.PI / 2), '270', '°', -Math.PI / 2],
    ['p', prob(0.6249), '0.62', '', 0.6249],
    ['hours', hours(2_160), '0.60', 'H', 2_160],
    ['shift', hoursMinutes(22_200), '6:10', 'H', 22_200],
    ['days', days(259_200), '3.0', 'D', 259_200],
    ['duration', duration(4_800), '01:20:00', '', 4_800],
    ['missing', km(null), '—', 'KM', null],
  ])('%s', (_n, v, text, unit, value) => {
    expect({ text: v.text, unit: v.unit }).toEqual({ text, unit });
    // machine value = SI quantised to the display resolution (keeps identity while the display is unchanged)
    if (value === null) expect(v.value).toBeNull();
    else expect(Math.abs((v.value ?? Number.NaN) - value)).toBeLessThanOrEqual(Math.abs(value) * 0.01 + 0.05);
  });

  it('quantises the machine value to the display step', () => {
    expect(km(8_312).value).toBe(8_300);
    expect(pct(0.82449).value).toBe(0.824);
    expect(mps(8.149).value).toBe(8.1);
  });

  it.each([
    [-120, `T${M}00:00:04`], // −4.0 s
    [-119, `T${M}00:00:04`], // −3.97 s: whole seconds still to go (ceil)
    [-90, `T${M}00:00:03`],
    [0, 'T+00:00:00'],
    [3_149, 'T+00:01:44'], // counting up: elapsed (floor)
    [3_150, 'T+00:01:45'],
    [-21_600 * 30, `T${M}06:00:00`],
    [-(99 * 3600 + 3599) * 30, `T${M}99:59:59`],
    [-(4 * 86_400 + 6 * 3600 + 12 * 60) * 30, `T${M}4D 06:12`],
  ])('tClock(%i) → %s', (ticks, want) => expect(tClock(ticks)).toBe(want));

  it('utc wraps the day', () => {
    expect(utc(13 * 3600 + 41 * 60 + 54)).toBe('13:41:54');
    expect(utc(86_400 + 5)).toBe('00:00:05');
  });
});
