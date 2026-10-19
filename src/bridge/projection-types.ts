// UiProjection (ARCHITECTURE §8, ADR 0004, DESIGN_SYSTEM §13): the display-ready, throttled view of the sim that
// the HUD renders verbatim. **Source of truth** for the HUD view models: `src/ui/types.ts` re-exports this file;
// the app's projector (src/app/projection) produces it. Shape drafted by ui-design-system (6.2), extended in 6.1
// with what the projector knows (machine codes, SI values, the exact sim `Command` behind every button).
// Plain JSON only (no functions / Maps / class instances): fixtures are literals, a worker host could post it.
//
// Conventions
// - Formatting (units, rounding, fixed decimals, true minus `−`, thin-space grouping) happens in the projector;
//   the UI never converts units or compares thresholds. Missing data = `text: '—'`, `value: null`.
// - `value` fields of ValueVM are SI (m, s, kg, m/s, Pa), unitless fractions or cr — for `<data value>`.
// - Rows / cards keep object identity between projections while unchanged (structural sharing): select narrowly
//   and compare with `useShallow` / `Object.is`.
// - Fields marked optional that extend the 6.2 draft (codes, ids, commands, SI) are **always set by the projector**;
//   they are optional only so hand-written fixtures stay small.
import type { Command, HoldReason, PollId, RecoveryMode, StationDriver } from '@sim/types';

/** DESIGN_SYSTEM §2.3 semantic states. Computed by the projector. */
export type Severity = 'neutral' | 'info' | 'ok' | 'active' | 'warn' | 'danger' | 'disabled';

/** DESIGN_SYSTEM §7 glyph ids (SVG symbol `g-<id>` in the sprite). */
export type GlyphId =
  | 'ok'
  | 'done'
  | 'current'
  | 'pending'
  | 'idle'
  | 'parked'
  | 'driving'
  | 'patrol'
  | 'holding'
  | 'ascent'
  | 'descent'
  | 'boostback'
  | 'caught'
  | 'fueling'
  | 'stacked'
  | 'build'
  | 'offline'
  | 'warn'
  | 'danger'
  | 'selected'
  | 'crosshair'
  | 'pause'
  | 'skip'
  | 'close'
  | 'caret'
  | 'check'
  | 'search'
  | 'plus'
  | 'minus';

/** A display-ready number (DESIGN_SYSTEM §6.36). `value: null` = missing data → `—` in the same slot. */
export interface ValueVM {
  /** Formatted digits without unit, e.g. `100.0`, `T−00:00:04`, `−40.00`. */
  text: string;
  /** Uppercase display unit, e.g. `%`, `KM/H`, `M CR` ('' = none). Rendered after a thin space. */
  unit?: string;
  /** Machine value (SI / fraction / cr) for `<data value>`; null when missing. */
  value: number | null;
  /** Fixed slot width in characters (widest legal text), keeps numbers from shifting. */
  width?: number;
  /** Source older than 2 s or offline. */
  stale?: boolean;
}

// --- Clock & time -----------------------------------------------------------------------------------

export type PhaseId =
  | 'Standby'
  | 'Rollout'
  | 'Stack'
  | 'PropellantLoad'
  | 'TerminalCount'
  | 'Liftoff'
  | 'Boostback'
  | 'TowerCatch'
  | 'Divert'
  | 'Safing'
  | 'Scrubbed'
  | 'Debrief';

export interface ClockVM {
  /** Sim time of day, `HH:MM:SS` (UTC). */
  utc: string;
  /** Sim UTC, s since 00:00 of the scenario day. */
  utcS?: number;
  /** `T−00:00:04` / `T+00:01:45` (true minus); `—` without a countdown. Above 99 h: `T−4D 06:12`. */
  tClock: string;
  /** T-clock, s (negative before T-0); null without a countdown. */
  tClockS?: number | null;
  /** `T+00:01:45` after liftoff, else null. */
  missionClock: string | null;
  phase: PhaseId | null;
  phaseLabel: string;
  holding: boolean;
  holdReason: HoldReason | null;
  /** `HOLD · POLL`, '' while counting. */
  holdLabel?: string;
  /** Launch window open / close, sim UTC `HH:MM:SS` ('' without a countdown). */
  windowOpenAt: string;
  windowCloseAt: string;
  windowState?: 'BEFORE' | 'OPEN' | 'CLOSED' | 'NONE';
  /** Time until the launch window opens (BEFORE) or closes (OPEN; shrinks during holds), `HH:MM:SS`. */
  windowRemaining: ValueVM;
}

export type Rate = 0 | 1 | 10 | 100;

/** Machine reason of a rate cap (`lockReason` is its display text). */
export type TimeLockCode = 'TERMINAL_COUNT' | 'FLIGHT' | 'RECOVERY_SETTLE' | 'HOLD' | 'PHASE_CAP';

/** Why the requested rate was dropped to 1× (GDD §6 drop triggers, 7.2). */
export type TimeDropCode = 'DECISION_OPEN' | 'NO_GO' | 'GO_POSSIBLE';

/** Why SKIP TO NEXT MILESTONE is disabled (7.2). */
export type SkipBlockCode = 'RUN_ENDED' | 'FORCED_1X' | 'DECISION_OPEN' | 'NO_MILESTONE';

/** Skip-to-next-milestone state (DESIGN_SYSTEM §6.25). Start / cancel: `session.skipToNextMilestone()` / `cancelSkip()`. */
export interface SkipVM {
  enabled: boolean;
  /** Button label target, e.g. `T−01:20:00 LOAD POLL`, `DEBRIEF`; null when nothing is scheduled. */
  target: string | null;
  /** Display reason when disabled (`DECISION OPEN`, `1× LOCKED`, `RUN ENDED`, `NO MILESTONE SCHEDULED`). */
  reason: string | null;
  /** A skip is running (the control is inert until arrival or a drop interrupts it). */
  active: boolean;
  reasonCode?: SkipBlockCode | null;
  /** Target T-clock, s (null for DEBRIEF / none). */
  targetTClockS?: number | null;
  /** Target name only, e.g. `LOAD POLL`, `ROAD CLOSURE`, `DEBRIEF`. */
  targetName?: string | null;
}

/** Last one-shot drop of the requested rate to 1× (cleared by the next player rate request / skip / new run). */
export interface TimeDropVM {
  code: TimeDropCode;
  /** Chip text: `1× · DECISION OPEN`, `1× · NO-GO`, `1× · GO POSSIBLE`. */
  label: string;
  /** Sim tick that fired it. */
  tick: number;
}

export interface TimeScaleVM {
  /** Last rate the player asked for (0 = paused). */
  requested: Rate;
  /** Rate `resume` restores (last non-zero request). */
  resumeRate?: Exclude<Rate, 0>;
  /** Rate actually applied (capped by maxAllowed; 0 when paused). */
  effective: Rate;
  maxAllowed: Rate;
  paused: boolean;
  /** maxAllowed is 1 (forced 1× window). */
  forced1x?: boolean;
  /** Measured sim-seconds per wall-second below `effective` (the loop dropped backlog; §6.25 lagging). */
  lagging: boolean;
  /** Readout, e.g. `10×`, `7.4×`. */
  effectiveRate: string;
  /** Why the cap applies (`TERMINAL COUNT`, `HOLD`, `PROPELLANT LOAD`), null when uncapped. */
  lockReason: string | null;
  lockCode?: TimeLockCode | null;
  /** Chip text: `1× LOCKED · TERMINAL COUNT`, `MAX 10× · PROPELLANT LOAD`, '' when uncapped. */
  lockLabel?: string;
  /** Top-bar readout: `SIM 10×`, `SIM PAUSED`, `SIM 7.4× OF 100×`. */
  readout?: string;
  /** Skip to next milestone (7.2). */
  skip: SkipVM;
  /** Last drop to 1× (GDD §6), null when none since the player's last rate request. */
  drop?: TimeDropVM | null;
  /**
   * Debrief: the run is over — every rate segment and SKIP disabled with reason `RUN ENDED` (`lockReason` /
   * `lockLabel` carry the same text; `maxAllowed` = 0, `paused` = true).
   */
  runEnded?: boolean;
}

// --- Range, stations, alerts ------------------------------------------------------------------------

export type StationId = 'WEATHER' | 'RANGE' | 'PROPELLANT' | 'VEHICLE' | 'PAD_CREW';
export type StationStatus = 'GO' | 'MARGINAL' | 'NO_GO' | 'PENDING';

export interface StationVM {
  id: StationId;
  /** `WX`, `RNG`, `PRP`, `VEH`, `CRW`. */
  code: string;
  label: string;
  status: StationStatus;
  state: Severity;
  glyph?: GlyphId;
  /** Driver label, e.g. `UPPER WIND`, `INTRUDER IN AREA`, `NOMINAL`. */
  driver: string;
  driverCode?: StationDriver;
  /** Driving value in its display unit (wind M/S, reserve H, health, shift H, distance KM, intercept ETA). */
  value: ValueVM;
  limit?: ValueVM;
  /** Compact DRIVER column (§6.24): `GND 8.1 M/S`, `UNK-01 IN AREA BRAVO · INTERCEPT 00:03:20`, `LOX 0.60 H RESERVE`. */
  detail?: string;
  /** Entity behind the reading (select on click). */
  sourceId: string | null;
  sourceCode?: string | null;
}

export interface WeatherVM {
  groundWind: ValueVM;
  groundGust: ValueVM;
  towerWind: ValueVM;
  upperWind: ValueVM;
  /** Wind FROM bearing, `210` `°`. */
  windFrom: ValueVM;
  /** Peak forecast upper wind until the window closes (pre-liftoff). */
  upperForecastPeak: ValueVM;
  groundLimit: ValueVM;
  upperLimit: ValueVM;
  /** Weather margin trend: 1 − worst(value / limit), −1…1 (0 = at a limit), 1 Hz sim time. */
  marginSeries: (number | null)[];
}

export interface RangeVM {
  aggregate: 'GO' | 'MARGINAL' | 'NO_GO' | 'NONE';
  state: Severity;
  glyph?: GlyphId;
  /** Badge text: `RANGE GO`, `RANGE MARGINAL`, `RANGE NO-GO`, `RANGE —`. */
  label?: string;
  /** Worst station's reason, e.g. `RANGE · UNK-01 IN AREA BRAVO`; null when all GO. */
  reason: string | null;
  goCount: number;
  total?: number;
  stations: StationVM[];
  weather?: WeatherVM;
}

/** Event-log line, toast or alert (DESIGN_SYSTEM §6.23). */
export interface EventVM {
  /** Unique per session (log: monotonic counter; alert: condition id such as `station:WEATHER`). */
  id: string;
  /** Sim time `HH:MM:SS` (UTC). */
  time: string;
  /** T-clock at the event when the event carries it exactly (holds, recycle), else ''. */
  tClock?: string;
  tick?: number;
  /** SimEvent type (log) or alert kind. */
  code?: string;
  state: Severity;
  glyph?: GlyphId;
  entityId: string | null;
  entityCode: string | null;
  message: string;
  acked: boolean;
}

export interface AlertsVM {
  open: number;
  /** Not acknowledged yet. */
  fresh: number;
  /** neutral (none) / warn / danger. */
  state: Severity;
  /** `0 ALERTS`, `1 ALERT`, `3 ALERTS · 2 NEW`. */
  label?: string;
  /** Condition-based: an alert lives while its condition holds; ack = `view.ackAlert(id)`. */
  items: EventVM[];
}

// --- Cards ------------------------------------------------------------------------------------------

export interface MetricVM {
  key: string;
  label: string;
  value: ValueVM;
  state: Severity;
  /** Sparkline samples (oldest first, 1 Hz sim time, ≤ 120), any unit; null samples are gaps. */
  series?: (number | null)[];
  /** Optional reference line on the sparkline (same unit as series). */
  threshold?: number;
  seriesLabel?: string;
}

export interface SegmentsVM {
  value: number;
  max: number;
  /** Index of the in-work segment (accent), if any. */
  current?: number;
  label: string;
  /** Per-segment state (stations: one per station in order), when segments differ. */
  states?: Severity[];
}

export interface FlightCardVM {
  countdownId?: string;
  boosterId?: string;
  shipId?: string;
  /** `LC-1 FLIGHT 7`. */
  title: string;
  /** `NEXT LAUNCH` / `FLOWN` / `SCRUBBED` tile with the T-clock. */
  nextLaunch: MetricVM;
  /** `B-09 / S-21`. */
  vehicles: string;
  /** Vehicle loaded % + sparkline. */
  propellant: MetricVM;
  /** Farm reserve tick on the propellant sparkline: reserve ÷ the 1 hold-hour MARGINAL limit, 0–1; null post-liftoff. */
  farmReserve: number | null;
  /** Farm reserve after load + topping, binding fluid (hold time it covers), `0.60` `H`. */
  farmReserveTime?: ValueVM;
  farmReserveFluid?: 'LOX' | 'CH4' | null;
  /** `STATIONS GO 4 OF 5`. */
  stations: MetricVM & { segments: SegmentsVM };
  /** Range aggregate + weather-margin sparkline. */
  range: MetricVM;
  contract?: { id: string; customer: string; status: string; state: Severity };
}

export interface ConsequenceVM {
  label: string;
  value: ValueVM;
  state: Severity;
}

export interface ActionVM {
  id: string;
  label: string;
  key?: string;
  enabled: boolean;
  /** Display reason when disabled (`ROAD CLOSED`); `reasonCode` is the i18n key. */
  reason?: string;
  reasonCode?: string;
  variant: 'primary' | 'secondary' | 'danger';
  /** Present → confirm dialog with these consequences before the command is sent. */
  confirm?: ConsequenceVM[];
  /** Exact sim command: `commands.send(action.command)` when enabled (null = UI-only action). */
  command?: Command | null;
}

export interface ProgressVM {
  label: string;
  value: ValueVM;
  /** 0–1. */
  fraction: number;
  /** `hazard` = abort/deadline countdown (accent fill). */
  tone: 'ink' | 'hazard';
}

export interface InspectorVM {
  id: string;
  callSign: string;
  /** Entity kind (`booster`, `boat`, …). */
  kind?: string;
  /** `BOOSTER`, `PICKET`, `RECOVERY VESSEL`, … */
  classLabel: string;
  /** Lore class (`BULWARK`) or ''. */
  className?: string;
  /** `BOOSTER · LC-1 FLIGHT 7 · 4 FLIGHTS`. */
  sub: string;
  status: { code?: string; glyph: GlyphId; label: string; meta: string | null; state: Severity };
  selected?: boolean;
  following: boolean;
  metrics: MetricVM[];
  progress: ProgressVM | null;
  chart: { label: string; series: (number | null)[]; unit: string } | null;
  actions: ActionVM[];
  lost: boolean;
}

// --- Lists ------------------------------------------------------------------------------------------

export interface ListRowVM {
  id: string;
  /** Entity kind or row kind (`task`). */
  kind?: string;
  glyph: GlyphId;
  /** Call-sign / task name. */
  name: string;
  /** Second line: `BOOSTER · STACKED`. */
  sub: string;
  /** Status word (`STACKED`, `WIND HOLD`). */
  status?: string;
  keyValue: ValueVM;
  state: Severity;
  selected: boolean;
  following: boolean;
}

export interface TankRowVM extends ListRowVM {
  fluid?: 'LOX' | 'CH4' | 'LN2';
  /** 0–1. */
  fill: number;
  /** Reserve needed for the planned load, 0–1 (tick on the bar); null when unknown. */
  reserve: number | null;
  /** Boil-off as a fill rate, `−0.0083` `%/H`. */
  rate: ValueVM;
  mass?: ValueVM;
}

export interface TaskRowVM extends ListRowVM {
  /** 0–1 or null when not started. */
  progress: number | null;
  /** Gate / completion T-clock or `—`. */
  eta: ValueVM;
  /** Entity doing the work (CR-77, SP-41, TOWER-1, LX-01) or null. */
  assigneeId?: string | null;
  actions: ActionVM[];
}

export interface ListsVM {
  vehicles: ListRowVM[];
  tanks: TankRowVM[];
  tasks: TaskRowVM[];
  /** Range tab: one row per station (GDD §4.5) … */
  range: StationVM[];
  /** … plus the boats and weather stations behind them. */
  rangeAssets?: ListRowVM[];
  /** Newest first, ≤ 200. */
  events: EventVM[];
  /** Warn / danger counts for the tab badges. */
  badges?: Record<'vehicles' | 'tanks' | 'tasks' | 'range' | 'events', { warn: number; danger: number }>;
}

// --- Countdown --------------------------------------------------------------------------------------

export interface PhaseVM {
  id: PhaseId;
  label: string;
  short: string;
  state: 'done' | 'current' | 'pending' | 'held' | 'skipped';
  glyph?: GlyphId;
  /** Planned duration share of the bar, 0–1. */
  share: number;
  /** Progress inside the current phase, 0–1 (planned times). */
  progress: number;
  /** Planned T-offsets, s. */
  startS?: number;
  endS?: number;
}

export interface PollMarkVM {
  id: PollId;
  /** `T−01:20:00`. */
  at: string;
  /** Position on the bar, 0–1. */
  position: number;
  label: string;
  state: 'passed' | 'open' | 'pending';
}

export interface CountdownVM {
  countdownId?: string;
  /** `LC-1 · B-09 / S-21`. */
  title: string;
  tClock: string;
  tClockS?: number;
  state: Severity;
  phases: PhaseVM[];
  /** Playhead position on the bar, 0–1. */
  playhead?: number;
  polls?: PollMarkVM[];
  /** Window markers as fractions of the bar (where the window would open / close if the count resumed now). */
  windowOpen: number | null;
  windowClose: number | null;
  holding?: boolean;
  scrubbed?: boolean;
  /** GO / HOLD / RECYCLE / SCRUB (the decision strip carries the same commands while a hold is open). */
  actions?: ActionVM[];
}

// --- Decisions (DESIGN_SYSTEM §6.28) ----------------------------------------------------------------

export type DecisionKind = 'PROP_MARGIN' | 'POLL' | 'CATCH' | 'LEAK';

export interface DecisionOptionVM {
  id: string;
  label: string;
  key: string;
  variant: 'primary' | 'secondary' | 'danger';
  enabled: boolean;
  reason?: string;
  reasonCode?: string;
  consequences: ConsequenceVM[];
  /** Expected value of the branch in cr (D3 always). */
  ev?: ValueVM;
  /** The auto policy picks this option at the deadline. */
  auto: boolean;
  /** Irreversible: open the confirm dialog first. */
  confirm: boolean;
  /** Exact sim command to send. */
  command?: Command;
}

export interface DeadlineVM {
  label: string;
  /** Target clock, e.g. `T+00:06:20` or `14:45:00 UTC`. */
  at: string;
  /** Absolute sim tick of the deadline. */
  tick?: number;
  remaining: ValueVM;
  /** Remaining share of the decision span, 0–1. */
  fraction: number;
  /** Optional marker (standard cut-off, point of no return), 0–1. */
  marker?: number;
  /** The deadline clock is frozen (T-clock deadline during a hold). */
  held: boolean;
  state: Severity;
}

interface DecisionBase {
  id: string;
  kind: DecisionKind;
  countdownId?: string;
  /** `D1 PROPELLANT MARGIN`, `D2 GO / NO-GO · T−00:10:00 TERMINAL POLL`, … */
  title: string;
  question: string;
  /** `AUTO AT DEADLINE: DIVERT (P < 0.70)`; '' when no auto action. */
  autoNote: string;
  deadline: DeadlineVM;
  options: DecisionOptionVM[];
  state: Severity;
  /** Forces 1× while open (D2, D3, D3b; rule applied by 7.2); D1 is advisory. */
  blocking: boolean;
  /** Other decisions waiting behind this one. */
  queued: number;
  /** Command sent, awaiting projection confirmation (UI-local; the projector always emits null). */
  pending: string | null;
}

export interface PropMarginDecisionVM extends DecisionBase {
  kind: 'PROP_MARGIN';
  reserves: MetricVM[];
  orders: { label: string; eta: ValueVM }[];
  /** Fleet trucks busy with an order (LX + MX). */
  fleet: SegmentsVM;
}

export interface PollDecisionVM extends DecisionBase {
  kind: 'POLL';
  pollLabel: string;
  poll?: PollId | null;
  holdReason?: HoldReason;
  /** Why GO is impossible now (display) / code; null when GO is possible. */
  blocker?: string | null;
  blockerCode?: string | null;
  stations: StationVM[];
  /** `1 MARGINAL · 1 NO-GO · 3 OF 5 GO`. */
  result?: string;
  riskNote: string | null;
}

export interface CatchDriverVM {
  key?: 'ENGINES_OUT' | 'TOWER_WIND' | 'LANDING_PROP';
  label: string;
  value: ValueVM;
  /** Contribution to the lateral error, e.g. `σ +1.0 M`. */
  effect: string;
  state: Severity;
}

export interface CatchDecisionVM extends DecisionBase {
  kind: 'CATCH';
  boosterId?: string;
  p: ValueVM;
  band: 'CLEAR' | 'LEAN' | 'CONTESTED' | 'AGAINST';
  /** Expected-value break-even p (catch better above). */
  breakEven: number;
  sigma?: ValueVM;
  drivers: CatchDriverVM[];
  /** EV of each branch (cr, relative to a flawless catch) and the better one. */
  ev?: { catch: ValueVM; divert: ValueVM; favours: RecoveryMode };
  autoChoice?: RecoveryMode;
  forcedDivert?: string | null;
  committed?: { mode: RecoveryMode; by: 'PLAYER' | 'AUTO' | 'FORCED' } | null;
}

export interface LeakDecisionVM extends DecisionBase {
  kind: 'LEAK';
  loadEta: { label: string; at: ValueVM; state: Severity }[];
}

export type DecisionVM = PropMarginDecisionVM | PollDecisionVM | CatchDecisionVM | LeakDecisionVM;

// --- Debrief (DESIGN_SYSTEM §6.29) ------------------------------------------------------------------

export type DebriefOutcome = 'CAUGHT' | 'DIVERTED' | 'CATCH_FAILED' | 'SCRUBBED';

export interface DebriefVM {
  countdownId?: string;
  title: string;
  stamp: string;
  outcome: DebriefOutcome;
  outcomeLabel: string;
  state: Severity;
  facts: { label: string; value: string }[];
  money: { delta: ValueVM; from: ValueVM; to: ValueVM };
  reputation: { delta: ValueVM; from: ValueVM; to: ValueVM };
  booster: {
    callSign: string;
    state: string;
    flights: string;
    wear: SegmentsVM & { text: string };
  };
  tower: { label: string; state: Severity };
  turnaround: ValueVM;
  ledger: { label: string; amount: ValueVM; reputation: ValueVM | null }[];
  decisions: { time: string; id: string; detail: string; by: 'PLAYER' | 'AUTO' | 'FORCED' }[];
  anomalies: { id: string; label: string; time: string }[];
  actions: ActionVM[];
}

// --- World labels, sites, economy, view ---------------------------------------------------------------

export interface LabelVM {
  id: string;
  callSign: string;
  kind?: string;
  glyph: GlyphId;
  state: Severity;
  selected: boolean;
  following?: boolean;
  /** Declutter priority, higher first: selected 5 > alert 4 > followed 3 > flying 2 > rest 1 > tanks/vans 0. */
  priority?: number;
}

export interface SiteVM {
  id: string;
  code: string;
  name?: string;
  /** `ORBITAL PAD`, `BUILD YARD`. */
  kind: string;
  /** `ACTIVE`, `UNDER CONSTRUCTION`. */
  status: string;
  state: Severity;
  glyph?: GlyphId;
  /** Playable (MVP: LC-1 only); others render disabled. */
  interactive?: boolean;
  current: boolean;
  alertCount: number;
}

export interface EconomyVM {
  money: ValueVM;
  reputation: ValueVM;
}

export type HudTab = 'vehicles' | 'tanks' | 'tasks' | 'range' | 'events';

/** View state the projection was made for (echo of viewStore + call-signs for e2e). */
export interface ProjectedViewVM {
  siteId: string;
  selectedId: string | null;
  followId: string | null;
  selected: string | null;
  follow: string | null;
  tab: HudTab;
}

/** Root of the throttled projection (ARCHITECTURE §8). */
export interface UiProjection {
  /** Shape version of this contract. */
  version?: 1;
  /** Projection counter (monotonic per session; 0 = empty projection before the first run). */
  seq?: number;
  tick?: number;
  simTimeS?: number;
  clock: ClockVM;
  timeScale: TimeScaleVM;
  economy?: EconomyVM;
  range: RangeVM;
  alerts: AlertsVM;
  flightCard: FlightCardVM | null;
  countdown: CountdownVM | null;
  inspector: InspectorVM | null;
  lists: ListsVM;
  decision: DecisionVM | null;
  debrief: DebriefVM | null;
  labels: LabelVM[];
  sites: SiteVM[];
  view?: ProjectedViewVM;
}
