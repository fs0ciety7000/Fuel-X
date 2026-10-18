// Golden full-launch log (ADR 0006, sim-testing skill, GDD AC 1, 16, 19–22): scenario `mvp`, seed 42, driven by
// the standard autopilot from T-06:00:00 to Debrief. One line per event + telemetry every 5 min (5 s in flight).
// Update with `npx vitest run tests/golden -u` and explain the diff in the commit message.
import { flightProfile as fp } from '@data/index';
import { describe, expect, it } from 'vitest';
import type { Phase } from '../../src/sim/index';
import { runMvp } from '../harness';
import { GoldenLog, tClock } from './format';

const SEED = 42;
const FLIGHT: readonly Phase[] = ['Liftoff', 'Boostback', 'TowerCatch', 'Divert'];

describe('golden full launch (seed 42, standard autopilot)', () => {
  let golden: GoldenLog | null = null;
  const flightTicks: Record<string, number> = {};
  const t0 = performance.now();
  const run = runMvp({
    seed: SEED,
    each: (world, events) => {
      const cd = world.countdowns.cd01;
      if (!cd) return;
      golden ??= new GoldenLog(world, [
        'Fuel-X golden log — scenario mvp, seed 42, STANDARD_AUTOPILOT (tests/golden/full-launch.test.ts)',
        'columns: tick T-clock(after tick) event fields | TLM phase/clock wind=ground/gust/tower upper stations=W R P V C farm=LOX/CH4 usable kg',
      ]);
      for (const e of events) {
        golden.event(cd, e);
        if (e.t === 'FlightEvent' && e.kind === 'booster') flightTicks[e.event] = e.tick;
      }
      const every = FLIGHT.includes(cd.phase.state) ? 150 : 9_000;
      if ((world.tick - 1) % every === 0) golden.telemetry(cd);
    },
  });
  const ms = performance.now() - t0;
  const { world, countdown: cd } = run;
  const debrief = world.debriefs[cd.id];

  it('reaches Debrief with a debrief record', () => {
    expect(cd.phase.state).toBe('Debrief');
    expect(debrief).toBeDefined();
  });

  it('matches the committed golden log', async () => {
    const log = golden as GoldenLog | null;
    if (!log || !debrief) throw new Error('no log');
    log.lines.push(
      `# DEBRIEF outcome=${debrief.outcome} contract=${debrief.contractStatus} moneyDeltaCr=${Math.round(debrief.moneyDeltaCr)} reputationDelta=${debrief.reputationDelta} holdS=${debrief.holdS.toFixed(1)} turnaroundS=${debrief.turnaroundS}`,
      `# DEBRIEF booster=${debrief.booster.callSign} ${debrief.booster.state} wear=${debrief.booster.wearBefore.toFixed(3)}>${debrief.booster.wearAfter.toFixed(3)} flights=${debrief.booster.flightsBefore}>${debrief.booster.flightsAfter} enginesOut=${debrief.booster.enginesOut} tower=${debrief.towerState}`,
      ...debrief.lines.map((l) => `# DEBRIEF line ${l.item} ${Math.round(l.amountCr)} rep=${l.reputationDelta}`),
      ...debrief.anomalies.map((a) => `# DEBRIEF anomaly ${a.anomaly} ${a.source} tick=${a.tick}`),
      ...debrief.decisions.map((d) =>
        `# DEBRIEF decision ${tClock(d.tClockTicks)} ${d.by} ${d.kind} ${d.detail}`.trimEnd(),
      ),
    );
    await expect(log.text()).toMatchFileSnapshot('./__files__/full-launch.seed42.log');
  });

  it('flies the nominal profile within the AC 16 tolerances (seed 42 has no engine-out)', () => {
    const lift = cd.liftoffTick ?? -1;
    expect(world.anomalies[cd.id]?.fired.some((f) => f.anomaly === 'A4')).toBe(false);
    const at = (event: string): number => ((flightTicks[event] ?? -1) - lift) / 30;
    expect(Math.abs(at('MECO') - (fp.booster.find((k) => k.event === 'MECO')?.tS ?? 0))).toBeLessThanOrEqual(
      fp.tolerance.mecoS,
    );
    expect(Math.abs(at('CATCH') - (fp.booster.at(-1)?.tS ?? 0))).toBeLessThanOrEqual(fp.tolerance.catchS);
    expect(world.contracts['NRL-3']?.status).toBe('FULFILLED');
    console.log(
      `golden run: ${run.ticks} ticks in ${ms.toFixed(0)} ms (${((ms * 1000) / run.ticks).toFixed(2)} µs/tick)`,
    );
  });
});
