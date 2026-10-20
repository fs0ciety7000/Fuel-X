// 6.4 / 6.7 panel contracts: toast queue rules, tab badges + Alt keys, event filter, debrief exit actions, and the
// semantic markup of each composite rendered from fixtures (DESIGN_SYSTEM §6.7, §6.11, §6.14, §6.23, §6.29).
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as fx from '../fixtures';
import * as px from '../fixtures/panels';
import type { ActionVM, EventVM } from '../types';
import {
  Debrief,
  actionBlock,
  debriefActionId,
  debriefActions,
  decisionCode,
  isDebriefOpen,
  debriefKey,
} from './debrief';
import {
  EventLog,
  MAX_VISIBLE,
  TOAST_MS,
  dismiss,
  filterEvents,
  ingest,
  initialToasts,
  nextExpiry,
  pause,
  prune,
  resume,
  visible,
} from './events';
import { FlightCard } from './flight';
import { Inspector, inspectorAlert } from './inspector';
import { TAB_ORDER, TabbedPanel, isTyping, tabCount, tabDefs, tabForKey } from './tabs';

const html = (el: ReturnType<typeof h>): string => renderToStaticMarkup(el);

const ev = (id: string, state: EventVM['state'], code?: string): EventVM => ({
  id,
  time: '13:00:00',
  state,
  entityId: null,
  entityCode: 'LC-1',
  message: `EVENT ${id}`,
  acked: false,
  ...(code ? { code } : {}),
});

describe('toast queue', () => {
  const noAlerts = { items: [] as EventVM[] };

  it('marks the existing log as seen on the first projection and toasts only newer rows', () => {
    let s = ingest(initialToasts(), noAlerts, [ev('2', 'info'), ev('1', 'ok')], 0);
    expect(s.items).toEqual([]);
    s = ingest(s, noAlerts, [ev('3', 'warn'), ev('2', 'info'), ev('1', 'ok')], 10);
    expect(s.items.map((t) => t.key)).toEqual(['log:3']);
    expect(s.items[0]?.expiresAt).toBe(10 + (TOAST_MS.warn as number));
  });

  it('skips neutral rows and codes that already have a surface (alert, strip, timeline)', () => {
    let s = ingest(initialToasts(), noAlerts, [], 0);
    s = ingest(
      s,
      noAlerts,
      [ev('4', 'danger', 'AnomalyFired'), ev('3', 'warn', 'StationChanged'), ev('2', 'neutral'), ev('1', 'info')],
      0,
    );
    expect(s.items.map((t) => t.key)).toEqual(['log:1']);
  });

  it('toasts fresh alerts at once: danger sticky, warn 8 s; ack or a cleared condition removes them', () => {
    const danger = ev('station:RANGE', 'danger');
    const warn = ev('hold', 'warn');
    let s = ingest(initialToasts(), { items: [danger, warn] }, [], 100);
    expect(s.items.map((t) => [t.key, t.expiresAt])).toEqual([
      ['alert:station:RANGE', null],
      ['alert:hold', 8100],
    ]);
    s = ingest(s, { items: [{ ...danger, acked: true }, warn] }, [], 200);
    expect(s.items.map((t) => t.key)).toEqual(['alert:hold']);
    s = ingest(s, { items: [] }, [], 300);
    expect(s.items).toEqual([]);
    // The condition comes back → toasts again.
    s = ingest(s, { items: [warn] }, [], 400);
    expect(s.items.map((t) => t.key)).toEqual(['alert:hold']);
  });

  it('keeps the same state object when nothing changed (no re-render)', () => {
    const s = ingest(initialToasts(), { items: [ev('a', 'danger')] }, [ev('1', 'info')], 0);
    expect(ingest(s, { items: s.items.map((t) => t.event) }, [ev('1', 'info')], 50)).toBe(s);
  });

  it('expires timed toasts, pauses on hover and shifts the deadlines by the paused span', () => {
    let s = ingest(initialToasts(), noAlerts, [], 0);
    s = ingest(s, noAlerts, [ev('1', 'info')], 1000);
    expect(nextExpiry(s)).toBe(5000);
    s = pause(s, 2000);
    expect(prune(s, 9000)).toBe(s);
    expect(nextExpiry(s)).toBeNull();
    s = resume(s, 4000);
    expect(nextExpiry(s)).toBe(7000);
    expect(prune(s, 6999).items).toHaveLength(1);
    expect(prune(s, 7000).items).toHaveLength(0);
  });

  it('shows at most 3, newest first, and counts the overflow', () => {
    let s = ingest(initialToasts(), noAlerts, [], 0);
    s = ingest(
      s,
      noAlerts,
      ['5', '4', '3', '2', '1'].map((id) => ev(id, 'info')),
      0,
    );
    const v = visible(s);
    expect(v.shown.map((t) => t.event.id)).toEqual(['5', '4', '3']);
    expect(v.overflow).toBe(5 - MAX_VISIBLE);
    expect(dismiss(s, 'log:5').items).toHaveLength(4);
  });
});

describe('tabs', () => {
  it('badges show the danger count first, else warn', () => {
    const defs = tabDefs(px.lists);
    expect(defs.map((d) => d.id)).toEqual([...TAB_ORDER]);
    expect(defs.find((d) => d.id === 'vehicles')?.badge).toEqual({ count: 1, state: 'danger' });
    expect(defs.find((d) => d.id === 'tanks')?.badge).toEqual({ count: 1, state: 'warn' });
    expect(tabDefs({}).every((d) => d.badge === undefined)).toBe(true);
  });

  it('Alt+1…5 map to the five tabs; other chords and typing are ignored', () => {
    const k = (code: string, extra: Partial<KeyboardEvent> = {}) =>
      tabForKey({ altKey: true, ctrlKey: false, metaKey: false, code, key: '', ...extra });
    expect(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].map((c) => k(c))).toEqual([...TAB_ORDER]);
    expect(k('Digit6')).toBeNull();
    expect(k('Digit1', { ctrlKey: true })).toBeNull();
    expect(k('Digit1', { altKey: false })).toBeNull();
    expect(isTyping({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isTyping({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
    expect(isTyping(null)).toBe(false);
  });

  it('counts stations + assets on the Range tab', () => {
    expect(tabCount(px.lists, 'range')).toBe(px.lists.range.length + (px.lists.rangeAssets?.length ?? 0));
    expect(tabCount(px.lists, 'events')).toBe(px.eventLog.length);
  });

  it('renders each tab with ARIA tabs and its content', () => {
    for (const tab of TAB_ORDER) {
      const out = html(h(TabbedPanel, { lists: px.lists, tab }));
      expect(out).toContain('role="tablist"');
      expect(out).toContain(`data-tab="${tab}"`);
      expect(out).toMatch(/role="tab"[^>]*aria-selected="true"/);
    }
    expect(html(h(TabbedPanel, { lists: px.lists, tab: 'tanks' }))).toContain('LOX-1');
    expect(html(h(TabbedPanel, { lists: px.lists, tab: 'tasks' }))).toContain('STANDARD 4.0 M');
    expect(html(h(TabbedPanel, { lists: px.lists, tab: 'range' }))).toContain('<th scope="col">STATION</th>');
  });
});

describe('events log', () => {
  it('filters by minimum severity', () => {
    expect(filterEvents(px.eventLog, 'all')).toHaveLength(px.eventLog.length);
    expect(filterEvents(px.eventLog, 'warn').every((e) => e.state === 'warn' || e.state === 'danger')).toBe(true);
    expect(filterEvents(px.eventLog, 'danger').map((e) => e.id)).toEqual(['e1']);
  });

  it('prints log lines as <samp> with <time>', () => {
    const out = html(h(EventLog, { events: fx.events }));
    expect(out).toContain('<samp');
    expect(out).toContain('<time');
    expect(out).toContain('ENGINE OUT · 32 OF 33');
  });
});

describe('flight card', () => {
  it('renders four tiles with SI values and the farm reserve tick only pre-liftoff', () => {
    const out = html(h(FlightCard, { card: px.flightCardCounting }));
    expect(out).toContain('LC-1 FLIGHT 7');
    expect(out.match(/role="group"/g)?.length).toBe(4);
    expect(out).toContain('value="1"');
    expect(out).toContain('data-testid="farm-reserve"');
    expect(out).toContain('<meter');
    expect(html(h(FlightCard, { card: px.flightCardFlown }))).not.toContain('farm-reserve');
  });
});

describe('inspector', () => {
  it('uses macro type only for a followed call-sign', () => {
    const followed = html(h(Inspector, { vm: px.inspectorBooster }));
    const selected = html(h(Inspector, { vm: px.inspectorShip }));
    expect(followed).toMatch(/<h2[^>]*class="[^"]*callSignHero/);
    expect(selected).not.toMatch(/callSignHero/);
    expect(followed).toContain('UNFOLLOW');
    expect(selected).toContain('FOLLOW');
  });

  it('flags alert from a danger metric and marks lost entities', () => {
    expect(inspectorAlert(px.inspectorBooster)).toBe(true);
    expect(inspectorAlert(px.inspectorTanker)).toBe(false);
    const lost = html(h(Inspector, { vm: px.inspectorLost }));
    expect(lost).toContain('data-state="disabled"');
    expect(lost).toContain('LOST');
  });

  it('confirm actions get an ellipsis; disabled actions keep their reason', () => {
    const out = html(h(Inspector, { vm: px.inspectorBooster }));
    expect(out).toContain('DIVERT…');
    expect(out).toContain('IN FLIGHT');
  });
});

describe('debrief', () => {
  it('falls back to the four MVP exit actions, VIEW SITE last', () => {
    expect(debriefActions({ actions: [] }).map((a) => a.id)).toEqual(['REPLAY', 'NEW_SEED', 'EXPORT_LOG', 'VIEW_SITE']);
    const projected = debriefActions(fx.debrief);
    expect(projected.map((a) => debriefActionId(a.id))).toEqual(['REPLAY', 'NEW_SEED', 'EXPORT_LOG', 'VIEW_SITE']);
    expect(debriefActionId('something')).toBeNull();
  });

  it('prints spec decision codes only', () => {
    expect(decisionCode('D3b')).toBe('D3B');
    expect(decisionCode('0:POLL')).toBe('');
  });

  it('collapse is keyed per run', () => {
    expect(isDebriefOpen(fx.debrief, { collapsedFor: null })).toBe(true);
    expect(isDebriefOpen(fx.debrief, { collapsedFor: debriefKey(fx.debrief) })).toBe(false);
    expect(isDebriefOpen({ ...fx.debrief, countdownId: 'cd-2' }, { collapsedFor: debriefKey(fx.debrief) })).toBe(true);
    expect(isDebriefOpen(null, { collapsedFor: null })).toBe(false);
  });

  it('renders outcome, ledger table with true minus and a decision log of <samp>', () => {
    const out = html(h(Debrief, { d: px.debriefFailed, inline: true }));
    expect(out).toContain('data-outcome="CATCH_FAILED"');
    expect(out).toContain('CATCH FAILED');
    expect(out).toContain('<th scope="col">ITEM</th>');
    expect(out).toContain('−48.5');
    expect(out).toContain('<samp');
    expect(out).toContain('TOWER-1 DAMAGED · 21 D');
    expect(out).toContain('REPLAY SAME SEED');
  });
});

describe('debrief exit actions without app handlers', () => {
  it('are disabled with a reason until the app wires them; VIEW SITE always works in the HUD', () => {
    const [replay] = debriefActions({ actions: [] });
    expect(actionBlock(replay as ActionVM, {})).toBe('NOT AVAILABLE YET');
    expect(actionBlock(replay as ActionVM, { REPLAY: () => undefined })).toBeNull();
    expect(actionBlock({ ...(replay as ActionVM), enabled: false, reason: 'BUSY' }, { REPLAY: () => undefined })).toBe(
      'BUSY',
    );
  });
});
