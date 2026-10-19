// Decision VM correctness (D2 poll, D3 catch EV, D1 options) on real scenario states.
import { describe, expect, it } from 'vitest';
import { catchModel as cm, economy as ec } from '../../src/data/index';
import { STANDARD_AUTOPILOT, catchBreakEvenP } from '../../src/sim/index';
import type { World } from '../../src/sim/index';
import { projectedRun } from './harness';

const booster = (w: World) => Object.values(w.entities.byId).find((e) => e.kind === 'booster');

describe('decision VM', () => {
  it('D3 catch: p, band, EV and auto choice follow the catch model', () => {
    const p = projectedRun(
      42,
      (w) => {
        const b = booster(w);
        return (
          b?.kind === 'booster' &&
          b.recovery?.decisionRequiredTick !== null &&
          b.recovery !== null &&
          w.tick > (b.recovery.decisionRequiredTick ?? 0) + 30
        );
      },
      { ...STANDARD_AUTOPILOT, catchDecision: false },
    );
    const ui = p.project();
    const d = ui.decision;
    if (d?.kind !== 'CATCH') throw new Error(`expected CATCH, got ${d?.kind}`);
    const b = booster(p.run.world);
    if (b?.kind !== 'booster' || !b.recovery) throw new Error('no booster');
    const pr = b.recovery.p;
    const failed = ec.boosterReplacementCostCr + ec.towerRepairCostCr + ec.towerRepairDowntimeS * ec.opsCostCrPerS;
    expect(d.p.text).toBe(pr.toFixed(2));
    expect(d.ev?.catch.value).toBeCloseTo(-(1 - pr) * failed, -4);
    expect(d.ev?.divert.value).toBe(-ec.boosterReplacementCostCr);
    expect(d.ev?.favours).toBe(pr > catchBreakEvenP() ? 'CATCH' : 'DIVERT');
    expect(d.breakEven).toBeCloseTo(0.535, 2);
    expect(d.autoChoice).toBe(pr >= cm.autoCatchThreshold ? 'CATCH' : 'DIVERT');
    expect(d.band).toBe(pr >= 0.9 ? 'CLEAR' : pr >= 0.65 ? 'LEAN' : pr >= 0.45 ? 'CONTESTED' : 'AGAINST');
    expect(d.options.map((o) => o.command)).toEqual([
      { t: 'CatchDecision', boosterId: b.id, choice: 'CATCH' },
      { t: 'CatchDecision', boosterId: b.id, choice: 'DIVERT' },
    ]);
    expect(d.options.every((o) => o.enabled)).toBe(true);
    expect(d.deadline.at.startsWith('T+00:06:')).toBe(true); // landing burn T+380 s
    expect(d.blocking).toBe(true);
    // the inspector of the booster carries the same buttons
    const sel = p.project({ selectedId: b.id });
    expect(sel.inspector?.actions.map((a) => a.id)).toEqual(['CATCH', 'DIVERT']);
  });

  it('D2 poll: holding at the load poll offers GO / RECYCLE / SCRUB with the blocker', () => {
    const p = projectedRun(42, (w) => w.countdowns.cd01?.hold?.poll === 'load', { ...STANDARD_AUTOPILOT, go: false });
    const d = p.project().decision;
    if (d?.kind !== 'POLL') throw new Error(`expected POLL, got ${d?.kind}`);
    expect(d.poll).toBe('load');
    expect(d.options.map((o) => o.id)).toEqual(['GO', 'RECYCLE', 'SCRUB']);
    expect(d.options.find((o) => o.id === 'SCRUB')?.confirm).toBe(true);
    expect(d.options.find((o) => o.id === 'RECYCLE')?.enabled).toBe(false);
    expect(d.stations).toHaveLength(5);
    expect(d.title).toContain('LOAD POLL');
  });

  it('D1 propellant margin at the start: four orders before the road closes', () => {
    const p = projectedRun(42, (w) => w.tick >= 30, { ...STANDARD_AUTOPILOT, orders: [] });
    const d = p.project().decision;
    if (d?.kind !== 'PROP_MARGIN') throw new Error(`expected PROP_MARGIN, got ${d?.kind}`);
    expect(d.options.map((o) => o.command)).toEqual([
      { t: 'OrderDelivery', fluid: 'LOX', rush: false },
      { t: 'OrderDelivery', fluid: 'LOX', rush: true },
      { t: 'OrderDelivery', fluid: 'CH4', rush: false },
      { t: 'OrderDelivery', fluid: 'CH4', rush: true },
    ]);
    expect(d.deadline.label).toBe('ROAD CLOSURE');
    expect(d.deadline.at).toBe('T−00:40:00');
    expect(d.blocking).toBe(false);
  });
});
