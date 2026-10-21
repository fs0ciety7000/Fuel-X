// Countdown (BALANCING §4). `…TS` = signed T-clock offset in seconds (negative before liftoff, e.g.
// T-01:20:00 = -4_800). Durations in s.
import { mvpContract } from './contracts';
import { logistics } from './logistics';
import { weather } from './weather';

export type PollId = 'load' | 'terminal' | 'final';

/**
 * D1 skip stops sit this long before the last moment an order still beats the road closure (BALANCING §15 P2),
 * s; range 120–600.
 */
const orderLastCallLeadS = 300;

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
  /**
   * Per-poll auto-GO: the poll passes by itself when every station is GO (MARGINAL always asks). The final poll
   * (T-00:00:40) always asks for the launch director's GO (GDD §15 q6, answered 7.5b; was one global flag).
   */
  autoGoAtPoll: { load: true, terminal: true, final: false } satisfies Record<PollId, boolean>,
  /** MARGINAL = within this fraction of a limit (unitless). */
  marginalBand: 0.15,
  /**
   * Sim addition 3.7 (review): a station only improves once its value is back this fraction of the limit
   * inside the threshold (deadband, stops GO ⇄ MARGINAL flicker on noisy wind), unitless; range 0.02–0.08.
   * 0.05 (BALANCING §15 P4): 3.0 m/s on the 60 m/s upper-wind limit ≈ 3 min of series drift, so a NO-GO hold
   * is not re-entered within a minute of its release (was 0.03).
   */
  stationHysteresisFraction: 0.05,
  /** Sim addition 3.7: stations are re-evaluated every this many seconds (10 Hz, the HUD projection rate). */
  stationSampleS: 0.1,
  crew: {
    shiftLimitS: 43_200,
    marginalFromS: 39_600,
    elapsedAtStartS: 14_400,
    /**
     * Sim addition 3.7 (review): crew vans CV-01..03 leave the pad for the safe area at this T-offset
     * (T-01:30:00, ≈ 5.5 min drive), one every `vanStaggerS`, so the pad is clear by `crewPadClearByTS`.
     */
    vanDepartTS: -5_400,
    vanStaggerS: 30,
  },
  safingDurationS: 1_800,
  orderLastCallLeadS,
  /**
   * T-clock marks that emit a `Milestone` event when the clock reaches them (skip-to-milestone stops), ascending.
   * The first three are the D1 moments (BALANCING §15 P2), derived from data: the last standard / rush order that
   * still reaches the gate before the road closure (with `orderLastCallLeadS` to spare), and the moment the
   * forecast horizon first covers the window open (the informed-rush moment). Advisory: no rate drop.
   */
  milestones: [
    {
      name: 'STANDARD_ORDER_LAST_CALL',
      tS: logistics.roadClosureStartTS - logistics.delivery.standard.leadTimeS - orderLastCallLeadS,
    },
    { name: 'FORECAST_SEES_WINDOW', tS: mvpContract.windowOpenTS - weather.forecast.horizonS },
    {
      name: 'RUSH_ORDER_LAST_CALL',
      tS: logistics.roadClosureStartTS - logistics.delivery.rush.leadTimeS - orderLastCallLeadS,
    },
    { name: 'ROAD_CLOSURE', tS: logistics.roadClosureStartTS },
    { name: 'TERMINAL_FORCE_1X', tS: -180 },
    { name: 'ENGINE_IGNITION', tS: -3 },
    { name: 'LIFTOFF', tS: 0 },
  ] as const,
};

export type MilestoneName = (typeof countdown.milestones)[number]['name'];
