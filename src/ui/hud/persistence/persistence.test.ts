// 8.3 resume offer markup, the SAVE · LOAD key and the bridge port (DESIGN_SYSTEM §6.38).
import { createPersistencePort, initialPersistenceState } from '@bridge/persistence';
import type { PersistenceState } from '@bridge/persistence';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { ResumeDialog, isSaveMenuKey } from './Persistence';

const OFFER = {
  seed: '42',
  tClock: 'T-04:44:59',
  phase: 'STANDBY',
  savedAt: '2026-10-21 14:22 UTC',
  reason: 'MILESTONE STANDARD ORDER LAST CALL',
};
const noop = (): void => undefined;

describe('persistence UI', () => {
  it('prints the offer as a fact list with CONTINUE first (default focus) and NEW RUN', () => {
    const html = renderToStaticMarkup(
      h(ResumeDialog, {
        offer: OFFER,
        inline: true,
        onContinue: noop,
        onNewRun: noop,
        status: { state: 'danger', text: 'CORRUPT SAVE · NOT READABLE JSON' },
      }),
    );
    expect(html).toContain('RESUME RUN');
    expect(html.indexOf('CONTINUE')).toBeLessThan(html.indexOf('NEW RUN'));
    for (const v of Object.values(OFFER)) expect(html).toContain(v);
    expect(html).toMatch(/<dl[^>]*>.*<dt>SEED<\/dt><dd>42<\/dd>/);
    expect(html).toContain('role="alert"');
  });

  it('opens the sheet on Ctrl/⌘+S only', () => {
    const k = (key: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {}) => ({
      key,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      ...mods,
    });
    expect(isSaveMenuKey(k('s', { ctrlKey: true }))).toBe(true);
    expect(isSaveMenuKey(k('S', { metaKey: true }))).toBe(true);
    expect(isSaveMenuKey(k('s'))).toBe(false);
    expect(isSaveMenuKey(k('s', { ctrlKey: true, shiftKey: true }))).toBe(false);
  });

  it('port: drops calls while unbound, routes them once bound; menu intents write the store', () => {
    const store = createStore<PersistenceState>(() => initialPersistenceState());
    const port = createPersistencePort(store);
    port.exportSave();
    expect(port.stats).toEqual({ calls: 0, dropped: 1 });
    const seen: string[] = [];
    const off = port.bind({
      continueRun: () => seen.push('continue'),
      newRun: () => seen.push('new'),
      exportSave: () => seen.push('export'),
      importSave: (f) => seen.push(`import:${f.size}`),
    });
    port.continueRun();
    port.importSave(new Blob(['abc']));
    expect(seen).toEqual(['continue', 'import:3']);
    off();
    port.newRun();
    expect(port.stats.dropped).toBe(2);
    port.openMenu();
    expect(store.getState().menuOpen).toBe(true);
    port.closeMenu();
    expect(store.getState().menuOpen).toBe(false);
  });
});
