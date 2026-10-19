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
