import { economy as ec, mvpContract, propellant as pd, vehicles } from '@data/index';
import { describe, expect, it } from 'vitest';
import { asDirector } from '../core/commands';
import type { Command } from '../core/commands';
import type { SimEvent, SimEventInput } from '../core/events';
import { emit } from '../core/events';
import { secondsToTicks as T } from '../core/time';
import type { LedgerItem } from '../core/world';
import { entity, mvpSetup, rejected, run, runUntil } from '../fixtures.test-utils';
import type { MvpSetup } from '../fixtures.test-utils';
import { step } from '../step';
import { economySystem } from './economy';

/** T-00:00:05, loaded and stacked; flies to Debrief, `each` may return commands per tick. */
function flight(each: (s: MvpSetup) => Command[] = () => [], seed = 7) {
  const s = mvpSetup({ seed, startTS: -5, phase: 'TerminalCount', pollsPassed: ['load', 'terminal', 'final'] });
  for (const st of [entity(s.world, s.cd.boosterId, 'booster'), entity(s.world, s.cd.shipId, 'ship')]) {
    st.fsm.state = 'LOADED';
    st.prop.loxKg = st.prop.loxCapKg;
    st.prop.ch4Kg = st.prop.ch4CapKg;
  }
  Object.assign(s.cd.inputs, { loadComplete: true, stackComplete: true, rolloutComplete: true });
  const log: SimEvent[] = [];
  while (s.cd.phase.state !== 'Debrief') log.push(...step(s.world, each(s)));
  const debrief = s.world.debriefs[s.cd.id];
  if (!debrief) throw new Error('no debrief');
  return { ...s, log, debrief, b: entity(s.world, s.cd.boosterId, 'booster') };
}

const lineOf = (d: { lines: { item: LedgerItem; amountCr: number }[] }, item: LedgerItem): number =>
  d.lines.find((l) => l.item === item)?.amountCr ?? 0;

describe('nominal flight, caught (AC 21–22)', () => {
  const f = flight();

  it('SECO fulfils NRL-3: price + success reputation, ship expended', () => {
    const secoTick = f.log.find((e) => e.t === 'FlightEvent' && e.event === 'SECO')?.tick;
    expect(f.log.find((e) => e.t === 'ContractUpdated')).toMatchObject({ status: 'FULFILLED', tick: secoTick });
    expect(f.world.contracts['NRL-3']).toMatchObject({ status: 'FULFILLED', closedTick: secoTick });
    expect(lineOf(f.debrief, 'CONTRACT_PRICE')).toBe(mvpContract.priceCr);
    expect(lineOf(f.debrief, 'SHIP_EXPENDED')).toBe(-ec.shipExpendedCostCr);
  });

  it('caught: refurb charged, wear + nominal, flight count + 1', () => {
    expect(lineOf(f.debrief, 'BOOSTER_REFURB')).toBe(-ec.boosterRefurbNominalCr);
    expect(lineOf(f.debrief, 'BOOSTER_LOST')).toBe(0);
    expect(f.debrief.booster).toMatchObject({
      callSign: 'B-09',
      state: 'CAUGHT_SAFING',
      enginesOut: 0,
      flightsBefore: vehicles.mvpBooster.flightCount,
      flightsAfter: vehicles.mvpBooster.flightCount + 1,
    });
    expect(f.debrief.booster.wearAfter).toBeCloseTo(vehicles.mvpBooster.wear + vehicles.wear.perNominalFlight, 12);
  });

  it('debrief: outcome, money and reputation deltas, ops cost, turnaround', () => {
    const d = f.debrief;
    expect(d).toMatchObject({ outcome: 'CAUGHT', contractStatus: 'FULFILLED', towerState: 'IDLE' });
    expect(d.recovery).toMatchObject({ mode: 'CATCH', result: 'CAUGHT', decidedBy: 'AUTO' });
    const sum = d.lines.reduce((s, l) => s + l.amountCr, 0);
    expect(d.moneyDeltaCr).toBeCloseTo(sum, 6);
    expect(d.moneyEndCr - d.moneyStartCr).toBeCloseTo(d.moneyDeltaCr, 6);
    expect(d.reputationDelta).toBe(ec.reputationDelta.success);
    const simS = (d.readyTick + 1) / 30;
    expect(lineOf(d, 'OPS_COST')).toBeCloseTo(-simS * ec.opsCostCrPerS, 3);
    expect(d.turnaroundS).toBe(ec.boosterRefurbNominalS);
    expect(d.holdS).toBe(0);
    expect(f.log.find((e) => e.t === 'DebriefReady')).toMatchObject({
      outcome: 'CAUGHT',
      moneyDeltaCr: d.moneyDeltaCr,
    });
    // BALANCING §9 nominal P&L order of magnitude: 62 − 20 − 1.5 − ops.
    expect(d.moneyDeltaCr).toBeGreaterThan(40e6);
  });

  it('decision log: the automatic catch decision, timestamped with the T-clock', () => {
    const c = f.debrief.decisions.find((x) => x.kind === 'CatchDecision');
    expect(c).toMatchObject({ by: 'AUTO', detail: expect.stringMatching(/^CATCH P 0\.99/) });
    expect(c?.tClockTicks).toBeGreaterThan(T(300));
  });
});

describe('divert and failed catch', () => {
  it('DIVERT: booster lost (replacement), contract still fulfilled (AC 21), player decision logged', () => {
    const f = flight((s) => {
      const r = entity(s.world, s.cd.boosterId, 'booster').recovery;
      return r?.decisionRequiredTick !== null && r?.mode === null
        ? [{ t: 'CatchDecision', boosterId: s.cd.boosterId, choice: 'DIVERT' }]
        : [];
    });
    expect(f.debrief.outcome).toBe('DIVERTED');
    expect(f.debrief.contractStatus).toBe('FULFILLED');
    expect(lineOf(f.debrief, 'BOOSTER_LOST')).toBe(-ec.boosterReplacementCostCr);
    expect(lineOf(f.debrief, 'BOOSTER_REFURB')).toBe(0);
    expect(f.debrief.turnaroundS).toBe(0);
    expect(f.debrief.decisions.find((d) => d.kind === 'CatchDecision')).toMatchObject({
      by: 'PLAYER',
      detail: expect.stringMatching(/^DIVERT P /),
    });
  });

  it('failed catch: booster + tower repair + downtime + reputation; engine-out wear', () => {
    let found: ReturnType<typeof flight> | null = null;
    for (let seed = 1; seed < 60 && !found; seed++) {
      const f = flight((s) => {
        const b = entity(s.world, s.cd.boosterId, 'booster');
        if (b.fsm.state === 'BOOSTBACK' && b.engines.failed === 0) s.world.weather.towerWindMPerS = 18;
        if (b.fsm.state === 'BOOSTBACK' && b.engines.failed === 0) b.engines.failed = 2; // σ up: p ≈ 0.3
        return b.recovery?.decisionRequiredTick !== null && b.recovery?.mode === null
          ? [{ t: 'CatchDecision', boosterId: s.cd.boosterId, choice: 'CATCH' }]
          : [];
      }, seed);
      if (f.debrief.outcome === 'CATCH_FAILED') found = f;
    }
    if (!found) throw new Error('no failed catch in 60 seeds');
    const d = found.debrief;
    expect(d.towerState).toBe('DAMAGED');
    expect(lineOf(d, 'BOOSTER_LOST')).toBe(-ec.boosterReplacementCostCr);
    expect(lineOf(d, 'TOWER_REPAIR')).toBe(-ec.towerRepairCostCr);
    expect(lineOf(d, 'TOWER_DOWNTIME')).toBeCloseTo(-ec.towerRepairDowntimeS * ec.opsCostCrPerS, 3);
    expect(d.reputationDelta).toBe(ec.reputationDelta.success + ec.reputationDelta.towerDamaged);
    expect(d.turnaroundS).toBe(ec.towerRepairDowntimeS);
    expect(d.booster.wearAfter).toBeCloseTo(
      vehicles.mvpBooster.wear + vehicles.wear.perNominalFlight + 2 * vehicles.wear.engineOut,
      12,
    );
  });
});

describe('scrubs', () => {
  it('window closed during a hold: penalty, reputation, contract WINDOW_MISSED, debrief SCRUBBED', () => {
    const s = mvpSetup({ startTS: -300, phase: 'TerminalCount', pollsPassed: ['load', 'terminal'] });
    step(s.world, [{ t: 'Hold', countdownId: s.cd.id }]);
    const log = runUntil(s.world, () => s.cd.phase.state === 'Debrief');
    const d = s.world.debriefs[s.cd.id];
    expect(d).toMatchObject({ outcome: 'SCRUBBED', contractStatus: 'WINDOW_MISSED', liftoffTick: null });
    expect(lineOf(d ?? { lines: [] }, 'WINDOW_MISSED')).toBe(-mvpContract.penaltyWindowMissedCr);
    expect(d?.reputationDelta).toBe(ec.reputationDelta.windowMissed);
    expect(d?.turnaroundS).toBe(mvpContract.rebookDelayS);
    expect(d?.holdS).toBeGreaterThan(1_000);
    expect(d?.decisions.map((x) => `${x.kind}:${x.by}`)).toEqual(['Hold:PLAYER', 'Scrub:AUTO']);
    expect(log.filter((e) => e.t === 'LedgerPosted' && e.item === 'WINDOW_MISSED')).toHaveLength(1);
  });

  it('commanded scrub after loading: detank loss priced, window lost at debrief', () => {
    const s = mvpSetup({ startTS: -900, phase: 'PropellantLoad', pollsPassed: ['load'], prepped: true });
    for (const st of [entity(s.world, s.cd.boosterId, 'booster'), entity(s.world, s.cd.shipId, 'ship')]) {
      st.fsm.state = 'LOADED';
      st.prop.loxKg = st.prop.loxCapKg / 2;
      st.prop.ch4Kg = st.prop.ch4CapKg / 2;
    }
    step(s.world, [{ t: 'Scrub', countdownId: s.cd.id }]);
    runUntil(s.world, () => s.cd.phase.state === 'Debrief');
    const d = s.world.debriefs[s.cd.id];
    if (!d) throw new Error('no debrief');
    const l = s.world.logistics.ledger;
    expect(d.propellant.lostKg.LOX).toBeCloseTo(l.LOX.detankLostKg, 6);
    expect(d.propellant.lostKg.LOX).toBeGreaterThan(pd.scrubDetankLossFraction * vehicles.booster.loxCapKg * 0.49);
    expect(lineOf(d, 'PROPELLANT_LOST')).toBeCloseTo(
      -(l.LOX.detankLostKg * ec.priceCrPerKg.LOX + l.CH4.detankLostKg * ec.priceCrPerKg.CH4),
      3,
    );
    expect(lineOf(d, 'WINDOW_MISSED')).toBe(-mvpContract.penaltyWindowMissedCr);
    expect(d.contractStatus).toBe('WINDOW_MISSED');
    expect(d.decisions).toEqual([expect.objectContaining({ kind: 'Scrub', by: 'PLAYER', tClockTicks: T(-900) })]);
  });
});

describe('ledger and decision log', () => {
  it('tags each command with its source: DIRECTOR when the director sent it, PLAYER by default (AC 33)', () => {
    const s = mvpSetup();
    step(s.world, [
      { t: 'StartRollout', boosterId: s.cd.boosterId, source: 'DIRECTOR' },
      ...asDirector([{ t: 'OrderDelivery', fluid: 'LOX', rush: false }]),
      { t: 'OrderDelivery', fluid: 'CH4', rush: false },
    ]);
    expect(s.world.decisions[s.cd.id]?.map((d) => `${d.kind} ${d.by}`)).toEqual([
      'StartRollout DIRECTOR',
      'OrderDelivery DIRECTOR',
      'OrderDelivery PLAYER',
    ]);
  });

  it('records accepted player commands only, with tick, T-clock and detail', () => {
    const s = mvpSetup();
    const ev = step(s.world, [
      { t: 'StartRollout', boosterId: s.cd.boosterId },
      { t: 'StartRollout', boosterId: s.cd.boosterId },
      { t: 'OrderDelivery', fluid: 'CH4', rush: true },
    ]);
    expect(rejected(ev)).toEqual(['ROLLOUT_ALREADY_STARTED']);
    expect(s.world.decisions[s.cd.id]).toEqual([
      { tick: 0, tClockTicks: s.cd.tClockTicks - 1, kind: 'StartRollout', detail: '', by: 'PLAYER' },
      { tick: 0, tClockTicks: s.cd.tClockTicks - 1, kind: 'OrderDelivery', detail: 'CH4 RUSH', by: 'PLAYER' },
    ]);
    expect(s.world.economy.ledger).toEqual([
      { tick: 0, countdownId: s.cd.id, item: 'HAULAGE_FEE', amountCr: -120_000, reputationDelta: 0, ref: 'DO-001' },
    ]);
  });

  it('GO at a poll logs the poll and the MARGINAL stations; auto polls are logged as AUTO', () => {
    const s = mvpSetup({ startTS: -4_801, prepped: true });
    s.cd.inputs.stations.PROPELLANT = 'MARGINAL';
    run(s.world, 31);
    step(s.world, [{ t: 'Go', countdownId: s.cd.id }]);
    s.cd.inputs.stations.PROPELLANT = 'GO';
    s.cd.tClockTicks = T(-600) - 1;
    run(s.world, 3);
    expect(s.world.decisions[s.cd.id]?.map((d) => `${d.kind}:${d.by}:${d.detail}`)).toEqual([
      'Go:PLAYER:POLL LOAD, MARGINAL PROPELLANT',
      'Go:AUTO:POLL TERMINAL',
    ]);
  });

  it('reputation is clamped to 0–100', () => {
    const s = mvpSetup();
    s.world.economy.reputation = 98;
    const fake: SimEventInput = {
      t: 'FlightEvent',
      countdownId: s.cd.id,
      id: s.cd.shipId,
      kind: 'ship',
      event: 'SECO',
      altitudeM: 0,
      speedMPerS: 0,
    };
    emit(s.world, fake);
    economySystem(s.world);
    expect(s.world.economy.reputation).toBe(100);
  });

  it('a high-wind catch adds the high-wind wear', () => {
    const f = flight((s) => {
      s.world.weather.towerWindMPerS = vehicles.wear.highWindCatchAboveMPerS + 1;
      return [];
    });
    expect(f.debrief.outcome).toBe('CAUGHT');
    expect(f.debrief.booster.wearAfter).toBeCloseTo(
      vehicles.mvpBooster.wear + vehicles.wear.perNominalFlight + vehicles.wear.highWindCatch,
      12,
    );
  });
});
