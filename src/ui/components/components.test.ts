// Primitive contracts (DESIGN_SYSTEM §6, 6.2): semantic elements, missing/stale/disabled states, pure helpers.
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as fx from '../fixtures';
import { Badge } from './Badge';
import { Button, SegmentedControl } from './Button';
import { DeadlineBar } from './DeadlineBar';
import { Dialog } from './Dialog';
import { GLYPHS, GlyphSprite } from './Glyph';
import { List } from './List';
import { MetricTile } from './MetricTile';
import { SegmentedProgress } from './SegmentedProgress';
import { sparkPaths } from './Sparkline';
import { Tabs } from './Tabs';
import { Toast } from './Toast';
import { Value, val } from './Value';

const html = (el: ReturnType<typeof h>): string => renderToStaticMarkup(el);

describe('Value', () => {
  it('renders SI value in <data> and the unit beside it', () => {
    const out = html(h(Value, { v: val('47', 13.06, 'KM/H', { width: 5 }) }));
    expect(out).toContain('<data');
    expect(out).toContain('value="13.06"');
    expect(out).toContain('min-width:5ch');
    expect(out).toContain('KM/H');
  });
  it('prints an em dash in the same slot when missing, without unit', () => {
    const out = html(h(Value, { v: val('', null, 'KM') }));
    expect(out).toContain('—');
    expect(out).not.toContain('KM');
  });
  it('marks stale values', () => {
    expect(html(h(Value, { v: val('8.3', 8300, 'KM', { stale: true }) }))).toContain('aria-description="stale"');
  });
});

describe('sparkPaths', () => {
  it('splits polylines at null gaps and keeps the last point', () => {
    const { paths, last } = sparkPaths([1, 2, null, 3, 4]);
    expect(paths).toHaveLength(2);
    expect(last?.[0]).toBe(120);
  });
  it('handles empty and flat series', () => {
    expect(sparkPaths([]).paths).toEqual([]);
    const flat = sparkPaths([5, 5, 5]);
    expect(flat.paths).toHaveLength(1);
    expect(flat.paths[0]).not.toContain('NaN');
  });
  it('clamps to a fixed domain', () => {
    const { y } = sparkPaths([0, 10], 0, 1);
    expect(y(10)).toBe(y(1));
  });
});

describe('SegmentedProgress', () => {
  it('exposes a <meter> and draws one cell per unit up to 12', () => {
    const out = html(h(SegmentedProgress, { seg: { value: 3, max: 5, label: 'Stages' } }));
    expect(out).toMatch(/<meter[^>]*max="5"[^>]*value="3"/);
    expect(out.match(/data-fill="on"/g)).toHaveLength(3);
    expect(out.match(/data-fill="off"/g)).toHaveLength(2);
  });
  it('compresses 33 engines into 11 cells of 3', () => {
    const out = html(h(SegmentedProgress, { seg: { value: 32, max: 33, label: 'Engines' } }));
    expect(out.match(/data-fill=/g)).toHaveLength(11);
    expect(out.match(/data-fill="part"/g)).toHaveLength(1);
  });
});

describe('Button', () => {
  it('keeps disabled buttons focusable with a reachable reason', () => {
    const out = html(h(Button, { disabledReason: 'RANGE NO-GO', kbd: 'G', children: 'GO' }));
    expect(out).toContain('aria-disabled="true"');
    expect(out).toContain('aria-describedby');
    expect(out).toContain('RANGE NO-GO');
    expect(out).not.toMatch(/\sdisabled=""/);
    expect(out).toContain('<kbd');
  });
});

describe('SegmentedControl', () => {
  it('is a radiogroup with one tabbable radio and capped cells still selectable', () => {
    const out = html(
      h(SegmentedControl<number>, {
        label: 'Time rate',
        value: 10,
        effective: 1,
        options: [
          { value: 1, label: '1×' },
          { value: 10, label: '10×', capReason: 'LOCKED' },
        ],
      }),
    );
    expect(out).toContain('role="radiogroup"');
    expect(out.match(/tabindex="0"/g)).toHaveLength(1);
    expect(out).toContain('data-capped="true"');
    expect(out).toContain('data-effective="true"');
    expect(out).not.toContain('aria-disabled');
  });
});

describe('List', () => {
  it('renders a listbox of options with selection state', () => {
    const out = html(h(List, { label: 'Vehicles', rows: fx.vehicles }));
    expect(out).toContain('role="listbox"');
    expect(out.match(/role="option"/g)).toHaveLength(fx.vehicles.length);
    expect(out.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(out).toContain('FOLLOWING');
  });
  it('shows the empty text', () => {
    expect(html(h(List, { label: 'Tasks', rows: [], emptyText: 'NO OPEN TASKS' }))).toContain('NO OPEN TASKS');
  });
});

describe('Badge, MetricTile, DeadlineBar, Toast, Tabs, Dialog', () => {
  it('badge carries a live <output>', () => {
    const out = html(h(Badge, { label: 'RANGE', value: 'NO-GO', glyph: 'danger', state: 'danger' }));
    expect(out).toMatch(/<output[^>]*aria-live="polite"/);
  });
  it('metric tile uses a <dl> and labels the group', () => {
    const out = html(h(MetricTile, { metric: fx.metrics.prop }));
    expect(out).toContain('<dl');
    expect(out).toContain('role="group"');
    expect(out).toContain('role="img"');
  });
  it('deadline bar exposes a <progress> and flags expiry', () => {
    expect(html(h(DeadlineBar, { d: fx.deadlines.held }))).toContain('HELD');
    const out = html(h(DeadlineBar, { d: fx.deadlines.expired }));
    expect(out).toContain('<progress');
    expect(out).toContain('EXPIRED');
  });
  it('danger toasts are alerts without a dismiss button', () => {
    const out = html(h(Toast, { event: fx.event.danger, onDismiss: () => undefined }));
    expect(out).toContain('role="alert"');
    expect(out).not.toContain('Dismiss');
    expect(html(h(Toast, { event: fx.event.ok, onDismiss: () => undefined }))).toContain('role="status"');
  });
  it('tabs wire tablist / tab / tabpanel', () => {
    const out = html(
      h(Tabs, {
        label: 'Panels',
        active: 'b',
        tabs: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B', badge: { count: 2, state: 'danger' } },
        ],
        children: 'x',
      }),
    );
    expect(out).toContain('role="tablist"');
    expect(out.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(out).toContain('role="tabpanel"');
  });
  it('inline dialog lists consequences', () => {
    const out = html(
      h(Dialog, {
        title: 'SCRUB?',
        open: true,
        inline: true,
        danger: true,
        consequences: fx.decisionPoll.options[3]?.consequences ?? [],
        actions: null,
      }),
    );
    expect(out).toContain('<dialog');
    expect(out).toContain('<dl');
    expect(out).toContain('PENALTY');
  });
});

describe('Glyph sprite', () => {
  it('defines one symbol per glyph id', () => {
    const out = html(h(GlyphSprite));
    for (const id of Object.keys(GLYPHS)) expect(out).toContain(`id="g-${id}"`);
  });
});

describe('fixtures', () => {
  it('cover every decision kind and outcome-bearing view model', () => {
    const kinds = [fx.decisionProp, fx.decisionPoll, fx.decisionCatch, fx.decisionLeak].map((d) => d.kind);
    expect(kinds).toEqual(['PROP_MARGIN', 'POLL', 'CATCH', 'LEAK']);
    expect(fx.decisionProp.blocking).toBe(false);
    expect(fx.projection.range.stations).toHaveLength(5);
  });
});

// CSS is covered by stylelint (color-no-hex, function/property bans); this guards TS/TSX inline styles.
describe('design tokens only (design-tokens skill grep)', () => {
  const sources = import.meta.glob<string>(
    ['./*.{ts,tsx}', '!./*.test.ts', '../design/*.{ts,tsx}', '../fixtures/*.ts'],
    { query: '?raw', import: 'default', eager: true },
  );
  it('covers the primitives', () => expect(Object.keys(sources).length).toBeGreaterThan(18));
  it.each(Object.entries(sources))('%s has no literal colors, radius, shadows, gradients or blur', (_file, src) => {
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|border-radius|box-shadow|gradient\(|backdrop-filter/);
  });
});
