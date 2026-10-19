// Time rules (GDD §6, AC 23): drop triggers, caps, skip-to-milestone — unit level on real scenario states, and a
// scripted input sequence through GameLoop + InlineSimHost asserting requested / effective rate per frame.
import { createMvpScenario, hashWorld, secondsToTicks } from '@sim/index';
import type { Countdown, SimEvent, World } from '@sim/types';
import { describe, expect, it } from 'vitest';
import { GameLoop } from '../loop';
import { InlineSimHost } from '../sim-host/inline';
import { capFor, dropTrigger, nextSkipTarget, skipArrived, skipBlocker } from './rules';
import { TimeControl } from './time-control';

const zero = (): number => 0;

function scenario(): { world: World; cd: Countdown } {
  const sc = createMvpScenario({ seed: 42 });
  sc.world.outbox.length = 0;
  return { world: sc.world, cd: sc.countdown };
}

const ev = (e: Record<string, unknown>): SimEvent => ({ tick: 10, countdownId: 'cd01', ...e }) as unknown as SimEvent;

describe('dropTrigger', () => {
  it('fires on blocking decisions, POLL / NO_GO / LOAD_INCOMPLETE holds and NO-GO stations, not on D1 or player holds', () => {
    const { world, cd } = scenario();
    expect(
      dropTrigger([ev({ t: 'DecisionRequired', decision: 'CATCH', poll: null, deadlineTick: 99 })], world, cd),
    ).toBe('DECISION_OPEN');
    expect(
      dropTrigger([ev({ t: 'DecisionRequired', decision: 'LEAK', poll: null, deadlineTick: 99 })], world, cd),
    ).toBe('DECISION_OPEN');
    for (const reason of ['POLL', 'NO_GO', 'LOAD_INCOMPLETE'])
      expect(dropTrigger([ev({ t: 'HoldStarted', reason, poll: null, tClockTicks: 0 })], world, cd)).toBe(
        'DECISION_OPEN',
      );
    for (const reason of ['MANUAL', 'LEAK_FIX'])
      expect(dropTrigger([ev({ t: 'HoldStarted', reason, poll: null, tClockTicks: 0 })], world, cd)).toBeNull();
    expect(
      dropTrigger([ev({ t: 'StationChanged', station: 'RANGE', status: 'NO_GO', driver: 'INTRUDER' })], world, cd),
    ).toBe('NO_GO');
    expect(
      dropTrigger([ev({ t: 'StationChanged', station: 'RANGE', status: 'MARGINAL', driver: 'X' })], world, cd),
    ).toBeNull();
    expect(dropTrigger([ev({ t: 'DeliveryOrdered' })], world, cd)).toBeNull();
    expect(dropTrigger([], world, cd)).toBeNull();
  });

  it('GO_POSSIBLE only while holding (not LEAK_FIX) when the change leaves all five GO', () => {
    const { world, cd } = scenario();
    const go = [ev({ t: 'StationChanged', station: 'PROPELLANT', status: 'GO', driver: 'NOMINAL' })];
    for (const s of Object.keys(cd.inputs.stations) as (keyof typeof cd.inputs.stations)[])
      cd.inputs.stations[s] = 'GO';
    expect(dropTrigger(go, world, cd)).toBeNull(); // counting
    cd.clock.state = 'Holding';
    cd.hold = { reason: 'NO_GO', poll: null };
    expect(dropTrigger(go, world, cd)).toBe('GO_POSSIBLE');
    cd.hold = { reason: 'LEAK_FIX', poll: null };
    expect(dropTrigger(go, world, cd)).toBeNull();
    cd.hold = { reason: 'MANUAL', poll: null };
    cd.inputs.stations.WEATHER = 'MARGINAL';
    expect(dropTrigger(go, world, cd)).toBeNull(); // one still not GO
  });
});

describe('caps and skip availability', () => {
  it('Debrief is paused with rate control disabled (RUN_ENDED)', () => {
    const { world, cd } = scenario();
    cd.phase.state = 'Debrief';
    expect(capFor(world, cd)).toBe(0);
    expect(skipBlocker(world, cd)).toBe('RUN_ENDED');
    const t = new TimeControl();
    t.setScale(100);
    expect(t.effectiveScale(world, cd)).toBe(0);
    expect(t.isPaused(cd)).toBe(true);
  });

  it('skip targets the next poll / milestone, the Debrief after the flight, nothing in flight', () => {
    const { world, cd } = scenario();
    expect(nextSkipTarget(cd)).toMatchObject({ kind: 'TCLOCK', name: 'LOAD POLL', poll: 'load' });
    cd.tClockTicks = secondsToTicks(-4_800);
    expect(nextSkipTarget(cd)).toMatchObject({ name: 'ROAD CLOSURE', tClockTicks: secondsToTicks(-2_400) });
    cd.tClockTicks = secondsToTicks(-600);
    expect(nextSkipTarget(cd)).toMatchObject({ name: 'TERMINAL FORCE 1X' });
    cd.phase.state = 'Boostback';
    expect(nextSkipTarget(cd)).toBeNull();
    cd.phase.state = 'Safing';
    expect(nextSkipTarget(cd)).toEqual({ kind: 'DEBRIEF', name: 'DEBRIEF' });
    cd.phase.state = 'TerminalCount';
    cd.tClockTicks = secondsToTicks(-120);
    expect(skipBlocker(world, cd)).toBe('FORCED_1X');
  });

  it('skip is disabled while a blocking decision is open (D2 hold), allowed with D1 only', () => {
    const { world, cd } = scenario();
    expect(skipBlocker(world, cd)).toBeNull(); // D1 is open at the start: advisory
    cd.clock.state = 'Holding';
    cd.hold = { reason: 'MANUAL', poll: null };
    expect(skipBlocker(world, cd)).toBe('DECISION_OPEN');
  });

  it('skipArrived on the target mark or an earlier milestone / poll', () => {
    const { cd } = scenario();
    const target = nextSkipTarget(cd);
    if (!target) throw new Error('no target');
    expect(skipArrived(target, [], cd)).toBe(false);
    expect(skipArrived(target, [ev({ t: 'Milestone', name: 'ROAD_CLOSURE' })], cd)).toBe(true);
    cd.tClockTicks = secondsToTicks(-4_800);
    expect(skipArrived(target, [], cd)).toBe(true);
  });
});

describe('TimeControl drops', () => {
  it('drop = one-shot reset of the requested rate; the player may raise it again up to the cap', () => {
    const { world, cd } = scenario();
    const t = new TimeControl();
    t.setScale(100);
    const hold = [ev({ t: 'HoldStarted', reason: 'POLL', poll: 'load', tClockTicks: -144_000 })];
    expect(t.afterTick(hold, world, cd)).toBe(true);
    expect(t.requested).toBe(1);
    expect(t.lastDrop).toMatchObject({ code: 'DECISION_OPEN', from: 100 });
    expect(t.drops).toBe(1);
    // the same trigger instance is not re-evaluated; later ticks without triggers never raise the rate
    expect(t.afterTick([], world, cd)).toBe(false);
    t.setScale(10);
    expect(t.requested).toBe(10);
    expect(t.lastDrop).toBeNull();
    // already at 1×: the chip records the reason but stepping does not stop
    t.setScale(1);
    expect(t.afterTick(hold, world, cd)).toBe(false);
    expect(t.lastDrop?.code).toBe('DECISION_OPEN');
    expect(t.drops).toBe(1);
  });

  it('a drop interrupts a skip at the current tick (rate 1×)', () => {
    const { world, cd } = scenario();
    const t = new TimeControl();
    t.setScale(10);
    expect(t.startSkip(world, cd)).toBeNull();
    expect(t.skip?.target.name).toBe('LOAD POLL');
    const noGo = [ev({ t: 'StationChanged', station: 'WEATHER', status: 'NO_GO', driver: 'UPPER WIND' })];
    expect(t.afterTick(noGo, world, cd)).toBe(true);
    expect(t.skip).toBeNull();
    expect(t.requested).toBe(1);
  });
});

/** GameLoop over a real InlineSimHost with a fake wall clock (16.7 ms frames). */
function rig() {
  const host = new InlineSimHost(zero);
  const time = new TimeControl();
  const clock = { t: 0 };
  const events: SimEvent[] = [];
  const loop = new GameLoop({
    host,
    time,
    onEvents: (e) => events.push(...e),
    render: () => undefined,
    now: () => clock.t,
    raf: () => 0,
    caf: () => undefined,
  });
  const frame = (): void => {
    clock.t += 1000 / 60;
    loop.tick(clock.t);
  };
  return { host, time, loop, events, frame };
}

describe('time rules through the loop (AC 23 scripted)', () => {
  it('100× requested: capped to 10× in the load, dropped to 1× at the load-poll hold, never auto-raised', async () => {
    const r = rig();
    await r.host.newGame({ seed: 42 });
    await r.host.jump({ tClockTicks: secondsToTicks(-4_830) });
    r.time.setScale(100);
    let holdTick: number | null = null;
    let afterHoldFrames = 0;
    let prevRequested = r.time.requested;
    for (let i = 0; i < 400 && afterHoldFrames < 30; i++) {
      const before = r.host.inspect().world.tick;
      r.frame();
      const { world, countdown } = r.host.inspect();
      const eff = r.time.effectiveScale(world, countdown);
      expect(eff).toBeLessThanOrEqual(r.time.maxAllowed(world, countdown));
      expect(r.time.requested).toBeLessThanOrEqual(prevRequested); // never auto-raised
      prevRequested = r.time.requested;
      const hold = r.events.find((e) => e.t === 'HoldStarted' && e.reason === 'POLL');
      if (hold && holdTick === null) {
        holdTick = hold.tick;
        // stepping stopped right after the tick that opened the hold
        expect(world.tick).toBe(hold.tick + 1);
        expect(before).toBeLessThanOrEqual(hold.tick);
        expect(r.time.requested).toBe(1);
        expect(r.time.lastDrop).toMatchObject({ code: 'DECISION_OPEN', tick: hold.tick, from: 100 });
      } else if (holdTick !== null) {
        afterHoldFrames++;
        expect(world.tick - before).toBeLessThanOrEqual(1); // 1× = 0.5 ticks per 60 Hz frame
      } else {
        // before the poll: PropellantLoad / Stack caps 10× (Stack 100×) — at most 10 × 0.5 or 100 × 0.5 ticks
        expect(world.tick - before).toBeLessThanOrEqual(Math.ceil(r.time.maxAllowed(world, countdown) / 2) + 1);
      }
    }
    expect(holdTick).not.toBeNull();
    // the player raises the rate again: allowed up to the cap
    r.time.setScale(100);
    expect(r.time.requested).toBe(100);
  });

  it('skip to the load poll runs the same ticks as 1× (deterministic) and stops at the mark', async () => {
    const r = rig();
    await r.host.newGame({ seed: 42 });
    await r.host.jump({ tClockTicks: secondsToTicks(-5_400) });
    r.time.setScale(1);
    const { world, countdown } = r.host.inspect();
    expect(r.time.startSkip(world, countdown)).toBeNull();
    for (let i = 0; i < 10 && r.time.skip; i++) r.frame();
    expect(r.time.skip).toBeNull();
    const after = r.host.inspect();
    const reachedMark = (after.countdown?.tClockTicks ?? 0) >= secondsToTicks(-4_800);
    const interrupted = r.time.lastDrop !== null;
    expect(reachedMark || interrupted).toBe(true);
    expect(r.time.requested).toBe(1);

    const ref = new InlineSimHost(zero);
    await ref.newGame({ seed: 42 });
    await ref.jump({ tick: after.world.tick });
    expect(hashWorld(ref.inspect().world as World)).toBe(hashWorld(after.world as World));
  });
});
