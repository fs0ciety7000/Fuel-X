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
    expect(d.options[0]?.consequences.map((x) => x.label)).toEqual([
      'P(CATCH)',
      'BREAK-EVEN P',
      'IF CAUGHT',
      'IF FAILED',
      'TOWER DOWN IF FAILED',
    ]);
    expect(d.options.every((o) => o.ev !== undefined)).toBe(true); // EV on D3 only
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
      undefined, // NO ORDER: UI-only, the AUTO default
    ]);
    const noOrder = d.options[4];
    expect(noOrder?.id).toBe('NO_ORDER');
    expect(noOrder?.auto).toBe(true);
    // §13.2.2 preview lines on every order option
    for (const o of d.options.slice(0, 4))
      expect(o.consequences.map((x) => x.label)).toEqual([
        'COST',
        'FEE',
        'CARGO',
        'HOLD-MIN BOUGHT',
        'AT GATE',
        'RESERVE AFTER ORDERS',
        'TRUCKS BOOKED',
      ]);
    const lx = d.options[0];
    expect(lx?.consequences.find((x) => x.label === 'HOLD-MIN BOUGHT')?.value.unit).toBe('HOLD-MIN');
    expect(lx?.consequences.find((x) => x.label === 'RESERVE AFTER ORDERS')?.value.text).toMatch(
      /^LOX \d+\.\d → \d+\.\d$/,
    );
    expect(d.options.every((o) => o.ev === undefined)).toBe(true);
    expect(d.deadline.label).toBe('ROAD CLOSURE');
    expect(d.deadline.at).toBe('T−00:40:00');
    expect(d.blocking).toBe(false);
  });

  it('D2 previews: header evidence, GO risk lines, RECYCLE budgets, SCRUB certain costs; D1 queued behind (AC 30, 31)', () => {
    const p = projectedRun(42, (w) => w.countdowns.cd01?.hold?.poll === 'load', {
      ...STANDARD_AUTOPILOT,
      go: false,
      orders: [],
    });
    const d = p.project().decision;
    if (d?.kind !== 'POLL') throw new Error(`expected POLL, got ${d?.kind}`);
    expect(d.queued).toBe(1);
    expect(d.queuedKinds).toEqual(['PROP_MARGIN']);
    expect(d.evidence?.map((x) => x.label)).toEqual([
      'WINDOW LEFT',
      'EARLIEST LIFTOFF IF GO',
      'WINDOW CLOSES',
      'LOX RESERVE',
      'CH4 RESERVE',
      'CREW SHIFT LEFT',
      'EACH 10 MIN HELD',
    ]);
    // at the load poll on schedule: liftoff 80 min out, window closes 75 min after planned T-0
    expect(d.evidence?.[0]?.value).toMatchObject({ text: '75', unit: 'MIN' });
    const go = d.options.find((o) => o.id === 'GO');
    expect(go?.consequences.some((x) => x.label === 'PROPELLANT MARGINAL')).toBe(true);
    const scrub = d.options.find((o) => o.id === 'SCRUB');
    expect(scrub?.consequences.map((x) => x.label)).toEqual([
      'WINDOW-MISS PENALTY',
      'REPUTATION',
      'DETANK LOSS LOX',
      'DETANK LOSS CH4',
      'NEXT ATTEMPT',
      'RUN',
    ]);
    expect(scrub?.consequences[0]?.value.text).toBe('−15.00');
    expect(scrub?.consequences[1]?.value.text).toBe('−10');
    const rec = d.options.find((o) => o.id === 'RECYCLE');
    expect(rec?.consequences[0]?.label).toBe('T-CLOCK BACK TO');
    expect(d.options.every((o) => o.ev === undefined)).toBe(true);
  });

  it('D3b previews and deadline = leak.deadlineTick (onset + 300 s), outranking D2 / D1', () => {
    const p = projectedRun(42, (w) => !!w.countdowns.cd01 && !!w.anomalies.cd01?.leak.active, {
      ...STANDARD_AUTOPILOT,
      leakResponse: null,
    });
    const d = p.project().decision;
    if (d?.kind !== 'LEAK') throw new Error(`expected LEAK, got ${d?.kind}`);
    const leak = p.run.world.anomalies.cd01?.leak;
    expect(d.deadline.tick).toBe(leak?.deadlineTick);
    expect(d.deadline.remaining.value).toBeLessThanOrEqual(300);
    const [deg, fix] = d.options;
    expect(deg?.id).toBe('DEGRADED');
    expect(deg?.auto).toBe(true);
    expect(deg?.consequences.map((x) => x.label)).toContain('VEHICLE');
    expect(deg?.consequences.find((x) => x.label === 'VEHICLE')?.value.text).toContain('ENGINE-OUT RISK ×2.0 IF GO');
    expect(deg?.consequences.filter((x) => x.label.endsWith(' FULL'))).toHaveLength(2);
    expect(fix?.id).toBe('HOLD_FIX');
    expect(fix?.consequences.map((x) => x.label).slice(0, 4)).toEqual([
      'HOLD',
      'WINDOW LEFT AFTER FIX',
      'LOX RESERVE AFTER FIX',
      'CH4 RESERVE AFTER FIX',
    ]);
    expect(d.options.every((o) => o.ev === undefined)).toBe(true);
  });
});
