// Decision strip + poll panel (6.5, AC 19 / 23 / 28 / 30 / 31): keys, queue chip, D1 collapse, press outcomes, render.
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as fx from '../../fixtures';
import type { DecisionOptionVM, PropMarginDecisionVM } from '../../types';
import { skipIntent } from '../topbar/rate';
import {
  BAND_STATE,
  collapsedLine,
  keyOf,
  openAnnouncement,
  optionForKey,
  pressOutcome,
  queuedLabel,
  startsCollapsed,
} from './decision';
import { DecisionStripView } from './DecisionStrip';
import { pollResult, pollState, PollPanelView } from './PollPanel';

const html = (el: ReturnType<typeof h>): string => renderToStaticMarkup(el);
const opt = (o: Partial<DecisionOptionVM>): DecisionOptionVM => ({
  id: 'x',
  label: 'X',
  key: '',
  variant: 'secondary',
  enabled: true,
  consequences: [],
  auto: false,
  confirm: false,
  ...o,
});

const prop: PropMarginDecisionVM = {
  ...fx.decisionProp,
  deadline: { ...fx.decisionProp.deadline, label: 'ROAD CLOSURE' },
  reserves: [
    { key: 'lox', label: 'LOX RESERVE', value: { text: '0.60', unit: 'H', value: 2160 }, state: 'warn' },
    { key: 'ch4', label: 'CH4 RESERVE', value: { text: '0.90', unit: 'H', value: 3240 }, state: 'neutral' },
  ],
  options: [
    opt({
      id: 'ORDER_LOX_STANDARD',
      label: 'LX STANDARD',
      variant: 'primary',
      command: { t: 'OrderDelivery', fluid: 'LOX', rush: false },
    }),
    opt({ id: 'NO_ORDER', label: 'NO ORDER', key: 'Esc', auto: true }),
  ],
};

describe('decision logic (§6.28)', () => {
  it('maps option key hints to keyboard keys', () => {
    expect(keyOf('⏎')).toBe('Enter');
    expect(keyOf('Esc')).toBe('Escape');
    expect(keyOf('D')).toBe('d');
    expect(keyOf('')).toBe('');
    const options = fx.decisionCatch.options;
    expect(optionForKey(options, 'Enter')?.id).toBe('catch');
    expect(optionForKey(options, 'D')?.id).toBe('divert');
    expect(optionForKey(options, 'd')?.id).toBe('divert');
    expect(optionForKey(options, 'x')).toBeNull();
  });

  it('queued chip lists waiting kinds in D3 > D3b > D2 > D1 order (AC 30)', () => {
    expect(queuedLabel({ ...fx.decisionCatch, queued: 0 })).toBe('');
    expect(queuedLabel({ ...fx.decisionCatch, queued: 2, queuedKinds: ['PROP_MARGIN', 'POLL'] })).toBe(
      '+2 QUEUED · D2 D1',
    );
    expect(queuedLabel({ ...fx.decisionLeak, queued: 1 })).toBe('+1 QUEUED');
  });

  it('D1 opens collapsed; blocking decisions do not', () => {
    expect(startsCollapsed(prop)).toBe(true);
    expect(startsCollapsed(fx.decisionPoll)).toBe(false);
    expect(collapsedLine(prop)).toBe('D1 · ROAD CLOSURE IN 03:12:00 · LOX RESERVE 0.60 H · CH4 RESERVE 0.90 H');
  });

  it('press: send, confirm irreversible, collapse UI-only NO ORDER, block disabled', () => {
    const [go, , , scrub] = fx.decisionPoll.options;
    const noOrder = prop.options[1];
    if (!go || !scrub || !noOrder) throw new Error('fixture options');
    expect(pressOutcome(opt({ command: { t: 'Go', countdownId: 'c' } }))).toBe('send');
    expect(pressOutcome({ ...scrub, command: { t: 'Scrub', countdownId: 'c' } })).toBe('confirm');
    expect(pressOutcome(noOrder)).toBe('collapse');
    expect(pressOutcome(go)).toBe('blocked');
  });

  it('band words map to the §2.3 severities and the open announcement carries p and deadline', () => {
    expect(BAND_STATE).toEqual({ CLEAR: 'ok', LEAN: 'info', CONTESTED: 'warn', AGAINST: 'danger' });
    expect(openAnnouncement(fx.decisionCatch)).toContain('P 0.62 LEAN');
  });

  it('skip intent: start, cancel, or the reason', () => {
    const t = fx.timeScales.running;
    expect(skipIntent(t, false)).toBe('start');
    expect(skipIntent({ ...t, skip: { ...t.skip, active: true } }, false)).toBe('cancel');
    expect(skipIntent(fx.timeScales.locked, false)).toEqual({ blocked: 'FORCED 1×' });
    expect(skipIntent(t, true)).toEqual({ blocked: 'RUN ENDED' });
  });
});

describe('decision strip render', () => {
  it('D3: p, band, break-even tick, drivers, EV on both options, AUTO tag, deadline', () => {
    const out = html(h(DecisionStripView, { d: fx.decisionCatch, dropLabel: '1× · DECISION OPEN' }));
    expect(out).toContain('data-testid="evidence-catch"');
    expect(out).toContain('LEAN');
    expect(out).toContain('ENGINE OUT');
    expect(out.match(/>EV</g)).toHaveLength(2);
    expect(out).toContain('>AUTO<');
    expect(out).toContain('1× · DECISION OPEN');
    expect(out).toContain('role="group"'); // deadline bar
  });

  it('D2: station chips, disabled GO prints its reason, SCRUB is danger', () => {
    const out = html(h(DecisionStripView, { d: fx.decisionPoll }));
    expect(out).toContain('data-testid="evidence-poll"');
    expect(out).toContain('RANGE NO-GO');
    expect(out).toMatch(/data-variant="danger"/);
    expect(out).toContain('data-state="danger"');
  });

  it('D1 collapsed prints one line and the expand button; expanded shows the options', () => {
    const c = html(h(DecisionStripView, { d: prop, collapsed: true }));
    expect(c).toContain('ROAD CLOSURE IN 03:12:00');
    expect(c).toContain('ORDER ▸');
    expect(c).not.toContain('data-testid="option-');
    const e = html(h(DecisionStripView, { d: prop }));
    expect(e).toContain('data-testid="option-ORDER_LOX_STANDARD"');
    expect(e).toContain('data-testid="evidence-prop"');
  });

  it('SENT: the pressed option is busy, the others inert', () => {
    const out = html(h(DecisionStripView, { d: fx.decisionCatch, pending: 'catch' }));
    expect(out).toContain('SENT · GO FOR CATCH');
    expect(out).toContain('aria-busy="true"');
  });
});

describe('poll panel (§6.24)', () => {
  it('result and severity come from the projected stations', () => {
    expect(pollResult(fx.stations)).toMatch(/OF 5 GO$/);
    expect(pollResult(fx.stations, '1 MARGINAL · 1 NO-GO · 3 OF 5 GO')).toBe('1 MARGINAL · 1 NO-GO · 3 OF 5 GO');
    expect(pollState(fx.stations)).toBe('danger');
  });

  it('open: station table, no count buttons (AC 28); closed: header only', () => {
    const vm = { stations: fx.stations, pollLabel: 'TERMINAL POLL', tClock: 'T−00:10:00', result: '', open: true };
    const out = html(h(PollPanelView, { vm }));
    expect(out).toContain('<table');
    expect(out.match(/<tr data-state/g)).toHaveLength(fx.stations.length);
    expect(out).not.toMatch(/>(GO|HOLD|RECYCLE|SCRUB)<\/span><\/button>/);
    const closed = html(h(PollPanelView, { vm: { ...vm, open: false } }));
    expect(closed).not.toContain('<table');
    expect(closed).toContain('aria-expanded="false"');
  });
});
