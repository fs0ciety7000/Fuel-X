// Countdown (BALANCING §4). `…TS` = signed T-clock offset in seconds (negative before liftoff, e.g.
// T-01:20:00 = -4_800). Durations in s.
import { logistics } from './logistics';

export type PollId = 'load' | 'terminal' | 'final';

export const countdown = {
  /** Scenario start, T-06:00:00. */
  scenarioStartTS: -21_600,
  /** Go/No-Go polls: the T-clock does not pass these without a GO (GDD AC 11). */
  pollTS: { load: -4_800, terminal: -600, final: -40 } satisfies Record<PollId, number>,
  /** Crew vans out of the hazard radius before load. */
  crewPadClearByTS: -4_800,
  /** Propellant load nominal start (T-01:15:00). */
  loadStartTS: -4_500,
  /** Load not complete at this T-offset → automatic hold (T-00:03:00). */
  loadMustCompleteByTS: -180,
  /** Forced 1× from here until catch/divert + 30 s (GDD §6). */
  force1xFromTS: -180,
  /** Hard fault after this → abort → RECYCLE. */
  autoAbortAfterTS: -10,
  engineIgnitionTS: -3,
  /** RECYCLE returns the T-clock to this offset (T-00:10:00). */
  recycleToTS: -600,
  /** Polls pass automatically when every station is GO; MARGINAL always asks. */
  autoGoWhenAllGreen: true,
  /** MARGINAL = within this fraction of a limit (unitless). */
  marginalBand: 0.15,
  crew: {
    shiftLimitS: 43_200,
    marginalFromS: 39_600,
    elapsedAtStartS: 14_400,
  },
  safingDurationS: 1_800,
  /** T-clock marks that emit a `Milestone` event when the clock reaches them (skip-to-milestone stops). */
  milestones: [
    { name: 'ROAD_CLOSURE', tS: logistics.roadClosureStartTS },
    { name: 'TERMINAL_FORCE_1X', tS: -180 },
    { name: 'ENGINE_IGNITION', tS: -3 },
    { name: 'LIFTOFF', tS: 0 },
  ] as const,
};

export type MilestoneName = (typeof countdown.milestones)[number]['name'];
