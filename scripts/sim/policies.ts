// Player policies for the headless balancing scripts (playtest.ts, outcome-sweep.ts; BALANCING §15).
import { STANDARD_AUTOPILOT } from '../../src/sim/index.ts';
import type { AutopilotOptions } from '../../src/sim/index.ts';

export const POLICIES: Record<'standard' | 'frugal' | 'hedger', AutopilotOptions> = {
  standard: STANDARD_AUTOPILOT,
  // Spend nothing, accept the leak, let the flight computer make the catch call.
  frugal: { orders: [], go: true, leakResponse: 'DEGRADED', catchDecision: false },
  // Hedge everything: the whole fleet on rush, fix the leak, make the catch call.
  hedger: {
    orders: [
      { fluid: 'LOX', rush: true },
      { fluid: 'LOX', rush: true },
      { fluid: 'LOX', rush: true },
      { fluid: 'LOX', rush: true },
      { fluid: 'CH4', rush: true },
      { fluid: 'CH4', rush: true },
    ],
    go: true,
    leakResponse: 'HOLD_FIX',
    catchDecision: true,
  },
};

export type PolicyName = keyof typeof POLICIES;
