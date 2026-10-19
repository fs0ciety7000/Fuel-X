import { describe, expect, it } from 'vitest';
import { chapterAnchor, chapterAt, CHAPTERS, formatMissionTime, missionTimeAt, PHASES } from './showcase';

describe('showcase story timeline', () => {
  it('maps progress to chapters and back', () => {
    expect(chapterAt(0)).toBe(0);
    expect(chapterAt(1)).toBe(CHAPTERS.length - 1);
    CHAPTERS.forEach((_, i) => expect(chapterAt(chapterAnchor(i))).toBe(i));
  });

  it('runs the mission clock forward through liftoff', () => {
    expect(missionTimeAt(0.5)).toBe(0);
    let prev = -Infinity;
    for (let p = 0; p <= 1; p += 0.01) {
      const t = missionTimeAt(p);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });

  it('formats the game T-clock', () => {
    expect(formatMissionTime(-21_600)).toBe('T-06:00:00');
    expect(formatMissionTime(-3.7)).toBe('T-00:00:03');
    expect(formatMissionTime(415)).toBe('T+00:06:55');
  });

  it('has contiguous phases covering the flight', () => {
    for (let i = 1; i < PHASES.length; i += 1) expect(PHASES[i]?.from).toBe(PHASES[i - 1]?.to);
    expect(PHASES[PHASES.length - 1]?.to).toBe(1);
  });
});
