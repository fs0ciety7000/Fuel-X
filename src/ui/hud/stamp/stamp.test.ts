// Phase stamp (§6.26): only real, running phase changes print; header numbering.
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as fx from '../../fixtures';
import { PhaseStampView } from './PhaseStamp';
import { activePhase, stampFor } from './stamp';

describe('phase stamp', () => {
  const term = activePhase(fx.countdown);

  it('names the current phase with its index', () => {
    expect(term).toEqual({ id: 'TerminalCount', label: 'TERMINAL COUNT', header: 'PHASE 04 / 08' });
    expect(activePhase(null)).toBeNull();
  });

  it('prints on a running change only, never on first sight, a jump (paused) or the same phase', () => {
    const lift = { id: 'Liftoff', label: 'LIFTOFF', header: 'PHASE 05 / 08' };
    expect(stampFor(term, lift, true)).toBe(lift);
    expect(stampFor(term, lift, false)).toBeNull();
    expect(stampFor(null, lift, true)).toBeNull();
    expect(stampFor(lift, lift, true)).toBeNull();
    expect(stampFor(lift, null, true)).toBeNull();
  });

  it('is aria-hidden (the countdown live region announces)', () => {
    const out = renderToStaticMarkup(
      h(PhaseStampView, { stamp: { id: 'Liftoff', label: 'LIFTOFF', header: 'PHASE 05 / 08' } }),
    );
    expect(out).toContain('aria-hidden="true"');
    expect(out).toContain('[ PHASE 05 / 08 ]');
  });
});
