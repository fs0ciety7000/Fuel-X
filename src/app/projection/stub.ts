// Minimal typed stand-in for UiProjection (ARCHITECTURE §8) until the 10 Hz projector of task 6.1 exists.
// `__fuelx.state()` returns it; e2e asserts against it. Display formatting stays here, never in the sim.
import type { Countdown, Phase, World } from '@sim/types';
import { formatTClock } from '../jump';
import type { TimeScale } from '../time/time-control';

export interface UiProjectionStub {
  /** Marks the Phase 5 stub; the Phase 6 projection replaces this shape. */
  stub: true;
  tick: number;
  clock: { tClock: string; tClockTicks: number; phase: Phase | null; holding: boolean; holdReason: string | null };
  timeScale: { requested: TimeScale; effective: TimeScale; maxAllowed: TimeScale; lagging: boolean; paused: boolean };
  view: { site: string; follow: string | null; frozen: boolean };
  entities: { id: string; callSign: string; kind: string; state: string | null; visible: boolean }[];
  scene: { ready: boolean; frames: number };
}

export interface StubInputs {
  world: Readonly<World>;
  countdown: Readonly<Countdown> | null;
  timeScale: UiProjectionStub['timeScale'];
  view: UiProjectionStub['view'];
  scene: UiProjectionStub['scene'];
  hidden: (id: string) => boolean;
}

export function projectStub({ world, countdown: cd, timeScale, view, scene, hidden }: StubInputs): UiProjectionStub {
  const entities: UiProjectionStub['entities'] = [];
  for (const id of world.entities.order) {
    const e = world.entities.byId[id];
    if (!e) continue;
    const state = 'fsm' in e ? (e.fsm as { state: string }).state : null;
    entities.push({ id, callSign: e.callSign, kind: e.kind, state, visible: !hidden(id) });
  }
  return {
    stub: true,
    tick: world.tick,
    clock: {
      tClock: cd ? formatTClock(cd.tClockTicks) : '',
      tClockTicks: cd?.tClockTicks ?? 0,
      phase: cd?.phase.state ?? null,
      holding: cd?.clock.state === 'Holding',
      holdReason: cd?.hold?.reason ?? null,
    },
    timeScale,
    view,
    entities,
    scene,
  };
}
