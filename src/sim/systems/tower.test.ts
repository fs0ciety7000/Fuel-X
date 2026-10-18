import { lc1Layout, tower as td } from '@data/index';
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../core/events';
import { secondsToTicks as T } from '../core/time';
import { entity, id, mvpSetup } from '../fixtures.test-utils';
import type { MvpSetup } from '../fixtures.test-utils';
import {
  CARRIAGE_STACK_BOOSTER_M,
  CARRIAGE_STACK_SHIP_M,
  carriageForBoosterM,
  carriageForShipM,
  inQdKeepOut,
} from '../math/tower';
import { createMvpScenario } from '../scenarios/mvp';
import { STANDARD_AUTOPILOT, autopilotCommands } from '../scenarios/autopilot';
import { step } from '../step';
import type { EntityOf } from '../types';
import { setCarriageTarget } from './tower';

const towerOf = (s: MvpSetup): EntityOf<'tower'> => entity(s.world, id(s.ids, 'TOWER-1'), 'tower');

/** Steps `ticks`, asserting the interlock invariant after every tick; returns the events. */
function runChecked(s: MvpSetup, ticks: number): SimEvent[] {
  const t = towerOf(s);
  const out: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    out.push(...step(s.world));
    if (t.qd !== 'STOWED') expect(inQdKeepOut(t.carriageM), `tick ${s.world.tick} carriage ${t.carriageM}`).toBe(false);
  }
  return out;
}

describe('tower geometry (ASSETS_GUIDE sockets)', () => {
  it('carriage height = pin height on the stack and at the catch', () => {
    expect(CARRIAGE_STACK_BOOSTER_M).toBe(86); // mount deck 20 + catch pins 66 = carriage rest
    expect(CARRIAGE_STACK_BOOSTER_M).toBe(td.carriage.restM);
    expect(CARRIAGE_STACK_SHIP_M).toBe(135); // 20 + booster 71 + lift pins 44 = carriage max
    expect(carriageForBoosterM(lc1Layout.points.catchPoint.y)).toBe(126); // catch altitude 60 + 66
    expect(carriageForShipM(200)).toBe(td.carriage.maxM); // clamped to the travel
    expect(carriageForBoosterM(-100)).toBe(td.carriage.minM);
  });

  it('keep-out band is open: edges allowed', () => {
    expect(inQdKeepOut(92)).toBe(false);
    expect(inQdKeepOut(92.001)).toBe(true);
    expect(inQdKeepOut(105.999)).toBe(true);
    expect(inQdKeepOut(106)).toBe(false);
  });
});

describe('tower mechanisms', () => {
  it('starts at rest: carriage 86 m, arms open (L +, R −), QD stowed', () => {
    const t = towerOf(mvpSetup());
    expect(t).toMatchObject({ carriageM: 86, carriageTargetM: 86, qd: 'STOWED', qdArmRad: 0, interlock: 'NONE' });
    expect(t.armLRad).toBeCloseTo(td.arms.openRad, 12);
    expect(t.armRRad).toBeCloseTo(-td.arms.openRad, 12);
  });

  it('carriage moves at its rate and emits target / arrival', () => {
    const s = mvpSetup();
    const t = towerOf(s);
    setCarriageTarget(s.world, t, 76);
    expect(s.world.outbox.at(-1)).toMatchObject({ t: 'CarriageTargetSet', fromM: 86, toM: 76 });
    const ev = runChecked(s, T(10 / td.carriage.speedMPerS) + 1);
    expect(t.carriageM).toBe(76);
    expect(ev.filter((e) => e.t === 'CarriageArrived')).toHaveLength(1);
  });

  it('arms swing at their rate toward the ArmsChanged target', () => {
    const s = mvpSetup();
    const t = towerOf(s);
    t.arms = 'CLOSED';
    const ticks = T(td.arms.openRad / td.arms.rateRadPerS);
    runChecked(s, ticks - 1);
    expect(t.armLRad).toBeGreaterThan(0);
    expect(t.armRRad).toBeLessThan(0);
    runChecked(s, 2);
    expect(t.armLRad).toBe(0);
    expect(t.armRRad).toBe(0);
  });

  it('QD engages while a ship is stacked and retracts when it leaves', () => {
    const s = mvpSetup({ prepped: true });
    const t = towerOf(s);
    Object.assign(t, { carriageM: 86, carriageTargetM: 86, qd: 'STOWED', qdArmRad: 0 });
    let ev = runChecked(s, T(td.qdArm.engagedRad / td.qdArm.rateRadPerS) + 2);
    expect(ev.filter((e) => e.t === 'QdArmChanged').map((e) => (e.t === 'QdArmChanged' ? e.to : ''))).toEqual([
      'ENGAGING',
      'ENGAGED',
    ]);
    expect(t.qdArmRad).toBe(td.qdArm.engagedRad);
    entity(s.world, s.cd.shipId, 'ship').fsm.state = 'ASCENT';
    ev = runChecked(s, T(td.qdArm.engagedRad / td.qdArm.rateRadPerS) + 2);
    expect(t.qd).toBe('STOWED');
    expect(t.qdArmRad).toBe(0);
    expect(ev.filter((e) => e.t === 'QdArmChanged')).toHaveLength(2);
  });
});

describe('carriage ⇄ QD interlock', () => {
  it('carriage going up stops at 92 m while the QD arm is engaged, then continues once it is stowed', () => {
    const s = mvpSetup({ prepped: true });
    const t = towerOf(s);
    Object.assign(t, { carriageM: 86, carriageTargetM: 86 });
    setCarriageTarget(s.world, t, 135);
    const ev = runChecked(s, T(60));
    expect(t.carriageM).toBe(td.qdArm.keepOutLoM);
    expect(t.interlock).toBe('CARRIAGE_HELD');
    expect(ev.filter((e) => e.t === 'TowerInterlockChanged')).toHaveLength(1);
    entity(s.world, s.cd.shipId, 'ship').fsm.state = 'ASCENT'; // QD retracts
    const after = runChecked(s, T(70));
    expect(t.qd).toBe('STOWED');
    expect(t.carriageM).toBe(135);
    expect(t.interlock).toBe('NONE');
    expect(after.find((e) => e.t === 'TowerInterlockChanged')).toMatchObject({ from: 'CARRIAGE_HELD', to: 'NONE' });
  });

  it('carriage going down stops at 106 m while the QD arm is out', () => {
    const s = mvpSetup({ prepped: true });
    const t = towerOf(s);
    setCarriageTarget(s.world, t, 86);
    runChecked(s, T(60));
    expect(t.carriageM).toBe(td.qdArm.keepOutHiM);
    expect(t.interlock).toBe('CARRIAGE_HELD');
  });

  it('a carriage target on the band edge is reached, not held', () => {
    const s = mvpSetup({ prepped: true });
    const t = towerOf(s);
    setCarriageTarget(s.world, t, 106);
    runChecked(s, T(40));
    expect(t.carriageM).toBe(106);
    expect(t.interlock).toBe('NONE');
  });

  it('QD arm cannot engage while the carriage is in the band', () => {
    const s = mvpSetup({ prepped: true });
    const t = towerOf(s);
    Object.assign(t, { carriageM: 99, carriageTargetM: 99, qd: 'STOWED', qdArmRad: 0 });
    let ev = runChecked(s, T(30));
    expect(t.qd).toBe('STOWED');
    expect(t.qdArmRad).toBe(0);
    expect(t.interlock).toBe('QD_HELD');
    expect(ev.filter((e) => e.t === 'QdArmChanged')).toHaveLength(0);
    setCarriageTarget(s.world, t, 80); // carriage leaves the band, then the QD arm may swing in
    ev = runChecked(s, T(40));
    expect(t.qd).toBe('ENGAGED');
    expect(t.interlock).toBe('NONE');
    // The QD arm starts swinging on the tick the hold releases, i.e. the first tick with the carriage out of the band.
    const released = ev.find((e) => e.t === 'TowerInterlockChanged');
    const engaging = ev.find((e) => e.t === 'QdArmChanged' && e.to === 'ENGAGING');
    expect(released).toMatchObject({ from: 'QD_HELD', to: 'NONE' });
    expect(released?.t === 'TowerInterlockChanged' && released.carriageM).toBeLessThanOrEqual(td.qdArm.keepOutLoM);
    expect(engaging?.tick).toBe(released?.tick);
  });
});

describe('MVP run (seed 42, standard autopilot)', () => {
  it('stacks at the pin heights, catches at 126 m and never breaks the interlock', () => {
    const sc = createMvpScenario({ seed: 42 });
    const { world, countdown: cd } = sc;
    const t = Object.values(world.entities.byId).find((e) => e.kind === 'tower') as EntityOf<'tower'>;
    const seen = { shipStack: false };
    while (cd.phase.state !== 'Debrief' && world.tick < T(30 * 3_600)) {
      const ev = step(world, autopilotCommands(world, cd.id, STANDARD_AUTOPILOT));
      world.outbox.length = 0;
      if (t.qd !== 'STOWED') expect(inQdKeepOut(t.carriageM)).toBe(false);
      if (ev.some((e) => e.t === 'CarriageArrived' && e.atM === 135)) seen.shipStack = true;
    }
    const b = entity(world, cd.boosterId, 'booster');
    expect(seen.shipStack).toBe(true);
    expect(b.recovery?.result).toBe('CAUGHT');
    expect(t.carriageM).toBe(126);
    expect(b.pos.y + td.pins.boosterCatchPinM).toBe(t.carriageM); // catch pins on the catch points
    expect(t.armLRad).toBe(0);
    expect(t.qd).toBe('STOWED');
  });
});
