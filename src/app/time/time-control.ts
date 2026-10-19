// Time scale state (ARCHITECTURE §3, GDD §6): PAUSE / 1× / 10× / 100× = more fixed steps, never a bigger dt.
// Effective scale = requested, capped by the sim's per-phase `maxTimeScale` (forced 1× windows, hold caps).
// Never auto-raises: when a cap lifts, the requested scale applies again only because the player asked for it.
// The fuller rule set (drop to 1× on decision prompts, skip-to-milestone) is task 7.2 in src/app/time/rules.ts.
import { maxTimeScale } from '@sim/index';
import type { Countdown, World } from '@sim/types';

export type TimeScale = 0 | 1 | 10 | 100;
export const TIME_SCALES: readonly TimeScale[] = [0, 1, 10, 100];

export class TimeControl {
  /** Last non-zero scale the player asked for (restored by resume). */
  requested: Exclude<TimeScale, 0> = 1;
  paused = false;
  /** The last frame dropped backlog (step or ms cap hit). */
  lagging = false;
  /** Measured sim seconds per wall second over the last frames. */
  effectiveRate = 0;

  setScale(s: TimeScale): void {
    if (s === 0) {
      this.paused = true;
      return;
    }
    this.requested = s;
    this.paused = false;
  }

  maxAllowed(world: Readonly<World>, cd: Readonly<Countdown> | null): TimeScale {
    return cd ? maxTimeScale(world as World, cd as Countdown) : 100;
  }

  effectiveScale(world: Readonly<World>, cd: Readonly<Countdown> | null): TimeScale {
    if (this.paused) return 0;
    return Math.min(this.requested, this.maxAllowed(world, cd)) as TimeScale;
  }
}
