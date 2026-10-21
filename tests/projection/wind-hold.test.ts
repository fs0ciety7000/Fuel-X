// AC 26 / AC 6 (GDD §13.3): a transporter held by the gust reads `WIND HOLD` with the gust value on its label tag,
// list row and inspector, so the stillness on the roads has a visible cause. Seed 42, standard autopilot: SP-42
// enters WIND_HOLD at T-02:19:28 (golden log).
import { logistics as ld } from '@data/index';
import { describe, expect, it } from 'vitest';
import type { World } from '../../src/sim/index';
import { projectedRun } from './harness';

const heldTransporter = (w: World): string | null => {
  for (const id of w.entities.order) {
    const e = w.entities.byId[id];
    if (e?.kind === 'transporter' && e.fsm.state === 'WIND_HOLD') return id;
  }
  return null;
};

describe('transporter wind hold (AC 26)', () => {
  const p = projectedRun(42, (w) => heldTransporter(w) !== null);
  const id = heldTransporter(p.run.world) ?? '';
  const gust = p.run.world.weather.groundGustMPerS;
  const ui = p.project({ selectedId: id });
  const want = `GUST ${gust.toFixed(1)} M/S`;

  it('is held above the transporter gust limit', () => {
    expect(id).not.toBe('');
    expect(gust).toBeGreaterThan(ld.windLimit.transporterMPerS);
  });

  it('label tag and list row read WIND HOLD with the gust', () => {
    const label = ui.labels.find((l) => l.id === id);
    expect(label?.statusLabel).toContain('WIND HOLD');
    expect(label?.statusLabel).toContain(want);
    expect(ui.lists.vehicles.find((r) => r.id === id)?.status).toContain(want);
  });

  it('inspector shows the status with the gust and GUST / GUST LIMIT metrics', () => {
    expect(ui.inspector?.status.label).toContain(want);
    const m = ui.inspector?.metrics.map((x) => [x.key, x.value.text]) ?? [];
    expect(m).toContainEqual(['gust', gust.toFixed(1)]);
    expect(m).toContainEqual(['gustLimit', ld.windLimit.transporterMPerS.toFixed(1)]);
  });
});
