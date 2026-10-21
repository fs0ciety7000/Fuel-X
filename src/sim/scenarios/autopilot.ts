// Scenario autopilot: the scripted "launch director" shared by the golden test and `window.__fuelx.jumpTo`
// (ARCHITECTURE §9). Stateless — every decision is derived from the world, so a replay, a save/load or a
// different step batching issues exactly the same commands at the same ticks.
//   Standby                → StartRollout + the configured delivery orders (D1)
//   rollout complete       → Stack
//   holding, releasable    → Go (polls, NO-GO holds once clear; never a LEAK_FIX hold)          (D2)
//   A3 leak, no response   → LeakResponse                                                       (D3b)
//   catch decision open    → after boostback end: CATCH if p beats the expected-cost break-even  (D3)
import { economy as economyData } from '@data/index';
import type { Propellant } from '@data/index';
import type { Command } from '../core/commands';
import { getEntity } from '../core/entities';
import type { World } from '../core/world';
import { releaseBlocker } from '../systems/countdown';
import type { Id, LeakChoice } from '../types';

// Module-level aliases: hot paths read a local const, not the import binding (a getter per access under
// Vitest / tsx, which re-export `@data/index` through `export *`). Same objects; data is never reassigned.
const ec = economyData;

export interface AutopilotOptions {
  /** Deliveries ordered with StartRollout. */
  orders: readonly { fluid: Propellant; rush: boolean }[];
  /** Give GO whenever a hold can be released. */
  go: boolean;
  /** Answer the A3 leak (null: never answer, the leak stays degraded). */
  leakResponse: LeakChoice | null;
  /** Make the catch call (false: the flight computer's auto policy decides). */
  catchDecision: boolean;
}

/** The golden-run policy: 3 LX + 1 MX standard orders (restores ≈ 39 min of hold margin, BALANCING §12). */
export const STANDARD_AUTOPILOT: Readonly<AutopilotOptions> = {
  orders: [
    { fluid: 'LOX', rush: false },
    { fluid: 'LOX', rush: false },
    { fluid: 'LOX', rush: false },
    { fluid: 'CH4', rush: false },
  ],
  go: true,
  leakResponse: 'HOLD_FIX',
  catchDecision: true,
};

/**
 * Catch-or-divert break-even p (BALANCING §9): catch when (1 − p) × failed-catch cost < divert cost.
 * Failed catch = booster replacement + tower repair + repair downtime × ops cost.
 */
export function catchBreakEvenP(): number {
  const divert = ec.boosterReplacementCostCr;
  const failed = divert + ec.towerRepairCostCr + ec.towerRepairDowntimeS * ec.opsCostCrPerS;
  return 1 - divert / failed;
}

/** Commands the autopilot issues for the next tick of `countdownId`. */
export function autopilotCommands(
  world: World,
  countdownId: Id,
  opts: Readonly<AutopilotOptions> = STANDARD_AUTOPILOT,
): Command[] {
  const cd = world.countdowns[countdownId];
  if (!cd) return [];
  const cmds: Command[] = [];
  const phase = cd.phase.state;
  if (phase === 'Standby') {
    cmds.push({ t: 'StartRollout', boosterId: cd.boosterId });
    for (const o of opts.orders) cmds.push({ t: 'OrderDelivery', fluid: o.fluid, rush: o.rush });
  }
  if ((phase === 'Rollout' || phase === 'Stack') && cd.inputs.rolloutComplete && !world.prep[cd.id]?.stackRequested) {
    cmds.push({ t: 'Stack', padId: cd.padId });
  }
  if (opts.go && cd.clock.state === 'Holding' && cd.hold?.reason !== 'LEAK_FIX' && releaseBlocker(world, cd) === null) {
    cmds.push({ t: 'Go', countdownId: cd.id });
  }
  const leak = world.anomalies[cd.id]?.leak;
  if (opts.leakResponse && leak?.active && leak.response === null) {
    cmds.push({ t: 'LeakResponse', choice: opts.leakResponse });
  }
  const b = getEntity(world, cd.boosterId);
  const r = b?.kind === 'booster' ? b.recovery : null;
  if (
    opts.catchDecision &&
    b?.kind === 'booster' &&
    b.fsm.state === 'DESCENT' &&
    r?.decisionRequiredTick !== null &&
    r?.mode === null
  ) {
    cmds.push({ t: 'CatchDecision', boosterId: b.id, choice: r.p > catchBreakEvenP() ? 'CATCH' : 'DIVERT' });
  }
  return cmds;
}
