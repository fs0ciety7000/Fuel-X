// Command API (ADR 0004): the only way the UI acts on the simulation. The UI never mutates sim state or the
// projection; it calls `commands.send(cmd)` with a typed sim `Command` (usually `ActionVM.command` verbatim). The app
// binds the sink to `SimHost.send` (stamped for the next tick); rejections come back as `CommandRejected` events in
// the projection (events log). The bridge cannot import the app, so this is a port the composition root plugs in.
import type { Command } from '@sim/types';

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
export type SessionActionId = 'SKIP' | 'CANCEL_SKIP';

export interface SessionHandlers {
  /** SKIP TO NEXT MILESTONE (GDD §6): ignored when `timeScale.skip.enabled` is false. */
  skipToNextMilestone(): void;
  /** Stop a running skip at the current tick (the requested rate is unchanged). */
  cancelSkip(): void;
}

export interface SessionPort extends SessionHandlers {
  /** Dispatch by stable id (debrief / rate-control buttons). */
  run(id: SessionActionId): void;
  /** Composition root only. Returns the unbind function. */
  bind(handlers: SessionHandlers): () => void;
  readonly stats: { calls: number; dropped: number };
}

export function createSessionPort(): SessionPort {
  let h: SessionHandlers | null = null;
  const stats = { calls: 0, dropped: 0 };
  const call = (fn: (x: SessionHandlers) => void): void => {
    if (!h) {
      stats.dropped++;
      return;
    }
    stats.calls++;
    fn(h);
  };
  const port: SessionPort = {
    skipToNextMilestone: () => call((x) => x.skipToNextMilestone()),
    cancelSkip: () => call((x) => x.cancelSkip()),
    run(id) {
      switch (id) {
        case 'SKIP':
          port.skipToNextMilestone();
          break;
        case 'CANCEL_SKIP':
          port.cancelSkip();
          break;
      }
    },
    bind(next) {
      h = next;
      return () => {
        if (h === next) h = null;
      };
    },
    stats,
  };
  return port;
}

/** The game's session port (one per page). */
export const session: SessionPort = createSessionPort();
