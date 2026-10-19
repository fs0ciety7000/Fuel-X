// Headless projection harness: drives the mvp scenario with the autopilot (tests/harness.ts), sampling sparklines
// every tick and logging every event like the app loop does, then projects with a fixed view and time state.
import { initialViewState } from '../../src/bridge/stores';
import type { ViewState } from '../../src/bridge/stores';
import type { UiProjection } from '../../src/bridge/projection-types';
import { EventLog, SparkSampler, UTC_AT_TICK0_S, projectUi } from '../../src/app/projection';
import type { TimeInputs } from '../../src/app/projection';
import { maxTimeScale } from '../../src/sim/index';
import type { AutopilotOptions, World } from '../../src/sim/index';
import { runMvp } from '../harness';
import type { RunResult } from '../harness';

export interface Projected {
  run: RunResult;
  sampler: SparkSampler;
  log: EventLog;
  project(view?: Partial<ViewState>, prev?: UiProjection | null, seq?: number): UiProjection;
}

export function timeAt(run: RunResult, requested: 1 | 10 | 100 = 1): TimeInputs {
  const max = maxTimeScale(run.world, run.countdown);
  const eff = Math.min(requested, max) as 1 | 10 | 100;
  return { requested, paused: false, effective: eff, maxAllowed: max, lagging: false, effectiveRate: eff };
}

export function projectedRun(seed: number, until: (w: World) => boolean, autopilot?: AutopilotOptions): Projected {
  const sampler = new SparkSampler();
  const log = new EventLog();
  const run = runMvp({
    seed,
    ...(autopilot ? { autopilot } : {}),
    until,
    each: (world, events) => {
      const cd = world.countdowns.cd01 ?? null;
      log.add(world, events, UTC_AT_TICK0_S);
      sampler.sample(world, cd);
    },
  });
  return {
    run,
    sampler,
    log,
    project: (view = {}, prev = null, seq = 1) =>
      projectUi(run.world, prev, { ...initialViewState(), ...view }, {
        countdown: run.countdown,
        time: timeAt(run),
        spark: sampler,
        events: log.list(),
        seq,
      }),
  };
}
