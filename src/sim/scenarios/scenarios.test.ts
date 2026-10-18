import {
  anomalies as an,
  countdown as cdData,
  economy as ec,
  mvpContract,
  propellant as pd,
  vehicles,
} from '@data/index';
import { describe, expect, it } from 'vitest';
import { secondsToTicks as T } from '../core/time';
import { entity, id } from '../fixtures.test-utils';
import { farmMassKg } from '../systems/propellant';
import { step } from '../step';
import { STANDARD_AUTOPILOT, autopilotCommands, catchBreakEvenP } from './autopilot';
import { createMvpScenario } from './mvp';

describe('scenario mvp start state (GDD §13.1, AC 2)', () => {
  const { world, countdown: cd, ids } = createMvpScenario({ seed: 42 });

  it('starts at T-06:00:00 in Standby with the window and contract from data', () => {
    expect(world.tick).toBe(0);
    expect(cd.tClockTicks).toBe(T(cdData.scenarioStartTS));
    expect(cd.phase.state).toBe('Standby');
    expect(cd.windowOpenTick).toBe(T(mvpContract.windowOpenTS - cdData.scenarioStartTS));
    expect(cd.windowCloseTick - cd.windowOpenTick).toBe(T(mvpContract.windowDurationS));
    expect(world.contracts['NRL-3']).toMatchObject({ status: 'ACTIVE', countdownId: cd.id });
  });

  it('farm, booster, money and reputation come from data; everything runs live', () => {
    expect(farmMassKg(world, 'LOX')).toBeCloseTo(pd.mvpStart.farmLoxKg, 3);
    expect(farmMassKg(world, 'CH4')).toBeCloseTo(pd.mvpStart.farmCh4Kg, 3);
    const b = entity(world, id(ids, 'B-09'), 'booster');
    expect(b).toMatchObject({
      wear: vehicles.mvpBooster.wear,
      flights: vehicles.mvpBooster.flightCount,
      fsm: { state: 'IN_YARD' },
    });
    expect(world.economy).toMatchObject({ moneyCr: ec.startMoneyCr, reputation: ec.startReputation });
    expect(world.config).toEqual({ weather: 'SERIES', stations: 'LIVE', anomalies: true });
    expect(world.entities.order).toHaveLength(29);
  });

  it('changing a data value changes the outcome (farm start → PROPELLANT station)', () => {
    const at0 = createMvpScenario({ seed: 1 });
    step(at0.world);
    expect(at0.countdown.inputs.stations.PROPELLANT).toBe('MARGINAL');
    const lox = pd.mvpStart.farmLoxKg;
    const ch4 = pd.mvpStart.farmCh4Kg;
    pd.mvpStart.farmLoxKg = 4_300_000;
    pd.mvpStart.farmCh4Kg = 1_200_000;
    try {
      const more = createMvpScenario({ seed: 1 });
      step(more.world);
      expect(more.countdown.inputs.stations.PROPELLANT).toBe('GO');
    } finally {
      pd.mvpStart.farmLoxKg = lox;
      pd.mvpStart.farmCh4Kg = ch4;
    }
  });

  it('config overrides apply', () => {
    expect(createMvpScenario({ seed: 1, config: { anomalies: false } }).world.config.anomalies).toBe(false);
  });
});

describe('autopilot', () => {
  it('break-even p from the economy data (BALANCING §9: ≈ 0.535)', () => {
    expect(catchBreakEvenP()).toBeCloseTo(1 - 40 / 86, 9);
  });

  it('Standby: StartRollout + the standard orders; nothing else until the rollout is done', () => {
    const { world, countdown: cd } = createMvpScenario({ seed: 1 });
    const cmds = autopilotCommands(world, cd.id);
    expect(cmds.map((c) => c.t)).toEqual(['StartRollout', ...STANDARD_AUTOPILOT.orders.map(() => 'OrderDelivery')]);
    step(world, cmds);
    expect(autopilotCommands(world, cd.id)).toEqual([]);
    expect(autopilotCommands(world, 'cd99')).toEqual([]);
    cd.inputs.rolloutComplete = true;
    expect(autopilotCommands(world, cd.id)).toEqual([{ t: 'Stack', padId: cd.padId }]);
  });

  it('GO only when a hold is releasable, never on a LEAK_FIX hold; leak answered as configured', () => {
    const { world, countdown: cd } = createMvpScenario({ seed: 1, config: { stations: 'MANUAL' } });
    cd.phase.state = 'Stack';
    cd.clock.state = 'Holding';
    cd.hold = { reason: 'NO_GO', poll: null };
    cd.inputs.stations.RANGE = 'NO_GO';
    expect(autopilotCommands(world, cd.id)).toEqual([]);
    cd.inputs.stations.RANGE = 'GO';
    expect(autopilotCommands(world, cd.id)).toEqual([{ t: 'Go', countdownId: cd.id }]);
    cd.hold = { reason: 'LEAK_FIX', poll: null };
    expect(autopilotCommands(world, cd.id)).toEqual([]);
    step(world); // creates the anomaly state
    const st = world.anomalies[cd.id];
    if (!st) throw new Error('no anomaly state');
    st.leak.active = true;
    expect(autopilotCommands(world, cd.id)).toContainEqual({ t: 'LeakResponse', choice: 'HOLD_FIX' });
    expect(autopilotCommands(world, cd.id, { ...STANDARD_AUTOPILOT, leakResponse: null })).toEqual([]);
  });

  it('catch call after boostback end by the expected-cost rule', () => {
    const { world, countdown: cd } = createMvpScenario({ seed: 1 });
    const b = entity(world, cd.boosterId, 'booster');
    cd.phase.state = 'Boostback';
    b.fsm.state = 'BOOSTBACK';
    b.recovery = {
      p: 0.6,
      sigmaM: 1,
      landingPropKg: 90_000,
      towerWindMPerS: 0,
      forcedDivert: null,
      decisionRequiredTick: 10,
      deadlineTick: 100,
      mode: null,
      decidedBy: null,
      result: null,
      roll: null,
    };
    expect(autopilotCommands(world, cd.id)).toEqual([]);
    b.fsm.state = 'DESCENT';
    expect(autopilotCommands(world, cd.id)).toEqual([{ t: 'CatchDecision', boosterId: b.id, choice: 'CATCH' }]);
    b.recovery.p = 0.5;
    expect(autopilotCommands(world, cd.id)).toEqual([{ t: 'CatchDecision', boosterId: b.id, choice: 'DIVERT' }]);
    expect(autopilotCommands(world, cd.id, { ...STANDARD_AUTOPILOT, catchDecision: false })).toEqual([]);
    b.recovery.mode = 'DIVERT';
    expect(autopilotCommands(world, cd.id)).toEqual([]);
    expect(an.director.guaranteeOne).toBe(true);
  });
});
