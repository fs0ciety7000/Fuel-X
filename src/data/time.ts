// Time rules (BALANCING §10, GDD §6). Time scale is a step multiplier, never a bigger dt.
import { countdown } from './countdown';

export type TimeScale = 0 | 1 | 10 | 100;

export const time = {
  timeScales: [0, 1, 10, 100] satisfies readonly TimeScale[],
  /** Max time scale per countdown phase (keys = sim `Phase`, checked by the sim's types). */
  maxTimeScaleByPhase: {
    Standby: 100,
    Rollout: 100,
    Stack: 100,
    PropellantLoad: 10,
    TerminalCount: 10,
    Liftoff: 1,
    Boostback: 1,
    TowerCatch: 1,
    Divert: 1,
    Safing: 100,
    Scrubbed: 100,
    Debrief: 100,
  } satisfies Record<string, TimeScale>,
  /** Any hold before T-0 is capped at this scale (holds should be felt). */
  holdMaxTimeScale: 10 as TimeScale,
  /** Forced 1× window: from this T-offset … */
  force1xFromTS: countdown.force1xFromTS,
  /** … until this long after catch/divert (entering Safing), s. */
  force1xAfterRecoveryS: 30,
  /** UI projection freshness guarantee, s (GDD AC 17). */
  uiProjectionMaxAgeS: 0.25,
};
