// 8.2 open item (QA "Phase 8 accessibility & keyboard audit" #12): rate keys act on the authoritative time state
// (`session.rateState()`), not on the ≤ 10 Hz projection, so two presses inside one projection interval act twice.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projectionStore, session, viewStore } from '@bridge/index';
import type { Rate, RateStateVM, TimeScaleVM } from '@bridge/index';
import * as fx from '../../fixtures';
import { liveTimeScale } from '../topbar/rate';
import { handleHudKey } from './keys';

const key = (k: string): KeyboardEvent =>
  ({
    key: k,
    defaultPrevented: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target: null,
  }) as unknown as KeyboardEvent;

/**
 * Stand-in for the app: a TimeControl-like state that applies `view.timeScale` requests synchronously (as
 * `Game.applyView` does) and a projection that is NOT republished in between (the 10 Hz projector has not run).
 */
function rig(start: { paused: boolean; requested: Exclude<Rate, 0> }, projected: TimeScaleVM) {
  const t = { ...start };
  const requests: Rate[] = [];
  const offView = viewStore.subscribe((s, prev) => {
    if (!s.timeScale || s.timeScale.seq === prev.timeScale?.seq) return;
    requests.push(s.timeScale.scale);
    if (s.timeScale.scale === 0) t.paused = true;
    else {
      t.requested = s.timeScale.scale;
      t.paused = false;
    }
  });
  const offRate = session.bindRateState((): RateStateVM => ({
    paused: t.paused,
    requested: t.paused ? 0 : t.requested,
    resumeRate: t.requested,
  }));
  projectionStore.setState({ timeScale: projected, debrief: null });
  return {
    requests,
    off: () => {
      offView();
      offRate();
    },
  };
}

describe('rate keys read the authoritative time state (8.2)', () => {
  const before = projectionStore.getState();
  let off: () => void = () => undefined;
  // keys.ts tests `target instanceof HTMLElement`; node has no DOM.
  beforeEach(() => vi.stubGlobal('HTMLElement', function HTMLElement() {}));
  afterEach(() => {
    off();
    projectionStore.setState(before, true);
    vi.unstubAllGlobals();
  });

  it('Space twice inside one projection interval resumes then pauses (was: resumed twice)', () => {
    const r = rig({ paused: true, requested: 10 }, { ...fx.timeScales.paused, resumeRate: 10 });
    off = r.off;
    expect(handleHudKey(key(' '))).toBe(true);
    expect(handleHudKey(key(' '))).toBe(true);
    expect(r.requests).toEqual([10, 0]);
  });

  it('`.` twice steps 1× → 10× → 100×, `,` twice steps back down (was: the same step twice)', () => {
    const projected: TimeScaleVM = { ...fx.timeScales.running, requested: 1, effective: 1, resumeRate: 1 };
    const r = rig({ paused: false, requested: 1 }, projected);
    off = r.off;
    handleHudKey(key('.'));
    handleHudKey(key('.'));
    handleHudKey(key(','));
    handleHudKey(key(','));
    expect(r.requests).toEqual([10, 100, 10, 1]);
  });

  it('falls back to the projection while the app has not bound the getter', () => {
    expect(session.rateState()).toBeNull();
    const ts = fx.timeScales.running;
    expect(liveTimeScale(ts, null)).toBe(ts);
    expect(liveTimeScale(ts, { paused: true, requested: 0, resumeRate: 10 })).toMatchObject({
      paused: true,
      requested: 0,
      resumeRate: 10,
      maxAllowed: ts.maxAllowed,
    });
  });
});
