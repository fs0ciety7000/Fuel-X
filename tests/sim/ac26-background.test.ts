// GDD AC 26 (task 7.3): "Background logistics are visible during the whole run: at least one tanker or transporter is
// moving at all times outside T-00:40:00 → safing end, and PICKET boats patrol during the count."
//
// Headless, several seeds, two policies: the standard autopilot and no input at all (nothing ordered, nothing rolled
// out — the count runs to the T-01:20:00 poll hold and the window closes). Checked on EVERY tick (stronger than the
// one-minute sampling the AC needs; the keep-alive rule works per tick).
//
// "Moving" = actually driving: transporter MOVING | RETURNING, tanker INBOUND | OUTBOUND. LOADING / AT_PAD /
// OFFLOADING / GATE_WAIT / WIND_HOLD are stationary, so they do not count.
// Exemption: a transporter wind hold. Above `windLimit.transporterMPerS` the GDD stops every SP- (SP-41 and the ambient
// SP-42 alike); if no tanker happens to be on the road then, the site may be still. Such ticks are counted and must all
// be windy; a calm seed (99) must have none.
import { lc1Layout, logistics as ld } from '@data/index';
import { describe, expect, it } from 'vitest';
import { createMvpScenario, entitiesOfKind, isPreLiftoff, secondsToTicks, step } from '../../src/sim/index';
import type { Phase, World } from '../../src/sim/index';
import { drive } from '../harness';

const CLOSURE_TICKS = secondsToTicks(ld.roadClosureStartTS);
const AFTER_LIFTOFF: readonly Phase[] = ['Liftoff', 'Boostback', 'TowerCatch', 'Divert', 'Safing'];
const BAY = lc1Layout.points.sp42Bay;
const MAX_TICKS = 30 * 3_600 * 30;

interface Tally {
  ticks: number;
  windowTicks: number;
  stillTicks: number;
  stillCalmTicks: number;
  countTicks: number;
  picketFaults: number;
  sp42OutOfBayInWindow: number;
  closures: number;
  endState: string;
}

function moving(world: World): boolean {
  for (const t of entitiesOfKind(world, 'tanker'))
    if (t.fsm.state === 'INBOUND' || t.fsm.state === 'OUTBOUND') return true;
  for (const t of entitiesOfKind(world, 'transporter')) {
    if (t.fsm.state === 'MOVING' || t.fsm.state === 'RETURNING') return true;
  }
  return false;
}

function check(world: World, cdId: string, t: Tally, wasInWindow: { v: boolean }): void {
  const cd = world.countdowns[cdId];
  if (!cd) throw new Error('no countdown');
  t.ticks++;
  const phase = cd.phase.state;
  const inWindow = (isPreLiftoff(phase) && cd.tClockTicks >= CLOSURE_TICKS) || AFTER_LIFTOFF.includes(phase);
  if (inWindow && !wasInWindow.v) t.closures++;
  wasInWindow.v = inWindow;
  const sp42 = entitiesOfKind(world, 'transporter').find((e) => e.role === 'ambient');
  if (!sp42) throw new Error('no ambient transporter');
  if (inWindow) {
    t.windowTicks++;
    if (sp42.fsm.state !== 'IDLE' || sp42.pos.x !== BAY.x || sp42.pos.z !== BAY.z) t.sp42OutOfBayInWindow++;
  } else if (!moving(world)) {
    t.stillTicks++;
    const windy =
      world.weather.groundGustMPerS > ld.windLimit.transporterMPerS ||
      entitiesOfKind(world, 'transporter').some((e) => e.fsm.state === 'WIND_HOLD');
    if (!windy) t.stillCalmTicks++;
  }
  if (isPreLiftoff(phase)) {
    t.countTicks++;
    const pickets = entitiesOfKind(world, 'boat').filter((b) => b.role === 'picket');
    const onDuty = pickets.length >= 2 && pickets.every((b) => b.fsm.state !== 'DOCKED');
    if (!onDuty || !pickets.some((b) => b.fsm.state === 'PATROL')) t.picketFaults++;
  }
}

function tally(): Tally {
  return {
    ticks: 0,
    windowTicks: 0,
    stillTicks: 0,
    stillCalmTicks: 0,
    countTicks: 0,
    picketFaults: 0,
    sp42OutOfBayInWindow: 0,
    closures: 0,
    endState: '',
  };
}

function runStandard(seed: number): Tally {
  const t = tally();
  const w = { v: false };
  const sc = createMvpScenario({ seed });
  sc.world.outbox.length = 0;
  drive(sc, { each: (world) => check(world, sc.countdown.id, t, w) });
  t.endState = `${sc.countdown.phase.state}/${entitiesOfKind(sc.world, 'transporter')
    .map((e) => e.fsm.state)
    .join(',')}`;
  return t;
}

function runNoInput(seed: number): Tally {
  const t = tally();
  const w = { v: false };
  const sc = createMvpScenario({ seed });
  const cd = sc.countdown;
  for (let i = 0; i < MAX_TICKS && cd.phase.state !== 'Debrief'; i++) {
    step(sc.world, []);
    sc.world.outbox.length = 0;
    check(sc.world, cd.id, t, w);
  }
  t.endState = `${cd.phase.state}/${entitiesOfKind(sc.world, 'transporter')
    .map((e) => e.fsm.state)
    .join(',')}`;
  return t;
}

describe.each([42, 1, 99])('AC 26 background logistics, seed %i', (seed) => {
  it.each([
    ['standard autopilot', runStandard],
    ['no input', runNoInput],
  ] as const)('%s: something drives outside the closure, SP-42 parked inside it, pickets on patrol', (_name, fn) => {
    const t = fn(seed);
    expect(t.endState.startsWith('Debrief/')).toBe(true);
    expect(t.stillCalmTicks).toBe(0); // never still unless a transporter wind hold stops the SPs
    if (seed === 99) expect(t.stillTicks).toBe(0); // calm seed: never still at all
    expect(t.picketFaults).toBe(0);
    expect(t.countTicks).toBeGreaterThan(0);
    expect(t.sp42OutOfBayInWindow).toBe(0);
    if (fn === runStandard) {
      expect(t.closures).toBe(1);
      expect(t.windowTicks).toBeGreaterThan(0);
    } else {
      expect(t.windowTicks).toBe(0); // the count holds at T-01:20:00: the road never closes
    }
    console.log(
      `AC 26 seed ${seed} ${_name}: ${t.ticks} ticks, closure ${(t.windowTicks / 30 / 60).toFixed(1)} min, still (wind) ${(t.stillTicks / 30).toFixed(1)} s, end ${t.endState}`,
    );
  });
});
