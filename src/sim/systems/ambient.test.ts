// Ambient SP-42 duty loop (7.3, GDD AC 26): yard bay ⇄ tank-farm apron, keep-alive dwells, parked through the road
// closure (exactly home on the closure tick), wind holds like SP-41, no effect on SP-41 / the economy.
import { lc1Layout, logistics as ld } from '@data/index';
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../core/events';
import { secondsToTicks as T } from '../core/time';
import { entity, id, mvpSetup, run, runUntil, stateChanges } from '../fixtures.test-utils';
import { pathLengthM } from '../math/path';
import { step } from '../step';
import { routeTicks } from './motion';

const DRIVE = routeTicks('sp42.yardToFarm', ld.transporter.speedEmptyMPerS);
const BAY = lc1Layout.points.sp42Bay;
const APRON = lc1Layout.points.farmApron;

function setup(opts: Parameters<typeof mvpSetup>[0] = {}) {
  const s = mvpSetup(opts);
  return {
    ...s,
    sp42: entity(s.world, id(s.ids, 'SP-42'), 'transporter'),
    sp41: entity(s.world, id(s.ids, 'SP-41'), 'transporter'),
  };
}

const tickOf = (log: readonly SimEvent[], entityId: string, to: string, from = 0): number =>
  log.find((e) => e.t === 'EntityStateChanged' && e.id === entityId && e.to === to && e.tick >= from)?.tick ?? -1;

describe('SP-42 ambient duty', () => {
  it('is spawned with role ambient (SP-41 prep) on a 1 220 m lane whose return is the exact reverse', () => {
    const { sp41, sp42 } = setup();
    expect([sp41.role, sp42.role]).toEqual(['prep', 'ambient']);
    expect(pathLengthM('sp42.yardToFarm')).toBeCloseTo(1_220, 9);
    expect(pathLengthM('sp42.farmToYard')).toBeCloseTo(1_220, 9);
    expect([...lc1Layout.paths['sp42.farmToYard'].points]).toEqual(
      [...lc1Layout.paths['sp42.yardToFarm'].points].reverse(),
    );
  });

  it('with nothing else moving it never dwells: out, turn at the apron, home, out again', () => {
    const { world, sp42 } = setup();
    const log = step(world);
    expect(stateChanges(log, sp42.id)).toEqual(['MOVING']);
    log.push(...run(world, 2 * DRIVE + 1));
    expect(stateChanges(log, sp42.id)).toEqual(['MOVING', 'AT_PAD', 'RETURNING', 'IDLE', 'MOVING']);
    expect(tickOf(log, sp42.id, 'AT_PAD')).toBe(DRIVE);
    expect(tickOf(log, sp42.id, 'RETURNING')).toBe(DRIVE);
    expect(tickOf(log, sp42.id, 'IDLE')).toBe(2 * DRIVE);
    expect(world.economy.moneyCr).toBe(mvpSetup().world.economy.moneyCr); // no economy effect
  });

  it('dwells dwellFarmS / dwellYardS while another vehicle moves, and leaves at once when it stops', () => {
    const { world, sp41, sp42 } = setup();
    sp41.fsm.state = 'MOVING'; // Standby: prep does not run, SP-41 just counts as moving
    const log = runUntil(world, () => sp42.fsm.state === 'IDLE' && world.tick > DRIVE);
    expect(sp42.pos).toEqual(BAY);
    const dwellYard = T(ld.ambientTransporter.dwellYardS);
    expect(tickOf(log, sp42.id, 'MOVING')).toBe(dwellYard);
    const atPad = tickOf(log, sp42.id, 'AT_PAD');
    expect(atPad).toBe(dwellYard + DRIVE);
    expect(tickOf(log, sp42.id, 'RETURNING') - atPad).toBe(T(ld.ambientTransporter.dwellFarmS));
    const home = tickOf(log, sp42.id, 'IDLE');
    log.push(...runUntil(world, () => sp42.fsm.state === 'MOVING'));
    expect(tickOf(log, sp42.id, 'MOVING', home) - home).toBe(dwellYard);
    // Mid-dwell at the apron, SP-41 stops: SP-42 leaves on that tick.
    log.push(...runUntil(world, () => sp42.fsm.state === 'AT_PAD'));
    run(world, 100);
    sp41.fsm.state = 'IDLE';
    const t = world.tick;
    const next = step(world);
    expect(stateChanges(next, sp42.id)).toEqual(['RETURNING']);
    expect(tickOf(next, sp42.id, 'RETURNING')).toBe(t);
    expect(t - tickOf(log, sp42.id, 'AT_PAD', home)).toBeLessThan(T(ld.ambientTransporter.dwellFarmS));
  });

  it('turns back mid-leg so that it is home exactly on the road-closure tick, then stays parked', () => {
    // 5 min before T-00:40:00: a full trip (2 × 610 s) does not fit.
    const { world, sp42 } = setup({ startTS: ld.roadClosureStartTS - 300 });
    let farthest = 0;
    const log: SimEvent[] = [];
    while (!world.logistics.roadClosed) {
      log.push(...step(world));
      farthest = Math.max(farthest, Math.hypot(sp42.pos.x - BAY.x, sp42.pos.z - BAY.z));
    }
    const closed = log.find((e) => e.t === 'RoadClosureChanged' && e.closed)?.tick ?? -1;
    expect(stateChanges(log, sp42.id)).toEqual(['MOVING', 'RETURNING', 'IDLE']);
    expect(tickOf(log, sp42.id, 'IDLE')).toBe(closed);
    expect(sp42.pos).toEqual(BAY);
    // Out ≈ half the time to closure, back the same way (≈ 150 s × 2 m/s).
    expect(farthest).toBeGreaterThan(290);
    expect(farthest).toBeLessThan(310);
    const after = run(world, T(600));
    expect(stateChanges(after, sp42.id)).toEqual([]);
  });

  it('a farm dwell ends in time to be home on the closure tick', () => {
    // 1 500 s to closure, SP-41 "moving" so dwells are taken: yard 240 s, out 610 s, then only 40 s of the 300 s farm
    // dwell fit before the 610 s drive home.
    const { world, sp41, sp42 } = setup({ startTS: ld.roadClosureStartTS - 1_500 });
    sp41.fsm.state = 'MOVING';
    const log: SimEvent[] = [];
    while (!world.logistics.roadClosed) log.push(...step(world));
    const closed = log.find((e) => e.t === 'RoadClosureChanged' && e.closed)?.tick ?? -1;
    expect(stateChanges(log, sp42.id)).toEqual(['MOVING', 'AT_PAD', 'RETURNING', 'IDLE']);
    const dwell = tickOf(log, sp42.id, 'RETURNING') - tickOf(log, sp42.id, 'AT_PAD');
    expect(Math.abs(dwell - T(40))).toBeLessThanOrEqual(2);
    expect(tickOf(log, sp42.id, 'IDLE')).toBe(closed);
    expect(sp42.pos).toEqual(BAY);
  });

  it('honours the transporter wind limit with the resume deadband, like SP-41', () => {
    const { world, sp41, sp42 } = setup();
    run(world, 300);
    expect(sp42.fsm.state).toBe('MOVING');
    world.weather.groundGustMPerS = ld.windLimit.transporterMPerS + 1;
    expect(stateChanges(step(world), sp42.id)).toEqual(['WIND_HOLD']);
    const held = { ...sp42.pos };
    world.weather.groundGustMPerS = ld.windLimit.transporterMPerS - ld.windLimit.resumeMarginMPerS / 2;
    expect(stateChanges(run(world, 50), sp42.id)).toEqual([]);
    expect(sp42.pos).toEqual(held);
    world.weather.groundGustMPerS = ld.windLimit.transporterMPerS - ld.windLimit.resumeMarginMPerS - 0.1;
    expect(stateChanges(step(world), sp42.id)).toEqual(['MOVING']); // outbound leg resumes outbound
    run(world, 10);
    expect(sp42.pos).not.toEqual(held);
    // Home and gusty: it does not leave the bay.
    runUntil(world, () => sp42.fsm.state === 'RETURNING');
    world.weather.groundGustMPerS = ld.windLimit.transporterMPerS + 1;
    expect(stateChanges(step(world), sp42.id)).toEqual(['WIND_HOLD']);
    world.weather.groundGustMPerS = 0;
    expect(stateChanges(step(world), sp42.id)).toEqual(['RETURNING']);
    sp41.fsm.state = 'MOVING'; // so that it dwells at the bay instead of turning straight round
    runUntil(world, () => sp42.fsm.state === 'IDLE');
    world.weather.groundGustMPerS = ld.windLimit.transporterMPerS + 1;
    run(world, T(ld.ambientTransporter.dwellYardS));
    sp41.fsm.state = 'IDLE';
    expect(stateChanges(run(world, 100), sp42.id)).toEqual([]);
    expect(sp42.pos).toEqual(BAY);
  });

  it('reaches the apron and leaves SP-41 rollout timing untouched', () => {
    const { world, sp42, sp41, cd } = setup();
    const log = step(world, [{ t: 'StartRollout', boosterId: cd.boosterId }]);
    log.push(...runUntil(world, () => sp42.fsm.state === 'AT_PAD'));
    expect(sp42.pos).toEqual(APRON);
    log.push(...runUntil(world, () => cd.inputs.rolloutComplete));
    const lift = T(ld.craneLoadTaskS);
    const drive = routeTicks('sp.yardToOlm1', ld.transporter.speedLoadedMPerS);
    expect(tickOf(log, sp41.id, 'AT_PAD')).toBe(lift + drive);
  });
});
