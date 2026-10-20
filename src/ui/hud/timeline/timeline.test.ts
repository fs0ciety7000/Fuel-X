// Countdown band (6.5, AC 11 / 24): bar geometry, marks stay in their phase, milestone announcements, render.
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as fx from '../../fixtures';
import { barSegments, crossedMilestone, mapFraction, MIN_SHARE, segmentFill } from './bar';
import { PhaseBar } from './PhaseBar';

const phases = fx.countdown.phases;

describe('phase bar geometry', () => {
  it('display widths sum to 1 and every phase gets the floor', () => {
    const segs = barSegments(phases);
    expect(segs.reduce((a, s) => a + s.w, 0)).toBeCloseTo(1, 9);
    for (const s of segs) expect(s.w).toBeGreaterThanOrEqual(MIN_SHARE - 1e-12);
    // A tiny flight phase still gets at least MIN_SHARE of the bar.
    const tiny = barSegments([{ share: 0.98 }, { share: 0.01 }, { share: 0.01 }]);
    expect(tiny[1]?.w).toBeGreaterThanOrEqual(MIN_SHARE);
  });

  it('maps planned fractions monotonically and keeps marks inside their phase', () => {
    const segs = barSegments(phases);
    let prev = -1;
    for (let f = 0; f <= 1.0001; f += 0.01) {
      const x = mapFraction(f, segs);
      expect(x).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = x;
    }
    expect(mapFraction(0, segs)).toBe(0);
    expect(mapFraction(1, segs)).toBeCloseTo(1, 9);
    const s3 = segs[3];
    if (!s3) throw new Error('no segment');
    const mid = mapFraction(s3.start + s3.share / 2, segs);
    expect(mid).toBeGreaterThan(s3.x);
    expect(mid).toBeLessThan(s3.x + s3.w);
    expect(mapFraction(-1, segs)).toBe(0);
    expect(mapFraction(2, segs)).toBeCloseTo(1, 9);
  });

  it('fills done, current by progress, not pending', () => {
    expect(segmentFill({ state: 'done', progress: 0 })).toBe(1);
    expect(segmentFill({ state: 'current', progress: 0.4 })).toBe(0.4);
    expect(segmentFill({ state: 'held', progress: 0.7 })).toBe(0.7);
    expect(segmentFill({ state: 'pending', progress: 0.5 })).toBe(0);
  });

  it('announces T−10, T−5, T−0 once when crossed', () => {
    expect(crossedMilestone(-11, -9)).toBe(-10);
    expect(crossedMilestone(-6, -5)).toBe(-5);
    expect(crossedMilestone(-1, 0)).toBe(0);
    expect(crossedMilestone(-5, -4)).toBeNull();
    expect(crossedMilestone(-4, -11)).toBeNull(); // recycle goes backwards: no announcement
    expect(crossedMilestone(null, 0)).toBeNull();
  });
});

describe('phase bar render', () => {
  const cd = {
    ...fx.countdown,
    playhead: 0.6,
    holding: true,
    polls: [
      { id: 'load' as const, at: 'T−01:20:00', position: 0.3, label: 'LOAD POLL', state: 'passed' as const },
      { id: 'terminal' as const, at: 'T−00:10:00', position: 0.55, label: 'TERMINAL POLL', state: 'open' as const },
    ],
  };
  const out = renderToStaticMarkup(h(PhaseBar, { cd }));

  it('marks the current step, prints every phase, draws playhead, hold block, polls and window', () => {
    expect(out).toContain('aria-current="step"');
    expect(out.match(/<li/g)).toHaveLength(phases.length);
    expect(out).toContain('data-testid="playhead"');
    expect(out).toContain('data-testid="window-marks"');
    expect(out.match(/data-state="open"/g)).toHaveLength(1);
    expect(out).toContain('TERMINAL COUNT');
  });

  it('hides the playhead once scrubbed', () => {
    expect(renderToStaticMarkup(h(PhaseBar, { cd: { ...cd, scrubbed: true } }))).not.toContain('playhead');
  });
});
