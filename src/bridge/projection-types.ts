// UiProjection (ARCHITECTURE §8, ADR 0004): the display-ready, throttled view of the sim the HUD renders verbatim.
// Source of truth for the HUD view models: src/ui imports these types (directly or via src/ui/types.ts), the app's
// projector (src/app/projection) produces them. Plain JSON data only (no functions, Maps or class instances), so a
// fixture is a literal and a worker host could post it.
//
// Conventions
// - Every display number is a `DisplayValue`: `text` already rounded to the field's fixed decimals, true minus `−`,
//   thousands grouped with a narrow no-break space; `unit` is the uppercase micro-type unit (render after a thin
//   space); `si` is the machine value in SI (or the stated unit) for `<data value>`; `text` is `—` when `si` is null.
// - Strings are uppercase display strings unless the field is a code (`…Code`, ids, enums), which the UI may map.
// - Rows keep object identity between projections while unchanged (structural sharing): select narrowly and
//   compare with `shallow` / `Object.is`.
import type {
  Command,
  DebriefOutcome,
  DecisionBy,
  GoStatus,
  HoldReason,
  Id,
  Kind,
  Phase,
  PollId,
  RecoveryMode,
  SiteId,
  Station,
  StationDriver,
} from '@sim/types';

/** DESIGN_SYSTEM §2.3 semantic states (no extra hues). */
export type Severity = 'neutral' | 'info' | 'ok' | 'active' | 'warn' | 'danger' | 'disabled';

/** DESIGN_SYSTEM §7 glyph ids (SVG symbol `g-<id>`). */
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
  | 'selected';

/** A formatted number: `text` + `unit` for display, `si` for `<data value>` (null = missing, `text` = `—`). */
export interface DisplayValue {
  text: string;
  unit: string;
  si: number | null;
}

/** Glyph + uppercase word + semantic state (status chips, list rows, labels). */
export interface StatusVM {
  /** Machine state (FSM state, GoStatus, …). */
  code: string;
  label: string;
  glyph: GlyphId;
  severity: Severity;
}

/** A button the UI renders; `command` is sent verbatim with `commands.send()` when enabled. */
export interface ActionVM {
  id: string;
  label: string;
  enabled: boolean;
  /** UPPER_SNAKE reason code when disabled (i18n key), e.g. `ROAD_CLOSED`. */
  disabledReason: string | null;
  /** Irreversible / costly: confirm dialog (DESIGN_SYSTEM §6.27) with `consequences`. */
  danger: boolean;
  /** Keyboard hint (`H`, `⏎`), display only. */
  key: string | null;
  consequences: string[];
  command: Command | null;
}

/** 120 samples at 1 Hz **sim** time, oldest first (ADR 0004). `values` keep identity until a new sample lands. */
export interface SparkVM {
  /** SI / stated unit; `null` = no data at that sample (draw a gap). */
  values: (number | null)[];
  unit: string;
  /** Fixed axis for drawing (no auto-scale jitter). */
  min: number;
  max: number;
  /** Threshold tick (e.g. a limit), or null. */
  threshold: number | null;
}

// --- Clock & time ----------------------------------------------------------------------------------

export interface ClockVM {
  /** Sim time of day, `HH:MM:SS` (UTC). */
  utc: string;
  /** Sim UTC seconds since 00:00 of day 0 (machine). */
  utcS: number;
  /** `T−00:00:04` / `T+00:01:45` (true minus); `—` without a countdown. Above 99 h: `T−4D 06:12`. */
  tClock: string;
  /** T-clock, s (negative before T-0); null without a countdown. */
  tClockS: number | null;
  phase: Phase | null;
  phaseLabel: string;
  holding: boolean;
  holdReason: HoldReason | null;
  /** `HOLD · POLL` etc.; '' when counting. */
  holdLabel: string;
  /** Launch window in sim UTC (`HH:MM:SS`) + state; empty strings without a countdown. */
  windowOpenUtc: string;
  windowCloseUtc: string;
  windowState: 'BEFORE' | 'OPEN' | 'CLOSED' | 'NONE';
  /** Until the window opens (BEFORE) or closes (OPEN), `H:MM:SS`-style duration. */
  windowRemaining: DisplayValue;
}

export type TimeScaleValue = 0 | 1 | 10 | 100;

/** Why the allowed rate is below 100× (DESIGN_SYSTEM §6.25 reason chip). */
export type TimeLockReason = 'TERMINAL_COUNT' | 'FLIGHT' | 'RECOVERY_SETTLE' | 'HOLD' | 'PHASE_CAP';

export interface TimeScaleVM {
  /** Last non-zero rate the player asked for. */
  requested: Exclude<TimeScaleValue, 0>;
  /** What runs now (0 when paused). */
  effective: TimeScaleValue;
  maxAllowed: TimeScaleValue;
  paused: boolean;
  /** maxAllowed is 1 (forced 1× window). */
  forced1x: boolean;
  lockReason: TimeLockReason | null;
  /** `1× LOCKED · TERMINAL COUNT`, `MAX 10× · PROPELLANT LOAD`, '' when uncapped. */
  lockLabel: string;
  /** The loop dropped backlog (step / ms cap). */
  lagging: boolean;
  /** Measured sim s per wall s (`SIM 7.4×`). */
  effectiveRate: DisplayValue;
  /** Top-bar readout: `SIM 10×`, `SIM PAUSED`, `SIM 7.4× OF 100×`. */
  readout: string;
  /** Skip to next milestone (task 7.2): target is shown, enabled once implemented. */
  skip: { enabled: boolean; target: string; reason: string | null };
}

// --- Range / stations --------------------------------------------------------------------------------

export interface StationVM {
  id: Station;
  /** `WX`, `RNG`, `PRP`, `VEH`, `CRW`. */
  code: string;
  label: string;
  status: GoStatus;
  state: StatusVM;
  driver: StationDriver;
  /** `UPPER WIND`, `FARM RESERVE LOX`, … ('NOMINAL' shows the reference value's label). */
  driverLabel: string;
  value: DisplayValue;
  limit: DisplayValue;
  /** Compact `DRIVER` column text: `UPPER 45.2 M/S`, `UNK-01 IN AREA`, `LOX 0.6 HOLD-H`. */
  detail: string;
  /** Entity the reading comes from (click selects it), or null. */
  sourceId: Id | null;
  sourceCallSign: string | null;
}

export interface RangeVM {
  /** Aggregate of the five stations; null without a pre-liftoff countdown reading. */
  status: GoStatus | null;
  /** `RANGE GO` / `RANGE MARGINAL` / `RANGE NO-GO` / `RANGE —`. */
  label: string;
  state: StatusVM;
  /** Tooltip reason, e.g. `UNK-01 IN AREA BRAVO`; '' when GO. */
  reason: string;
  goCount: number;
  total: number;
  stations: StationVM[];
  weather: WeatherVM;
}

export interface WeatherVM {
  groundWind: DisplayValue;
  groundGust: DisplayValue;
  towerWind: DisplayValue;
  upperWind: DisplayValue;
  /** Wind FROM bearing, degrees `210°` (null until the sim exposes it). */
  windFrom: DisplayValue;
  /** Peak forecast upper wind until the window closes. */
  upperForecastPeak: DisplayValue;
  groundLimit: DisplayValue;
  upperLimit: DisplayValue;
  /** Weather margin trend (1 − worst value/limit), unitless 0–1. */
  marginSpark: SparkVM;
}

// --- Alerts & events -----------------------------------------------------------------------------------

export interface AlertVM {
  /** Stable while the condition lasts (`station:WEATHER`, `hold`, `leak`, `engines:<id>`, `intruder:<id>`). */
  id: string;
  severity: 'warn' | 'danger';
  glyph: GlyphId;
  text: string;
  entityId: Id | null;
  callSign: string | null;
  /** Sim tick the condition was first seen by the projector. */
  sinceTick: number;
  acked: boolean;
}

export interface AlertsVM {
  open: number;
  unacked: number;
  maxSeverity: 'none' | 'warn' | 'danger';
  /** `0 ALERTS`, `1 ALERT`, `3 ALERTS · 2 NEW`. */
  label: string;
  items: AlertVM[];
}

export interface EventRowVM {
  /** Unique, monotonic per session. */
  key: number;
  tick: number;
  /** Sim UTC `HH:MM:SS`. */
  utc: string;
  /** T-clock at the event when known exactly (holds, polls), else ''. */
  tClock: string;
  /** SimEvent type. */
  code: string;
  severity: Severity;
  glyph: GlyphId;
  entityId: Id | null;
  callSign: string;
  text: string;
}

// --- Flight card & countdown -----------------------------------------------------------------------------

export interface FlightCardVM {
  countdownId: Id;
  /** `LC-1 FLIGHT 7`. */
  title: string;
  /** `B-09 / S-21`. */
  vehicles: string;
  boosterId: Id;
  shipId: Id;
  tClock: string;
  /** `NEXT LAUNCH` / `FLOWN` / `SCRUBBED`. */
  tClockLabel: string;
  propLoaded: DisplayValue;
  propSpark: SparkVM;
  /** Farm reserve after load + topping, the binding fluid (hold time it covers). */
  farmReserve: DisplayValue;
  farmReserveFluid: 'LOX' | 'CH4' | null;
  stationsGo: number;
  stationsTotal: number;
  /** `STATIONS GO 4 OF 5`. */
  stationsLabel: string;
  /** One per station, in STATION order. */
  stationSegments: Severity[];
  range: StatusVM;
  rangeSpark: SparkVM;
  contract: { id: string; customer: string; status: string; state: StatusVM };
}

export type TimelineSegmentState = 'done' | 'current' | 'pending' | 'held' | 'skipped';

export interface TimelinePhaseVM {
  id: Phase;
  label: string;
  state: TimelineSegmentState;
  glyph: GlyphId;
  /** Planned T-offsets, s (segment width ∝ end − start). */
  startS: number;
  endS: number;
}

export interface TimelinePollVM {
  id: PollId;
  /** `T−01:20:00`. */
  at: string;
  atS: number;
  label: string;
  state: 'passed' | 'open' | 'pending';
}

export interface CountdownVM {
  countdownId: Id;
  /** `LC-1 · B-09 / S-21`. */
  context: string;
  tClock: string;
  tClockS: number;
  phases: TimelinePhaseVM[];
  polls: TimelinePollVM[];
  /** Window markers as T-clock offsets if counting resumed now, s. */
  windowOpenS: number;
  windowCloseS: number;
  holding: boolean;
  scrubbed: boolean;
  /** HOLD / GO / RECYCLE / SCRUB for the timeline header (the decision strip carries the same commands). */
  actions: ActionVM[];
}

// --- Decisions (GDD §13.2 D1–D3b; DESIGN_SYSTEM decision strip) --------------------------------------------

export interface DeadlineVM {
  tick: number;
  /** Deadline as a clock string (`T+00:06:20` or UTC `HH:MM:SS`). */
  at: string;
  remaining: DisplayValue;
  /** remaining / total window of the prompt (0–1), for the deadline bar. */
  fraction: number;
}

export interface DecisionBase {
  id: string;
  countdownId: Id;
  /** `GO / NO-GO · T−00:10:00 TERMINAL POLL`. */
  title: string;
  question: string;
  deadline: DeadlineVM | null;
  options: ActionVM[];
}

/** D1: propellant margin (order deliveries before the road closes). */
export interface PropellantDecisionVM extends DecisionBase {
  kind: 'PROPELLANT';
  reserve: { lox: DisplayValue; ch4: DisplayValue; binding: 'LOX' | 'CH4' };
  limit: DisplayValue;
  pendingOrders: number;
}

/** D2: Go / No-Go during a hold (poll, NO-GO, manual, load incomplete, leak fix). */
export interface PollDecisionVM extends DecisionBase {
  kind: 'POLL';
  poll: PollId | null;
  holdReason: HoldReason;
  /** Why GO is not possible now (UPPER_SNAKE), or null. */
  blocker: string | null;
  blockerLabel: string;
  stations: StationVM[];
  /** `1 MARGINAL · 1 NO-GO · 3 OF 5 GO`. */
  result: string;
}

export interface CatchDriverVM {
  key: 'ENGINES_OUT' | 'TOWER_WIND' | 'LANDING_PROP' | 'SIGMA';
  label: string;
  value: DisplayValue;
  /** Driver is pushing p down. */
  adverse: boolean;
}

/** D3: catch or divert. EV in cr, relative to a flawless catch (same model as the autopilot break-even). */
export interface CatchDecisionVM extends DecisionBase {
  kind: 'CATCH';
  boosterId: Id;
  boosterCallSign: string;
  p: DisplayValue;
  band: 'CLEAR' | 'LEAN' | 'CONTESTED' | 'AGAINST';
  drivers: CatchDriverVM[];
  ev: { catchCr: DisplayValue; divertCr: DisplayValue; breakEvenP: DisplayValue; favours: RecoveryMode };
  /** Flight computer choice at the deadline without input. */
  autoPolicy: { threshold: DisplayValue; choice: RecoveryMode };
  forcedDivert: string | null;
  committed: { mode: RecoveryMode; by: DecisionBy } | null;
}

/** D3b: GSE leak response (A3). */
export interface LeakDecisionVM extends DecisionBase {
  kind: 'LEAK';
  loadRateFactor: DisplayValue;
}

export type DecisionVM = PropellantDecisionVM | PollDecisionVM | CatchDecisionVM | LeakDecisionVM;

// --- Inspector -------------------------------------------------------------------------------------------

export interface MetricVM {
  /** Stable per kind (`altitude`, `velocity`, `prop`, `engines`, `arms`, …). */
  key: string;
  label: string;
  value: DisplayValue;
  severity: Severity;
}

export interface InspectorVM {
  id: Id;
  callSign: string;
  kind: Kind;
  /** `BOOSTER`, `PICKET`, … */
  kindLabel: string;
  /** Lore class (`BULWARK`) or ''. */
  className: string;
  /** `BOOSTER · LC-1 FLIGHT 7 · 4 FLIGHTS`. */
  sub: string;
  status: StatusVM;
  selected: boolean;
  following: boolean;
  metrics: MetricVM[];
  progress: { label: string; value: DisplayValue; fraction: number } | null;
  chart: { label: string; spark: SparkVM } | null;
  actions: ActionVM[];
}

// --- Lists -----------------------------------------------------------------------------------------------

export interface ListRowVM {
  id: Id;
  callSign: string;
  kind: Kind;
  kindLabel: string;
  status: StatusVM;
  /** Second line (`TERMINAL COUNT`, route, task). */
  sub: string;
  /** Right-aligned key value (`47 KM/H`, `100.0 % PROP`). */
  key: DisplayValue;
  keyLabel: string;
  selected: boolean;
  followed: boolean;
}

export interface TankRowVM {
  id: Id;
  callSign: string;
  fluid: 'LOX' | 'CH4' | 'LN2';
  fluidLabel: string;
  fill: DisplayValue;
  fraction: number;
  mass: DisplayValue;
  /** Boil-off as a fill rate, `−0.40 %/H`. */
  boilOff: DisplayValue;
  severity: Severity;
  selected: boolean;
}

export interface TaskRowVM {
  id: string;
  label: string;
  /** Assignee call-sign or ''. */
  assignee: string;
  assigneeId: Id | null;
  state: StatusVM;
  progress: DisplayValue;
  fraction: number;
  /** `T−05:30:00` style ETA or ''. */
  eta: string;
  actions: ActionVM[];
}

export interface ListsVM {
  vehicles: ListRowVM[];
  tanks: TankRowVM[];
  tasks: TaskRowVM[];
  range: ListRowVM[];
  events: EventRowVM[];
  /** Warn/danger counts for the tab badges. */
  badges: Record<'vehicles' | 'tanks' | 'tasks' | 'range' | 'events', { warn: number; danger: number }>;
}

// --- Labels, sites, economy, debrief -----------------------------------------------------------------------

export interface LabelVM {
  id: Id;
  callSign: string;
  kind: Kind;
  glyph: GlyphId;
  severity: Severity;
  selected: boolean;
  followed: boolean;
  /** Declutter priority, higher first (selected > alert > followed > flying > rest). */
  priority: number;
}

export interface SiteVM {
  id: SiteId;
  code: string;
  name: string;
  role: string;
  status: StatusVM;
  /** Playable (MVP: LC-1 only); others render disabled. */
  interactive: boolean;
  current: boolean;
  alertCount: number;
}

export interface DebriefLineVM {
  code: string;
  label: string;
  amount: DisplayValue;
  reputation: DisplayValue;
}

export interface DebriefVM {
  countdownId: Id;
  title: string;
  outcome: DebriefOutcome;
  outcomeLabel: string;
  state: StatusVM;
  contract: { id: string; status: string };
  moneyStart: DisplayValue;
  moneyEnd: DisplayValue;
  moneyDelta: DisplayValue;
  reputationStart: DisplayValue;
  reputationEnd: DisplayValue;
  reputationDelta: DisplayValue;
  holdTime: DisplayValue;
  turnaround: DisplayValue;
  booster: {
    callSign: string;
    state: string;
    enginesOut: number;
    wear: string;
    wearBefore: DisplayValue;
    wearAfter: DisplayValue;
    flights: string;
  };
  tower: string;
  recovery: { mode: string; result: string; p: DisplayValue; roll: DisplayValue; by: string } | null;
  propellant: { deliveredLox: DisplayValue; deliveredCh4: DisplayValue; lostLox: DisplayValue; lostCh4: DisplayValue };
  lines: DebriefLineVM[];
  anomalies: { code: string; label: string; source: string; utc: string }[];
  decisions: { tClock: string; by: DecisionBy; kind: string; detail: string }[];
}

export interface EconomyVM {
  money: DisplayValue;
  reputation: DisplayValue;
}

/** View state echoed into the projection (what was projected for). */
export interface ProjectedViewVM {
  siteId: string;
  selectedId: Id | null;
  followId: Id | null;
  /** Call-signs of the above (e2e convenience). */
  selected: string | null;
  follow: string | null;
  tab: HudTab;
}

export type HudTab = 'vehicles' | 'tanks' | 'tasks' | 'range' | 'events';

export interface UiProjection {
  /** Contract version of this shape. */
  version: 1;
  /** Projection counter (monotonic per session). */
  seq: number;
  tick: number;
  simTimeS: number;
  clock: ClockVM;
  timeScale: TimeScaleVM;
  economy: EconomyVM;
  range: RangeVM;
  alerts: AlertsVM;
  flight: FlightCardVM | null;
  countdown: CountdownVM | null;
  decision: DecisionVM | null;
  inspector: InspectorVM | null;
  lists: ListsVM;
  labels: LabelVM[];
  sites: SiteVM[];
  debrief: DebriefVM | null;
  view: ProjectedViewVM;
}
