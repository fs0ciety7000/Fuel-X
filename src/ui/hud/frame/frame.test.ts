// HUD frame + top bar + rate control contracts (6.3): slot API, pointer rules, rate logic, live-region throttle.
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as fx from '../../fixtures';
import type { TimeScaleVM } from '../../types';
import { CountdownTimelineView, clockState, headerAction } from '../timeline/CountdownTimeline';
import { RateControlView } from '../topbar/RateControl';
import {
  capLabel,
  rateAnnouncement,
  rateSegments,
  readout,
  runEnded,
  selectedRate,
  steppedRate,
  toggledRate,
} from '../topbar/rate';
import { nextIndex, SiteSwitcher } from '../topbar/SiteSwitcher';
import { alertBadge, rangeBadge, TopBarView } from '../topbar/TopBar';
import { HudFrame, HudSlot } from './HudFrame';
import { createAnnouncer, LIVE_THROTTLE_MS } from './live';
import { HUD_SLOTS, SLOT_META } from './slots';

const html = (el: ReturnType<typeof h>): string => renderToStaticMarkup(el);
const ts = fx.timeScales;

describe('HUD frame slots', () => {
  it('renders every filled slot once, empty slots not at all', () => {
    const out = html(h(HudFrame, { slots: { top: h('b', null, 'TOP'), tabs: h('b', null, 'TABS') } }));
    expect(out.match(/data-slot="/g)).toHaveLength(2);
    expect(out).toContain('data-slot="top"');
    expect(out).toContain('data-slot="tabs"');
    expect(out).not.toContain('data-slot="flight"');
  });

  it('outline mode prints every slot name with its owner task', () => {
    const out = html(h(HudFrame, { slots: {}, outline: true, contained: true }));
    for (const n of HUD_SLOTS) expect(out).toContain(`data-slot="${n}"`);
    expect(out).toContain('INSPECT · 6.4');
  });

  it('read-only slots never catch the pointer', () => {
    expect(SLOT_META.alt.interactive).toBe(false);
    expect(SLOT_META.compass.interactive).toBe(false);
    const alt = html(h(HudSlot, { name: 'alt', children: 'x' }));
    expect(alt).not.toContain('data-interactive');
    expect(html(h(HudSlot, { name: 'inspect', children: 'x' }))).toContain('data-interactive="true"');
    expect(html(h(HudSlot, { name: 'flight' }))).toBe('');
  });

  it('carries the minimum-viewport plate and the panels target', () => {
    const out = html(h(HudFrame, { slots: {} }));
    expect(out).toContain('VIEWPORT 1280×720 MIN');
    expect(out).toContain('id="hud-panels"');
  });
});

describe('rate control logic (§6.25)', () => {
  it('selects the requested rate, pause when paused', () => {
    expect(selectedRate(ts.running)).toBe(10);
    expect(selectedRate(ts.paused)).toBe(0);
    expect(selectedRate(ts.capped)).toBe(100);
  });

  it('hatches segments above the cap but keeps them selectable; pause is never capped', () => {
    const segs = rateSegments(ts.locked, false);
    expect(segs.map((s) => s.capReason !== null)).toEqual([false, false, true, true]);
    expect(segs.every((s) => s.disabledReason === null)).toBe(true);
    expect(capLabel(ts.locked)).toBe('1× LOCKED · TERMINAL COUNT');
  });

  it('disables every segment with RUN ENDED at the debrief', () => {
    const ended: TimeScaleVM = { ...ts.paused, runEnded: true, maxAllowed: 0, lockReason: 'RUN ENDED' };
    expect(runEnded(ended, false)).toBe(true);
    expect(runEnded(ts.running, true)).toBe(true);
    expect(runEnded({ ...ts.running, runEnded: false }, true)).toBe(false);
    expect(rateSegments(ended, true).every((s) => s.disabledReason === 'RUN ENDED' && s.capReason === null)).toBe(true);
  });

  it('Space toggles pause and resumes the last running request', () => {
    expect(toggledRate(ts.running)).toBe(0);
    expect(toggledRate(ts.paused)).toBe(1);
    expect(toggledRate({ ...ts.paused, resumeRate: 10 })).toBe(10);
  });

  it(', / . step through running rates and stop at the cap with its reason', () => {
    expect(steppedRate(ts.running, 1)).toEqual({ rate: 100, blocked: null });
    expect(steppedRate(ts.running, -1)).toEqual({ rate: 1, blocked: null });
    expect(steppedRate({ ...ts.running, requested: 1, effective: 1 }, -1)).toEqual({ rate: null, blocked: null });
    expect(steppedRate(ts.locked, 1)).toEqual({ rate: null, blocked: '1× LOCKED · TERMINAL COUNT' });
    expect(steppedRate({ ...ts.paused, resumeRate: 10 }, 1)).toEqual({ rate: 100, blocked: null });
  });

  it('announces queued capped requests and prints the projector readout', () => {
    expect(rateAnnouncement(100, ts.capped)).toBe('RATE 100× QUEUED, MAX 10× · PROPELLANT LOAD');
    expect(rateAnnouncement(10, ts.running)).toBe('RATE 10×');
    expect(readout({ ...ts.running, readout: 'SIM 10×' })).toBe('SIM 10×');
    expect(readout(ts.paused)).toBe('SIM PAUSED');
  });

  it('renders a radiogroup, the skip button with its reason, the effective marker and the drop chip', () => {
    const out = html(
      h(RateControlView, {
        ts: { ...ts.capped, drop: { code: 'DECISION_OPEN', label: '1× · DECISION OPEN', tick: 1 } },
        ended: false,
      }),
    );
    expect(out).toContain('role="radiogroup"');
    expect(out).toContain('data-effective="true"');
    expect(out).toContain('MAX 10× · PROPELLANT LOAD');
    expect(out).toContain('1× · DECISION OPEN');
    // No skip handler yet (7.2) → disabled with a reason, still focusable.
    expect(out).toMatch(/aria-disabled="true"[^>]*aria-describedby/);
    const ended = html(h(RateControlView, { ts: { ...ts.paused, runEnded: true }, ended: true }));
    expect(ended).toContain('RUN ENDED');
    expect(ended).not.toContain('aria-checked="true" aria-disabled="false"');
  });
});

describe('top bar (§6.1–6.5)', () => {
  it('range badge words and the disabled no-launch state', () => {
    expect(rangeBadge(fx.range).value).toBe('NO-GO');
    expect(rangeBadge({ ...fx.range, aggregate: 'NONE', label: 'RANGE —', state: 'neutral' })).toMatchObject({
      value: '—',
      state: 'disabled',
    });
    expect(rangeBadge({ ...fx.range, label: 'RANGE GO', aggregate: 'GO', state: 'ok' }).value).toBe('GO');
  });

  it('alert counter: count slot + note from the projector label', () => {
    expect(alertBadge({ ...fx.alerts, label: '3 ALERTS · 2 NEW', open: 3 })).toEqual({
      value: '3',
      note: 'ALERTS · 2 NEW',
      glyph: 'danger',
    });
    expect(alertBadge({ open: 0, fresh: 0, state: 'neutral', items: [] }).note).toBe('ALERTS');
  });

  it('renders the banner cells in order with the SIM readout and role label', () => {
    const out = html(
      h(TopBarView, {
        utc: '13:41:54',
        timeScale: { ...ts.running, readout: 'SIM 10×' },
        range: fx.range,
        alerts: fx.alerts,
        sites: fx.sites,
      }),
    );
    const order = ['CALDER', 'VARNE COAST', '>LC-1<', '13:41:54', 'SIM 10×', 'RANGE', 'LAUNCH DIRECTOR'].map((s) =>
      out.indexOf(s),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(out).toContain('aria-label="Site"');
  });

  it('site switcher: disabled sites are navigable options with a reason', () => {
    const out = html(h(SiteSwitcher, { sites: fx.sites, open: true }));
    expect(out).toContain('role="listbox"');
    expect(out).toMatch(/role="option" aria-selected="true"/);
    expect(out).toMatch(/aria-disabled="true" aria-description="BUILD 62 %, LOCKED IN THIS BUILD"/);
    expect(nextIndex('ArrowDown', 1, 2)).toBe(0);
    expect(nextIndex('ArrowUp', 0, 2)).toBe(1);
    expect(nextIndex('End', 0, 4)).toBe(3);
    expect(nextIndex('x', 0, 4)).toBeNull();
  });
});

describe('countdown header (§6.17, AC 28)', () => {
  const holdAction = {
    id: 'HOLD',
    label: 'HOLD',
    key: 'H',
    enabled: true,
    variant: 'secondary' as const,
    command: { t: 'Hold' as const, countdownId: 'cd-1' },
  };
  const counting = { ...fx.countdown, holding: false, actions: [holdAction] };

  it('shows HOLD only while counting, nothing while holding or scrubbed', () => {
    expect(headerAction(counting)?.id).toBe('HOLD');
    expect(headerAction({ ...counting, holding: true })).toBeNull();
    expect(headerAction({ ...counting, scrubbed: true })).toBeNull();
    expect(headerAction(null)).toBeNull();
  });

  it('clock box: scrub danger > hold warn > paused warn', () => {
    const base = { countdown: counting, tClock: 'T−00:10:00', holding: false, holdLabel: '', paused: false };
    expect(clockState(base)).toEqual({ state: 'neutral', word: null });
    expect(clockState({ ...base, paused: true }).word).toBe('PAUSED');
    expect(clockState({ ...base, holding: true }).word).toBe('HOLD');
    expect(clockState({ ...base, countdown: { ...counting, scrubbed: true } })).toEqual({
      state: 'danger',
      word: 'SCRUB',
    });
  });

  it('renders exactly one count button while counting', () => {
    const out = html(
      h(CountdownTimelineView, {
        head: { countdown: counting, tClock: 'T−00:10:00', holding: false, holdLabel: '', paused: false },
      }),
    );
    expect(out.match(/<button/g)).toHaveLength(1);
    expect(out).toContain('T−00:10:00');
    const held = html(
      h(CountdownTimelineView, {
        head: {
          countdown: { ...counting, holding: true },
          tClock: 'T−00:10:00',
          holding: true,
          holdLabel: 'HOLD · POLL',
          paused: false,
        },
      }),
    );
    expect(held).not.toContain('<button');
    expect(held).toContain('HOLD · POLL');
  });
});

describe('live regions (§8)', () => {
  it('throttles to one announcement per 2 s and merges the backlog', () => {
    let t = 0;
    const out: string[] = [];
    const timers: (() => void)[] = [];
    const say = createAnnouncer(
      (_l, text) => out.push(text),
      () => t,
      (fn) => {
        timers.push(fn);
        return 0 as unknown as ReturnType<typeof setTimeout>;
      },
    );
    say('RATE 10×');
    expect(out).toEqual(['RATE 10×']);
    t = 500;
    say('RATE 100×');
    say('RATE 100×');
    say('PAUSED');
    expect(out).toHaveLength(1);
    t = LIVE_THROTTLE_MS;
    timers.shift()?.();
    expect(out).toEqual(['RATE 10×', 'RATE 100×. PAUSED']);
  });
});
