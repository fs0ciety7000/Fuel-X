// SimHost (ADR 0003 §7): the only door between the app and the simulation. Every payload is structured-clone
// safe (commands, events, typed-array snapshot, JSON saves) so a WorkerSimHost can implement the same interface:
// the per-frame calls (`send`, `advance`, `drainEvents`, `snapshot`) become messages answered with the next
// snapshot, and the long operations are already Promise-shaped.
import type { Command, Countdown, Phase, SimEvent, SimEventType, World } from '@sim/types';
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

export interface SimHost {
  readonly snapshot: RenderSnapshot;
  newGame(opts: NewGameOptions): Promise<void>;
  /** Queues a command for the next tick (stamped by the host). */
  send(cmd: Command): void;
  advance(req: AdvanceRequest): AdvanceReport;
  /** Steps headless (no snapshot writes until the end, outbox cleared every tick) until `target` is reached. */
  jump(target: JumpTarget, maxTicks?: number): Promise<{ ticks: number }>;
  /** Events since the last drain (the outbox is emptied every frame). */
  drainEvents(): SimEvent[];
  save(meta: { game: string; createdAt: string }): Promise<string>;
  load(json: string): Promise<void>;
  timings(): SimTimings;
  /** Read-only world access for the projector / debug hooks (inline host; a worker host mirrors a projection). */
  inspect(): { world: Readonly<World>; countdown: Readonly<Countdown> | null; seed: number; autopilot: boolean };
}
