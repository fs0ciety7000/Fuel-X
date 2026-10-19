// Golden-style projection snapshots (6.1): seed 42, standard autopilot, at the two reference states of the scene
// e2e (terminal count T-00:00:04, ascent T+00:01:45), B-09 selected + followed. Any change to the sim, the data or
// the projector shows up as a readable JSON diff. Update with `npx vitest run tests/projection -u` and explain the
// diff in the commit message. Stored as .txt (indent 1) so Prettier leaves the file as the test writes it.
import { describe, expect, it } from 'vitest';
import { secondsToTicks } from '../../src/sim/index';
import { projectedRun } from './harness';

const at = (tS: number) => (w: { countdowns: Record<string, { tClockTicks: number }> }) =>
  (w.countdowns.cd01?.tClockTicks ?? -Infinity) >= secondsToTicks(tS);

describe('projection snapshot, seed 42', () => {
  it('T-00:00:04 terminal count', async () => {
    const p = projectedRun(42, at(-4));
    const ui = p.project({ selectedId: p.run.countdown.boosterId, followId: p.run.countdown.boosterId });
    expect(ui.clock.tClock).toBe('T−00:00:04');
    expect(ui.clock.phase).toBe('TerminalCount');
    expect(ui.timeScale.forced1x).toBe(true);
    expect(ui.timeScale.lockLabel).toBe('1× LOCKED · TERMINAL COUNT');
    await expect(`${JSON.stringify(ui, null, 1)}\n`).toMatchFileSnapshot(
      './__files__/projection.seed42.T-00-00-04.txt',
    );
  });

  it('T+00:01:45 ascent', async () => {
    const p = projectedRun(42, at(105));
    const ui = p.project({ selectedId: p.run.countdown.boosterId, followId: p.run.countdown.boosterId });
    expect(ui.clock.tClock).toBe('T+00:01:45');
    expect(ui.clock.missionClock).toBe('T+00:01:45');
    expect(ui.inspector?.callSign).toBe('B-09');
    expect(ui.inspector?.progress?.label).toBe('FLIGHT TO TOWER CATCH');
    expect(ui.inspector?.chart?.series.some((v) => v !== null)).toBe(true);
    await expect(`${JSON.stringify(ui, null, 1)}\n`).toMatchFileSnapshot(
      './__files__/projection.seed42.T+00-01-45.txt',
    );
  });
});
