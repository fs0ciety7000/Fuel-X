// Time scale state (ARCHITECTURE §3, GDD §6): PAUSE / 1× / 10× / 100× = more fixed steps, never a bigger dt.
// Effective scale = requested, capped by `capFor` (sim per-phase `maxTimeScale`, 0 once the run ended).
// Never auto-raises: when a cap lifts, the requested scale applies again only because the player asked for it.
// Drops (one-shot requested → 1×) and skip-to-milestone are applied by `afterTick`, called by the SimHost after every
// tick through `AdvanceRequest.stopWhen`, so a drop takes effect on the very next tick (rules in ./rules.ts).
import type { Countdown, SimEvent, World } from '@sim/types';
import type { DropCode, SkipBlockCode, SkipTarget, TimeScale } from './rules';
import { capFor, dropTrigger, nextSkipTarget, runEnded, skipArrived, skipBlocker } from './rules';

export type { TimeScale } from './rules';
export const TIME_SCALES: readonly TimeScale[] = [0, 1, 10, 100];

/** Wall budget per frame while skipping, ms (ARCHITECTURE §3: rendering continues at low cost). */
export const SKIP_BUDGET_MS = 12;
/** Upper bound on ticks per frame while skipping (≈ 3 h of sim; the wall budget binds first). */
export const SKIP_MAX_STEPS_PER_FRAME = 30 * 3_600 * 3;

export interface ActiveSkip {
  target: SkipTarget;
  /** Tick the skip started at. */
  fromTick: number;
}

export interface DropRecord {
  code: DropCode;
  /** Tick whose events fired the drop. */
  tick: number;
  /** Requested rate before the drop. */
  from: Exclude<TimeScale, 0>;
}

export class TimeControl {
  /** Last non-zero scale the player asked for (restored by resume). */
  requested: Exclude<TimeScale, 0> = 1;
  paused = false;
  /** The last frame dropped backlog (step or ms cap hit). */
  lagging = false;
  /** Measured sim seconds per wall second over the last frames. */
  effectiveRate = 0;
  /** Skip in progress (null when not skipping). */
  skip: ActiveSkip | null = null;
  /** Last drop (cleared by the next player rate request or a new run): drives the `⊘ 1× · …` chip. */
  lastDrop: DropRecord | null = null;
  /** Drops fired since the run started (debug / tests). */
  drops = 0;

  /** Player rate request (0 = pause). Ends a skip and clears the drop chip. */
  setScale(s: TimeScale): void {
    this.skip = null;
    this.lastDrop = null;
    if (s === 0) {
      this.paused = true;
      return;
    }
    this.requested = s;
    this.paused = false;
  }

  /** New run / load: forget the skip and drop state (the requested rate is the player's and stays). */
  resetRun(): void {
    this.skip = null;
    this.lastDrop = null;
    this.drops = 0;
    this.lagging = false;
  }

  maxAllowed(world: Readonly<World>, cd: Readonly<Countdown> | null): TimeScale {
    return capFor(world, cd);
  }

  effectiveScale(world: Readonly<World>, cd: Readonly<Countdown> | null): TimeScale {
    if (this.paused || runEnded(cd)) return 0;
    return Math.min(this.requested, this.maxAllowed(world, cd)) as TimeScale;
  }

  /** Paused for the player or because the run ended. */
  isPaused(cd: Readonly<Countdown> | null): boolean {
    return this.paused || runEnded(cd);
  }

  /** Where SKIP would go now (null = nothing scheduled). */
  skipTarget(cd: Readonly<Countdown> | null): SkipTarget | null {
    return this.skip?.target ?? nextSkipTarget(cd);
  }

  /** Why SKIP is disabled now; null = enabled (also null while skipping). */
  skipBlocker(world: Readonly<World>, cd: Readonly<Countdown> | null): SkipBlockCode | null {
    return this.skip ? null : skipBlocker(world, cd);
  }

  /** SKIP TO NEXT MILESTONE: returns the blocker code when it cannot start, else null (skip runs from paused too). */
  startSkip(world: Readonly<World>, cd: Readonly<Countdown> | null): SkipBlockCode | null {
    if (this.skip) return null;
    const blocked = skipBlocker(world, cd);
    const target = nextSkipTarget(cd);
    if (blocked || !target) return blocked ?? 'NO_MILESTONE';
    this.skip = { target, fromTick: world.tick };
    this.lastDrop = null;
    return null;
  }

  cancelSkip(): void {
    this.skip = null;
  }

  /**
   * After every tick (SimHost `stopWhen`): applies a drop trigger (requested → 1×, skip interrupted) and the skip
   * arrival. Returns true when the host should stop stepping this frame (the rate just changed).
   */
  afterTick(events: readonly SimEvent[], world: Readonly<World>, cd: Readonly<Countdown> | null): boolean {
    let stop = false;
    const drop = dropTrigger(events, world, cd);
    if (drop) {
      // Recorded even when already at 1× (the chip names the reason); stepping only stops if the rate changed.
      this.lastDrop = { code: drop, tick: events[0]?.tick ?? world.tick, from: this.requested };
      if (this.requested !== 1 || this.skip !== null) {
        this.drops++;
        this.requested = 1;
        this.skip = null;
        stop = true;
      }
    }
    if (this.skip && skipArrived(this.skip.target, events, cd)) {
      this.skip = null;
      stop = true;
    }
    if (runEnded(cd)) {
      if (this.skip) this.skip = null;
      stop = true;
    }
    return stop;
  }
}
