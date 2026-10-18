// Scenario `mvp` (GDD §13.1): Brackwater LC-1 at T-06:00:00, NRL-3 pre-accepted, B-09 / S-21 in the yard,
// farm at the MVP start inventory, everything live (seeded weather, derived stations, anomalies + director).
import { createWorld, LIVE_CONFIG } from '../core/world';
import type { SimConfig, World } from '../core/world';
import { createMvpFlight } from '../entities/flight';
import { spawnSiteLayout } from '../entities/site';
import type { Countdown, Id } from '../types';

export interface MvpScenario {
  world: World;
  /** The NRL-3 attempt (LC-1 FLIGHT 7). */
  countdown: Countdown;
  /** Entity ids by call-sign. */
  ids: Record<string, Id>;
}

export interface MvpScenarioOptions {
  /** Unsigned 32-bit seed. */
  seed: number;
  /** Override parts of the live config (e.g. MANUAL weather for a forced series). */
  config?: Partial<SimConfig>;
}

export function createMvpScenario({ seed, config }: MvpScenarioOptions): MvpScenario {
  const world = createWorld({ seed, config: { ...LIVE_CONFIG, ...config } });
  const ids = spawnSiteLayout(world);
  const countdown = createMvpFlight(world, ids);
  return { world, countdown, ids };
}
