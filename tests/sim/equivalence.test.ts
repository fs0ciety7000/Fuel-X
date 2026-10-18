// Equivalence suites (ADR 0006, ARCHITECTURE §10, GDD AC 1): one straight autopilot run of the full scenario,
// then (a) save → load at two points and finish ≡ straight, (b) replay of the recorded command log ≡ the recorded
// event log and world hash, (c) the same replay stepped in uneven batches (time scale = more steps per frame)
// ≡ step by step.
import { describe, expect, it } from 'vitest';
import {
  advance,
  createCommandQueue,
  createMvpScenario,
  deserializeWorld,
  enqueueCommand,
  hashWorld,
  serializeWorld,
  step,
  takeCommands,
} from '../../src/sim/index';
import type { SimEvent, World } from '../../src/sim/index';
import { drive, runMvp } from '../harness';

const SEED = 3; // A1 intruder + director A4 boostback engine-out + failed catch: exercises most systems
const SPLIT_PRE = 450_000; // ≈ T-01:50:00, during the A1 intercept window
const MID = 600_000; // ≈ T-00:46:00, propellant load
const SPLIT_FLIGHT_AFTER_LIFTOFF = 5_400; // T+00:03:00, boostback

describe(`equivalence (scenario mvp, seed ${SEED})`, () => {
  const saves: { tick: number; json: string }[] = [];
  const events: SimEvent[] = [];
  let midHash = '';
  const straight = runMvp({
    seed: SEED,
    each: (world, ev) => {
      events.push(...ev);
      const cd = world.countdowns.cd01;
      if (world.tick === SPLIT_PRE) saves.push({ tick: world.tick, json: serializeWorld(world) });
      if (world.tick === MID) midHash = hashWorld(world);
      if (cd?.liftoffTick != null && world.tick === cd.liftoffTick + SPLIT_FLIGHT_AFTER_LIFTOFF) {
        saves.push({ tick: world.tick, json: serializeWorld(world) });
      }
    },
  });
  const finalHash = hashWorld(straight.world);

  it('the straight run reaches Debrief through the anomalies it is meant to cover', () => {
    expect(straight.countdown.phase.state).toBe('Debrief');
    expect(events.filter((e) => e.t === 'AnomalyFired').map((e) => e.t === 'AnomalyFired' && e.anomaly)).toEqual([
      'A1',
      'A4',
    ]);
    expect(saves).toHaveLength(2);
  });

  it.each([0, 1])('save at split %i → load → finish ≡ straight (canonical hash)', (i) => {
    const save = saves[i];
    if (!save) throw new Error('missing save');
    const world: World = deserializeWorld(save.json);
    const cd = world.countdowns.cd01;
    if (!cd) throw new Error('no countdown');
    const done = drive({ world, countdown: cd, ids: straight.ids });
    expect(done.countdown.phase.state).toBe('Debrief');
    expect(hashWorld(world)).toBe(finalHash);
  });

  it('replay: seed + command log reproduces the event log and the world hash (AC 1)', () => {
    const sc = createMvpScenario({ seed: SEED });
    sc.world.outbox.length = 0;
    const q = createCommandQueue();
    for (const c of straight.commands) enqueueCommand(q, c.tick, c.cmd);
    const replayed: SimEvent[] = [];
    for (let i = 0; i < straight.ticks; i++) {
      replayed.push(...step(sc.world, takeCommands(q, sc.world.tick)));
      sc.world.outbox.length = 0;
    }
    expect(replayed).toEqual(events);
    expect(hashWorld(sc.world)).toBe(finalHash);
  });

  it('time scale: the replay advanced in uneven batches (1, 10, 100, 37, …) ≡ step by step', () => {
    const sc = createMvpScenario({ seed: SEED });
    sc.world.outbox.length = 0;
    const q = createCommandQueue();
    for (const c of straight.commands) enqueueCommand(q, c.tick, c.cmd);
    const batches = [1, 10, 100, 37, 200, 3];
    for (let i = 0; sc.world.tick < MID; i++) {
      advance(sc.world, Math.min(batches[i % batches.length] ?? 1, MID - sc.world.tick), q);
      sc.world.outbox.length = 0;
    }
    expect(hashWorld(sc.world)).toBe(midHash);
  });
});
