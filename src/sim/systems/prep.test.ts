import {
  countdown as cdData,
  lc1Layout,
  logistics as ld,
  siteGeometry as geo,
  tower as td,
  vehicles,
} from '@data/index';
import { describe, expect, it } from 'vitest';
import type { Command } from '../core/commands';
import type { SimEvent } from '../core/events';
import { hashWorld } from '../core/serialize';
import { secondsToTicks as T } from '../core/time';
import {
  CRANE_STATES,
  TOWER_STATES,
  TRANSPORTER_STATES,
  craneFsm,
  towerFsm,
  transporterFsm,
} from '../entities/machines';
import type { EntityFsm } from '../entities/machines';
import { entity, id, mvpSetup, rejected, run, runUntil, stateChanges } from '../fixtures.test-utils';
import type { MvpSetup } from '../fixtures.test-utils';
import { pathLengthM } from '../math/path';
import { step } from '../step';
import { routeTicks } from './motion';

const CRANE = T(ld.craneLoadTaskS);
const DRIVE_LOADED = routeTicks('sp.yardToOlm1', ld.transporter.speedLoadedMPerS);
const DRIVE_EMPTY = routeTicks('sp.olm1ToYard', ld.transporter.speedEmptyMPerS);
const STACK_B = T(ld.tower.stackBoosterS);
const STACK_S = T(ld.tower.stackShipS);

function prepAssets(s: MvpSetup) {
  return {
    booster: entity(s.world, s.cd.boosterId, 'booster'),
    ship: entity(s.world, s.cd.shipId, 'ship'),
    tower: entity(s.world, id(s.ids, 'TOWER-1'), 'tower'),
    sp: entity(s.world, id(s.ids, 'SP-41'), 'transporter'),
    crane: entity(s.world, id(s.ids, 'CR-77'), 'crane'),
    pad: entity(s.world, id(s.ids, 'OLM-1'), 'pad'),
  };
}

const firstTick = (log: readonly SimEvent[], entityId: string, to: string): number =>
  log.find((e) => e.t === 'EntityStateChanged' && e.id === entityId && e.to === to)?.tick ?? -1;

/** StartRollout at tick 0; Stack the tick after rollout completes; runs until both stages are stacked. */
function nominalPrep(s: MvpSetup, during: (tick: number) => void = () => {}): SimEvent[] {
  const log: SimEvent[] = [];
  log.push(...step(s.world, [{ t: 'StartRollout', boosterId: s.cd.boosterId }]));
  while (!s.cd.inputs.stackComplete) {
    const cmds: Command[] =
      s.cd.inputs.rolloutComplete && !s.world.prep[s.cd.id]?.stackRequested ? [{ t: 'Stack', padId: s.cd.padId }] : [];
    during(s.world.tick);
    log.push(...step(s.world, cmds));
    if (s.world.tick > T(30_000)) throw new Error('prep did not finish');
  }
  return log;
}

describe('prep FSM tables', () => {
  function check<S extends string, Tr extends string>(fsm: EntityFsm<S, Tr>, rows: [S, Tr, S | null][]): void {
    const { world, ids } = mvpSetup();
    for (const [from, on, to] of rows) {
      const e = { id: id(ids, 'TOWER-1'), kind: 'tower' as const, fsm: { state: from, enteredTick: 0 } };
      world.outbox.length = 0;
      expect(fsm.fire(e.fsm, on, { world, e })?.to ?? null, `${from} --${on}-->`).toBe(to);
      expect(world.outbox).toHaveLength(to ? 1 : 0);
    }
  }

  it('tower', () => {
    expect(towerFsm.states).toEqual(TOWER_STATES);
    check(towerFsm, [
      ['IDLE', 'stackStart', 'STACKING'],
      ['STACKING', 'windHigh', 'WIND_HOLD'],
      ['WIND_HOLD', 'windOk', 'STACKING'],
      ['STACKING', 'stackDone', 'IDLE'],
      ['IDLE', 'catchArmed', 'CATCH_READY'],
      ['CATCH_READY', 'catchStart', 'CATCHING'],
      ['CATCHING', 'caught', 'IDLE'],
      ['CATCHING', 'catchFailed', 'DAMAGED'],
      ['DAMAGED', 'stackStart', null],
      ['WIND_HOLD', 'stackDone', null],
      ['IDLE', 'catchStart', null],
    ]);
  });

  it('transporter', () => {
    expect(transporterFsm.states).toEqual(TRANSPORTER_STATES);
    check(transporterFsm, [
      ['IDLE', 'loadStart', 'LOADING'],
      ['LOADING', 'loaded', 'MOVING'],
      ['MOVING', 'windHigh', 'WIND_HOLD'],
      ['RETURNING', 'windHigh', 'WIND_HOLD'],
      ['WIND_HOLD', 'windOkLoaded', 'MOVING'],
      ['WIND_HOLD', 'windOkEmpty', 'RETURNING'],
      ['MOVING', 'arrived', 'AT_PAD'],
      ['AT_PAD', 'unloaded', 'RETURNING'],
      ['RETURNING', 'home', 'IDLE'],
      ['IDLE', 'depart', 'MOVING'],
      ['MOVING', 'turnBack', 'RETURNING'],
      ['IDLE', 'arrived', null],
      ['RETURNING', 'turnBack', null],
      ['AT_PAD', 'depart', null],
      ['AT_PAD', 'windHigh', null],
    ]);
  });

  it('crane', () => {
    expect(craneFsm.states).toEqual(CRANE_STATES);
    check(craneFsm, [
      ['IDLE', 'liftStart', 'LIFTING'],
      ['LIFTING', 'liftDone', 'IDLE'],
      ['IDLE', 'liftDone', null],
    ]);
  });
});

describe('rollout (AC 4)', () => {
  it('CR-77 loads B-09 onto SP-41, which reaches OLM-1 after path length / speed', () => {
    const s = mvpSetup();
    const a = prepAssets(s);
    const log = step(s.world, [{ t: 'StartRollout', boosterId: s.cd.boosterId }]);
    expect(stateChanges(log, a.crane.id)).toEqual(['LIFTING']);
    expect(stateChanges(log, a.sp.id)).toEqual(['LOADING']);
    log.push(...runUntil(s.world, () => s.cd.inputs.rolloutComplete));
    expect(firstTick(log, a.booster.id, 'ON_TRANSPORTER')).toBe(CRANE);
    const arrival = firstTick(log, a.sp.id, 'AT_PAD');
    const exact = (pathLengthM('sp.yardToOlm1') / ld.transporter.speedLoadedMPerS) * 30;
    expect(Math.abs(arrival - CRANE - exact)).toBeLessThanOrEqual(1);
    expect(a.sp.pos).toEqual(lc1Layout.points.olm1);
    // Stage origin on TRANSPORTER `SOCKET_Cargo` (5.0b).
    expect(a.booster.pos).toEqual({ ...a.sp.pos, y: a.sp.pos.y + geo.transporter.cargoM });
    expect(a.booster.rot).toEqual(a.sp.rot);
    log.push(...step(s.world));
    expect(log.at(-1)).toMatchObject({ t: 'PhaseChanged', from: 'Rollout', to: 'Stack' });
  });

  it('follows the data path (passes its vertices) at walking pace', () => {
    const s = mvpSetup();
    const a = prepAssets(s);
    step(s.world, [{ t: 'StartRollout', boosterId: s.cd.boosterId }]);
    run(s.world, CRANE + T(400)); // 400 m along: the first corner of the path
    expect(a.sp.pos.x).toBeCloseTo(-1_340, 6);
    expect(a.sp.pos.z).toBeCloseTo(60, 6);
    expect(a.sp.fsm.state).toBe('MOVING');
  });
});

describe('stack (AC 5)', () => {
  const s = mvpSetup();
  const a = prepAssets(s);
  const log = nominalPrep(s);

  it('booster onto OLM-1, then S-21 onto B-09; both STACKED; durations from data (±1 tick)', () => {
    const stackCmd = firstTick(log, a.booster.id, 'STACKING');
    expect(stackCmd).toBe(CRANE + DRIVE_LOADED + 1);
    expect(firstTick(log, a.booster.id, 'STACKED') - stackCmd).toBe(STACK_B);
    // Meanwhile SP-41 went back, CR-77 lifted S-21, SP-41 brought it: shorter than the booster stack.
    expect(DRIVE_EMPTY + CRANE + DRIVE_LOADED).toBeLessThan(STACK_B);
    expect(firstTick(log, a.ship.id, 'ON_TRANSPORTER')).toBe(stackCmd + DRIVE_EMPTY + CRANE);
    expect(firstTick(log, a.ship.id, 'STACKING')).toBe(stackCmd + STACK_B);
    const shipStacked = firstTick(log, a.ship.id, 'STACKED');
    expect(shipStacked - (stackCmd + STACK_B)).toBe(STACK_S);
    expect(Math.abs(shipStacked - (CRANE + DRIVE_LOADED + STACK_B + STACK_S))).toBeLessThanOrEqual(1);
    expect(a.booster.fsm.state).toBe('STACKED');
    expect(a.ship.fsm.state).toBe('STACKED');
    expect(s.cd.inputs.stackComplete).toBe(true);
    expect(a.pad.boosterId).toBe(a.booster.id);
    // Asset origins (5.0b): booster on PAD `SOCKET_VehicleMount` (20 m), ship on BOOSTER `SOCKET_ShipMount` (+71 m).
    const olm = lc1Layout.points.olm1;
    expect(a.booster.pos).toEqual({ ...olm, y: olm.y + geo.pad.vehicleMountM });
    expect(a.ship.pos).toEqual({ ...olm, y: olm.y + geo.pad.vehicleMountM + vehicles.booster.heightM });
    expect(a.ship.pos.y).toBe(91);
    // The carriage stopped on the ship lift pins (91 + 44 = 135 m) — the same sum the socket composite checks.
    expect(a.tower.carriageM).toBe(a.ship.pos.y + td.pins.shipLiftPinM);
  });

  it('the arms lift each stage from the cargo deck to its stacked height with task progress', () => {
    const m = mvpSetup();
    const b = prepAssets(m);
    step(m.world, [{ t: 'StartRollout', boosterId: m.cd.boosterId }]);
    runUntil(m.world, () => m.cd.inputs.rolloutComplete);
    step(m.world, [{ t: 'Stack', padId: m.cd.padId }]);
    runUntil(m.world, () => b.booster.fsm.state === 'STACKING');
    const y0 = lc1Layout.points.olm1.y + geo.transporter.cargoM;
    expect(b.booster.pos.y).toBeCloseTo(y0, 9);
    run(m.world, STACK_B / 2);
    const k = (b.tower.task?.elapsedTicks ?? 0) / STACK_B;
    expect(b.booster.pos.y).toBeCloseTo(y0 + (geo.pad.vehicleMountM - y0) * k, 9);
    expect(b.booster.pos.y).toBeGreaterThan(y0);
    expect(b.booster.pos.y).toBeLessThan(geo.pad.vehicleMountM);
  });

  it('uses the arms (CLOSED while stacking, OPEN after) and frees SP-41', () => {
    const arms = log.flatMap((e) => (e.t === 'ArmsChanged' ? [e.to] : []));
    expect(arms).toEqual(['CLOSED', 'OPEN', 'CLOSED', 'OPEN']);
    expect(stateChanges(log, a.tower.id)).toEqual(['STACKING', 'IDLE', 'STACKING', 'IDLE']);
    expect(a.sp.cargo).toBeNull();
    expect(a.sp.fsm.state).toBe('IDLE'); // back in the yard before the ship stack ends
    expect(a.sp.pos).toEqual(lc1Layout.points.yardPickup);
  });

  it('then the load poll passes and the count proceeds (timeline: Rollout and Stack done)', () => {
    const more = runUntil(s.world, () => s.cd.phase.state === 'PropellantLoad');
    expect(more.find((e) => e.t === 'PollPassed')).toMatchObject({ poll: 'load', auto: true });
    const phases = [...log, ...more].flatMap((e) => (e.t === 'PhaseChanged' ? [e.to] : []));
    expect(phases).toEqual(['Rollout', 'Stack', 'PropellantLoad']);
    expect(more.some((e) => e.t === 'HoldStarted')).toBe(false);
  });
});

describe('Stack command', () => {
  it.each<[string, (s: MvpSetup) => void, Partial<Command>, string]>([
    ['in Standby', () => {}, {}, 'NOT_IN_STACK_PHASE'],
    [
      'before the booster is on the pad',
      (s) => step(s.world, [{ t: 'StartRollout', boosterId: s.cd.boosterId }]),
      {},
      'ROLLOUT_NOT_COMPLETE',
    ],
    ['for an unknown pad', () => {}, { padId: 'e999999' }, 'NO_COUNTDOWN_FOR_PAD'],
    [
      'without prep assets',
      (s) => {
        s.world.prep = {};
      },
      {},
      'NO_PREP_ASSETS',
    ],
  ])('rejects %s', (_name, arrange, override, reason) => {
    const s = mvpSetup();
    arrange(s);
    const cmd = { t: 'Stack', padId: s.cd.padId, ...override } as Command;
    expect(rejected(step(s.world, [cmd]))).toEqual([reason]);
  });

  it('rejects a second Stack', () => {
    const s = mvpSetup();
    step(s.world, [{ t: 'StartRollout', boosterId: s.cd.boosterId }]);
    runUntil(s.world, () => s.cd.inputs.rolloutComplete);
    expect(rejected(step(s.world, [{ t: 'Stack', padId: s.cd.padId }]))).toEqual([]);
    expect(rejected(step(s.world, [{ t: 'Stack', padId: s.cd.padId }]))).toEqual(['STACK_ALREADY_STARTED']);
  });
});

describe('wind limits (AC 6)', () => {
  it('a gust above the transporter limit stops SP-41; it resumes when it drops; the clock keeps running', () => {
    const s = mvpSetup();
    const a = prepAssets(s);
    const gustFrom = CRANE + T(300);
    const gustTo = gustFrom + T(600);
    const log = nominalPrep(s, (tick) => {
      s.world.weather.groundGustMPerS = tick >= gustFrom && tick < gustTo ? ld.windLimit.transporterMPerS + 1 : 0;
    });
    expect(stateChanges(log, a.sp.id).slice(0, 5)).toEqual(['LOADING', 'MOVING', 'WIND_HOLD', 'MOVING', 'AT_PAD']);
    const held = firstTick(log, a.sp.id, 'AT_PAD') - (CRANE + DRIVE_LOADED);
    expect(Math.abs(held - (gustTo - gustFrom))).toBeLessThanOrEqual(1);
    expect(s.cd.tClockTicks).toBe(T(cdData.scenarioStartTS) + s.world.tick);
  });

  it('a gust above the stack limit pauses the tower task (not SP-41, whose limit is higher)', () => {
    const s = mvpSetup();
    const a = prepAssets(s);
    const stackStart = CRANE + DRIVE_LOADED + 1;
    const gustFrom = stackStart + T(1_000);
    const gustTo = gustFrom + T(1_200);
    const gust = (ld.windLimit.stackMPerS + ld.windLimit.transporterMPerS) / 2;
    const log = nominalPrep(s, (tick) => {
      s.world.weather.groundGustMPerS = tick >= gustFrom && tick < gustTo ? gust : 0;
    });
    expect(stateChanges(log, a.tower.id).slice(0, 4)).toEqual(['STACKING', 'WIND_HOLD', 'STACKING', 'IDLE']);
    const stacked = firstTick(log, a.booster.id, 'STACKED');
    expect(Math.abs(stacked - stackStart - STACK_B - (gustTo - gustFrom))).toBeLessThanOrEqual(1);
    expect(stateChanges(log, a.sp.id)).not.toContain('WIND_HOLD');
  });

  it('is deterministic under a forced series', () => {
    const run1 = mvpSetup();
    const run2 = mvpSetup();
    const series = (w: MvpSetup) => (tick: number) => {
      w.world.weather.groundGustMPerS = tick % 9_000 < 3_000 ? 16 : 4;
    };
    const l1 = nominalPrep(run1, series(run1));
    const l2 = nominalPrep(run2, series(run2));
    expect(l2).toEqual(l1);
    expect(hashWorld(run2.world)).toBe(hashWorld(run1.world));
  });
});

describe('prep → load → T-0 with the real systems (no scripted inputs)', () => {
  it('nominal: no holds, liftoff exactly at T-0, both stages LOADED', () => {
    const s = mvpSetup();
    const log = nominalPrep(s);
    log.push(...runUntil(s.world, () => s.cd.liftoffTick !== null));
    expect(log.some((e) => e.t === 'HoldStarted')).toBe(false);
    expect(s.cd.pollsPassed).toEqual(['load', 'terminal', 'final']);
    expect(s.cd.liftoffTick).toBe(T(-cdData.scenarioStartTS) - 1);
    const a = prepAssets(s);
    // Fully loaded at T-0, then the flight system takes over in the liftoff tick.
    expect(
      log
        .filter((e) => e.t === 'EntityStateChanged' && e.id === a.booster.id)
        .map((e) => e.t === 'EntityStateChanged' && e.to)
        .slice(-2),
    ).toEqual(['LOADED', 'ASCENT']);
    expect(a.ship.fsm.state).toBe('ASCENT');
    expect(log.find((e) => e.t === 'RoadClosureChanged')).toMatchObject({ closed: true });
  });
});
