// SimHost (ADR 0003 §7): the only door between the app and the simulation. Every payload is structured-clone
// safe (commands, events, typed-array snapshot, JSON saves) so a WorkerSimHost can implement the same interface:
// the per-frame calls (`send`, `advance`, `drainEvents`, `snapshot`) become messages answered with the next
// snapshot, and the long operations are already Promise-shaped.
import type { Command, Countdown, Phase, SimEvent, SimEventType, StampedCommand, World } from '@sim/types';
import type { RenderSnapshot } from '@render/snapshot';

export interface NewGameOptions {
  seed: number;
  scenario?: 'mvp';
  /** Scripted director issues the STANDARD_AUTOPILOT decisions every tick (default true until the HUD exists). */
  autopilot?: boolean;
}

export type JumpTarget = { tClockTicks: number } | { tick: number } | { phase: Phase };

export interface AdvanceRequest {
  /** Upper bound on ticks this call (time scale × frame dt ÷ DT, capped by MAX_STEPS_PER_FRAME). */
  maxSteps: number;
  /** Wall-clock budget for stepping, ms (SIM_BUDGET_MS). */
  budgetMs: number;
  /** Stop right after a tick that emitted one of these (milestone / forced-1× rules, ARCHITECTURE §3). */
  stopOn?: readonly SimEventType[];
  /**
   * Called after every tick with that tick's events (time rules: drops, skip arrival, 7.2); true = stop stepping.
   * Inline host only — a worker host evaluates the same rules (`src/app/time/rules.ts`, pure) on its side.
   */
  stopWhen?: (events: readonly SimEvent[]) => boolean;
}

export interface AdvanceReport {
  steps: number;
  /** A `stopOn` event fired. */
  stopped: boolean;
  /** Wall time spent stepping, ms. */
  ms: number;
}

export interface SimTimings {
  /** Mean / p95 µs per tick over the recent advance calls. */
  usPerTickMean: number;
  usPerTickP95: number;
  /** ms spent stepping in the last advance call. */
  lastAdvanceMs: number;
  /** Last headless jump: ticks and wall ms (a warm, large-sample µs/tick figure). */
  lastJump: { ticks: number; ms: number };
}

/** Everything a run consumed and produced since `newGame` / `load` (EXPORT LOG). */
export interface SessionLog {
  seed: number;
  scenario: 'mvp';
  autopilot: boolean;
  /** Tick the log starts at (0 for a new game; the save's tick after a load). */
  fromTick: number;
  /** Tick the log ends at. */
  tick: number;
  /** Player + autopilot commands, stamped (replay input). */
  commandLog: StampedCommand[];
  events: SimEvent[];
  /** `MAX_SESSION_EVENTS` reached: later events are missing. */
  eventsTruncated: boolean;
}

export interface SimHost {
  readonly snapshot: RenderSnapshot;
  newGame(opts: NewGameOptions): Promise<void>;
  /** Queues a command for the next tick (stamped by the host). */
  send(cmd: Command): void;
  advance(req: AdvanceRequest): AdvanceReport;
  /**
   * Steps headless (no snapshot writes until the end, outbox cleared every tick) until `target` is reached.
   * `onTick` runs after every tick (the projector samples sparklines so a jump keeps its history).
   */
  jump(target: JumpTarget, maxTicks?: number, onTick?: () => void): Promise<{ ticks: number }>;
  /** Commands queued for a tick that has not run yet (sent while paused). */
  pendingCommands(): number;
  /** Events since the last drain (the outbox is emptied every frame). */
  drainEvents(): SimEvent[];
  save(meta: { game: string; createdAt: string }): Promise<string>;
  load(json: string): Promise<void>;
  timings(): SimTimings;
  sessionLog(): SessionLog;
  /** Read-only world access for the projector / debug hooks (inline host; a worker host mirrors a projection). */
  inspect(): { world: Readonly<World>; countdown: Readonly<Countdown> | null; seed: number; autopilot: boolean };
}
