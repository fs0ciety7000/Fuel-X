// Command API (ADR 0004): the only way the UI acts on the simulation. The UI never mutates sim state or the
// projection; it calls `commands.send(cmd)` with a typed sim `Command` (usually `ActionVM.command` verbatim). The app
// binds the sink to `SimHost.send` (stamped for the next tick); rejections come back as `CommandRejected` events in
// the projection (events log). The bridge cannot import the app, so this is a port the composition root plugs in.
import type { Command } from '@sim/types';
import type { SessionActionId } from './projection-types';

export type CommandSink = (cmd: Command) => void;

export interface CommandPort {
  /** Queue a sim command for the next tick. Dropped (counted) while no host is bound. */
  send(cmd: Command): void;
  /** Composition root only: route commands to the SimHost. Returns the unbind function. */
  bind(sink: CommandSink): () => void;
  /** Commands sent / dropped so far (debug, tests). */
  readonly stats: { sent: number; dropped: number };
}

export function createCommandPort(): CommandPort {
  let sink: CommandSink | null = null;
  const stats = { sent: 0, dropped: 0 };
  return {
    send(cmd) {
      if (!sink) {
        stats.dropped++;
        return;
      }
      stats.sent++;
      sink(cmd);
    },
    bind(next) {
      sink = next;
      return () => {
        if (sink === next) sink = null;
      };
    },
    stats,
  };
}

/** The game's command port (one per page). */
export const commands: CommandPort = createCommandPort();

// --- Session / time commands (app-level, not sim commands) ------------------------------------------------------
// Stable names the HUD wires buttons and keys to (ARCHITECTURE §8 "Command API"). The app binds the handlers; each
// call is a no-op (counted as dropped) while unbound. Results show up in the projection (`timeScale.skip`, …).

/** Stable ids of the session actions (`ActionVM.session` carries one; `session.run(id)` dispatches it). */
export type { SessionActionId } from './projection-types';

export interface SessionHandlers {
  /** SKIP TO NEXT MILESTONE (GDD §6): ignored when `timeScale.skip.enabled` is false. */
  skipToNextMilestone(): void;
  /** Stop a running skip at the current tick (the requested rate is unchanged). */
  cancelSkip(): void;
  /** REPLAY SAME SEED (GDD §13.2.3): fresh `mvp` world, same seed, empty command log. */
  replaySameSeed(): void;
  /** NEW SEED: same as replay with a seed drawn by the app; the URL becomes `/play?seed=N`. */
  newSeed(): void;
  /** EXPORT LOG: downloads the session file (JSON: scenario, seed, data revision, commands, events, debrief). */
  exportLog(): void;
  /**
   * VIEW SITE (Esc): the sheet collapse is UI state (`src/ui/hud/debrief/debrief-ui.ts`); the app only makes sure
   * the run stays paused (rate control disabled `RUN ENDED`) and no skip runs.
   */
  viewSite(): void;
}

export interface SessionPort extends SessionHandlers {
  /** Dispatch by stable id (debrief / rate-control buttons). */
  run(id: SessionActionId): void;
  /** Composition root only. Returns the unbind function. */
  bind(handlers: SessionHandlers): () => void;
  readonly stats: { calls: number; dropped: number };
}

const SESSION_METHOD: Record<SessionActionId, keyof SessionHandlers> = {
  SKIP: 'skipToNextMilestone',
  CANCEL_SKIP: 'cancelSkip',
  REPLAY: 'replaySameSeed',
  NEW_SEED: 'newSeed',
  EXPORT_LOG: 'exportLog',
  VIEW_SITE: 'viewSite',
};

export function createSessionPort(): SessionPort {
  let h: SessionHandlers | null = null;
  const stats = { calls: 0, dropped: 0 };
  const call = (m: keyof SessionHandlers): void => {
    if (!h) {
      stats.dropped++;
      return;
    }
    stats.calls++;
    h[m]();
  };
  return {
    skipToNextMilestone: () => call('skipToNextMilestone'),
    cancelSkip: () => call('cancelSkip'),
    replaySameSeed: () => call('replaySameSeed'),
    newSeed: () => call('newSeed'),
    exportLog: () => call('exportLog'),
    viewSite: () => call('viewSite'),
    run: (id) => call(SESSION_METHOD[id]),
    bind(next) {
      h = next;
      return () => {
        if (h === next) h = null;
      };
    },
    stats,
  };
}

/** The game's session port (one per page). */
export const session: SessionPort = createSessionPort();
