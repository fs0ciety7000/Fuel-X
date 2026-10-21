// 8.2 accessibility & keyboard audit: focus order, search stub, key mapping and accessible-name contracts.
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { view, viewStore } from '@bridge/index';
import { Button, keyShortcut } from '../components/Button';
import * as fx from '../fixtures';
import * as panels from '../fixtures/panels';
import { HudFrame } from './frame/HudFrame';
import { escapeStep } from './frame/keys';
import { FOCUS_ORDER, HUD_SLOTS } from './frame/slots';
import { clearSearch, filterLists, isSearchKey, searchUi, SearchFieldView, setSearchQuery } from './search';
import { TabbedPanel } from './tabs/TabbedPanel';
import { RateControlView } from './topbar/RateControl';
import { mapKey } from './world/MapControls';

const html = (el: ReturnType<typeof h>): string => renderToStaticMarkup(el);

describe('focus order (§8)', () => {
  it('lists every slot exactly once', () => {
    expect([...FOCUS_ORDER].sort()).toEqual([...HUD_SLOTS].sort());
  });

  it('renders top → flight → poll → inspector → tabs → strip → timeline → map controls in the DOM', () => {
    const names = ['top', 'flight', 'poll', 'inspect', 'tabs', 'strip', 'time', 'ctrl'] as const;
    const slots = Object.fromEntries(names.map((n) => [n, h('b', null, n)]));
    const out = html(h(HudFrame, { slots }));
    const order = [...out.matchAll(/data-slot="(\w+)"/g)].map((m) => m[1]);
    expect(order).toEqual([...names]);
  });
});

describe('search stub (§6.3)', () => {
  afterEach(() => clearSearch());

  it('filters each tab by call-sign or text, case-insensitive; empty query = same lists', () => {
    expect(filterLists(panels.lists, '  ')).toBe(panels.lists);
    const lox = filterLists(panels.lists, 'lox');
    expect(lox.tanks.map((t) => t.name)).toEqual(
      panels.lists.tanks.filter((t) => /LOX/.test(t.name + t.sub)).map((t) => t.name),
    );
    expect(lox.tanks.length).toBeGreaterThan(0);
    expect(filterLists(panels.lists, 'b-09').vehicles.every((r) => /B-09/.test(`${r.name} ${r.sub}`))).toBe(true);
    expect(filterLists(panels.lists, 'zzz-none').vehicles).toEqual([]);
  });

  it('the tabbed panel prints n OF m and NO MATCH', () => {
    const lists = { ...panels.lists, vehicles: fx.vehicles };
    const some = html(h(TabbedPanel, { lists, tab: 'vehicles', query: 'rv-1' }));
    expect(some).toContain(`1 OF ${fx.vehicles.length}`);
    const none = html(h(TabbedPanel, { lists, tab: 'vehicles', query: 'zzz' }));
    expect(none).toContain('NO MATCH · ZZZ');
  });

  it('is a named search landmark with a labelled search field; `/` and Ctrl/⌘+K focus it', () => {
    const out = html(h(SearchFieldView, { query: '' }));
    expect(out).toContain('role="search"');
    expect(out).toContain('type="search"');
    expect(out).toContain('aria-label="Filter the open tab"');
    expect(out).toContain('aria-keyshortcuts="/"');
    const k = (key: string, mods: Partial<KeyboardEvent> = {}) =>
      isSearchKey({ key, ctrlKey: false, metaKey: false, altKey: false, ...mods });
    expect(k('/')).toBe(true);
    expect(k('k', { ctrlKey: true })).toBe(true);
    expect(k('k', { metaKey: true })).toBe(true);
    expect(k('k')).toBe(false);
    expect(k('/', { altKey: true })).toBe(false);
  });
});

describe('Esc chain (§8): clear search → deselect', () => {
  afterEach(() => {
    clearSearch();
    view.select(null);
  });

  it('one step per press', () => {
    setSearchQuery('lox');
    view.select('B-09');
    expect(escapeStep()).toBe(true);
    expect(searchUi.getState().query).toBe('');
    expect(viewStore.getState().selectedId).toBe('B-09');
    expect(escapeStep()).toBe(true);
    expect(viewStore.getState().selectedId).toBe(null);
    expect(escapeStep()).toBe(false);
  });
});

describe('map keys (§8)', () => {
  it('plain H = home; Shift+H is left to the timeline hold', () => {
    expect(mapKey('h')).toBe('home');
    expect(mapKey('H', true)).toBe(null);
    expect(mapKey('+')).toBe('zoomIn');
    expect(mapKey('−')).toBe('zoomOut');
    expect(mapKey('q')).toBe('rotateLeft');
    expect(mapKey('E')).toBe('rotateRight');
    expect(mapKey('z')).toBe('frame');
    expect(mapKey('c')).toBe('recenter');
  });
});

describe('accessible names (WCAG 2.5.3 label in name)', () => {
  it('key hints are aria-keyshortcuts, not part of the name', () => {
    expect(keyShortcut('⏎')).toBe('Enter');
    expect(keyShortcut('Esc')).toBe('Escape');
    expect(keyShortcut('⇧H')).toBe('Shift+H');
    expect(keyShortcut('N')).toBe('N');
    expect(keyShortcut('ALT 1')).toBeUndefined();
    const out = html(h(Button, { kbd: '⇧H', disabledReason: 'NO COUNT', children: 'HOLD' }));
    expect(out).toContain('aria-keyshortcuts="Shift+H"');
    expect(out).toMatch(/<kbd[^>]*aria-hidden="true"/);
    expect(out).toMatch(/<span id="[^"]+"[^>]*aria-hidden="true">NO COUNT<\/span>/);
  });

  it('the skip button is named by its visible milestone, without an aria-label', () => {
    const out = html(h(RateControlView, { ts: fx.timeScales.running, ended: false, onSkip: () => {} }));
    const skip = /<button[^>]*aria-keyshortcuts="N"[^>]*>/.exec(out)?.[0] ?? '';
    expect(skip).not.toContain('aria-label');
    expect(out).toContain('Skip to ');
  });
});
