// HUD view models (DESIGN_SYSTEM §13.1, ARCHITECTURE §8). Components render these verbatim; the projector of
// task 6.1 (src/app/projection) produces them. Formatting (units, rounding, fixed width) happens in the projector,
// the UI never compares thresholds or converts units. If the projector needs a different shape, change it here in
// the same commit. All `value` fields are SI (m, s, kg, m/s, Pa) or unitless fractions; `text` is display-ready.

/** §2.3 semantic states. Computed by the projector. */
export type Severity = 'neutral' | 'info' | 'ok' | 'active' | 'warn' | 'danger' | 'disabled';

/** §7 glyph ids (SVG symbol `g-<id>` in the sprite). */
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

/** A display-ready number (§6.36). `value: null` = missing data → `—` in the same slot. */
export interface ValueVM {
  /** Formatted digits without unit, e.g. `100.0`, `T-00:00:04`, `−40.0`. */
  text: string;
  /** Uppercase display unit, e.g. `%`, `KM/H`, `M CR`. */
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
  /** Sim time of day, `HH:MM:SS`. */
  utc: string;
  /** `T-00:00:04` / `T+00:01:45` (true minus in display). */
  tClock: string;
  missionClock: string | null;
  phase: PhaseId | null;
  phaseLabel: string;
  holding: boolean;
  holdReason: string | null;
  windowOpenAt: string;
  windowCloseAt: string;
  /** Time until the launch window closes (shrinks during holds). */
  windowRemaining: ValueVM;
}

export type Rate = 0 | 1 | 10 | 100;

export interface TimeScaleVM {
  /** Last rate the player asked for (0 = paused). */
  requested: Rate;
  /** Rate actually applied (capped by maxAllowed). */
  effective: Rate;
  maxAllowed: Rate;
  paused: boolean;
  /** Measured sim-seconds per wall-second below 90 % of `effective` (§6.25 lagging). */
  lagging: boolean;
  /** Readout, e.g. `10×`, `7.4×`. */
  effectiveRate: string;
  /** Why the cap applies (`TERMINAL COUNT`, `DECISION OPEN`, `NO-GO`), null when uncapped. */
  lockReason: string | null;
  skip: { enabled: boolean; target: string | null; reason: string | null; active: boolean };
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
  /** Driver label, e.g. `UPPER WIND`, `UNK-01 IN AREA`. */
  driver: string;
  value: ValueVM;
  /** Entity behind the reading (select on click). */
  sourceId: string | null;
}

export interface RangeVM {
  aggregate: 'GO' | 'MARGINAL' | 'NO_GO' | 'NONE';
  state: Severity;
  /** Worst station's reason, e.g. `UNK-01 IN AREA BRAVO`. */
  reason: string | null;
  goCount: number;
  stations: StationVM[];
}

export interface EventVM {
  id: string;
  /** Sim time `HH:MM:SS` or T-clock. */
  time: string;
  state: Severity;
  entityId: string | null;
  entityCode: string | null;
  message: string;
  acked: boolean;
}

export interface AlertsVM {
  open: number;
  fresh: number;
  state: Severity;
  items: EventVM[];
}

// --- Cards ------------------------------------------------------------------------------------------

export interface MetricVM {
  key: string;
  label: string;
  value: ValueVM;
  state: Severity;
  /** Sparkline samples (oldest first), any unit; null samples are gaps. */
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
}

export interface FlightCardVM {
  title: string;
  nextLaunch: MetricVM;
  vehicles: string;
  propellant: MetricVM;
  /** Farm reserve tick on the propellant sparkline, fraction 0–1. */
  farmReserve: number | null;
  stations: MetricVM & { segments: SegmentsVM };
  range: MetricVM;
}

export interface ActionVM {
  id: string;
  label: string;
  key?: string;
  enabled: boolean;
  reason?: string;
  variant: 'primary' | 'secondary' | 'danger';
  /** Present → confirm dialog with these consequences before the command is sent. */
  confirm?: ConsequenceVM[];
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
  classLabel: string;
  sub: string;
  status: { glyph: GlyphId; label: string; meta: string | null; state: Severity };
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
  glyph: GlyphId;
  name: string;
  sub: string;
  keyValue: ValueVM;
  state: Severity;
  selected: boolean;
  following: boolean;
}

export interface TankRowVM extends ListRowVM {
  /** 0–1. */
  fill: number;
  /** Reserve needed for the planned load, 0–1 (tick on the bar). */
  reserve: number | null;
  rate: ValueVM;
}

export interface TaskRowVM extends ListRowVM {
  /** 0–1 or null when not started. */
  progress: number | null;
  eta: ValueVM;
  actions: ActionVM[];
}

export interface ListsVM {
  vehicles: ListRowVM[];
  tanks: TankRowVM[];
  tasks: TaskRowVM[];
  range: StationVM[];
  events: EventVM[];
}

// --- Countdown --------------------------------------------------------------------------------------

export interface PhaseVM {
  id: PhaseId;
  label: string;
  short: string;
  state: 'done' | 'current' | 'pending' | 'held' | 'skipped';
  /** Planned duration share of the bar, 0–1. */
  share: number;
  /** Progress inside the current phase, 0–1. */
  progress: number;
}

export interface CountdownVM {
  title: string;
  tClock: string;
  state: Severity;
  phases: PhaseVM[];
  /** Window markers as fractions of the bar. */
  windowOpen: number | null;
  windowClose: number | null;
}

// --- Decisions (DESIGN_SYSTEM §6.28) ----------------------------------------------------------------

export type DecisionKind = 'PROP_MARGIN' | 'POLL' | 'CATCH' | 'LEAK';

export interface ConsequenceVM {
  label: string;
  value: ValueVM;
  state: Severity;
}

export interface DecisionOptionVM {
  id: string;
  label: string;
  key: string;
  variant: 'primary' | 'secondary' | 'danger';
  enabled: boolean;
  reason?: string;
  consequences: ConsequenceVM[];
  /** Expected value of the branch in cr (D3 always). */
  ev?: ValueVM;
  /** The auto policy picks this option at the deadline. */
  auto: boolean;
  /** Irreversible: open the confirm dialog first. */
  confirm: boolean;
}

export interface DeadlineVM {
  label: string;
  /** Target clock, e.g. `T+00:06:20`. */
  at: string;
  remaining: ValueVM;
  /** Remaining share of the decision span, 0–1. */
  fraction: number;
  /** Optional marker (standard cut-off, point of no return), 0–1. */
  marker?: number;
  held: boolean;
  state: Severity;
}

interface DecisionBase {
  id: string;
  kind: DecisionKind;
  /** `D1 PROPELLANT MARGIN`, `D2 GO / NO-GO`, … */
  title: string;
  question: string;
  /** `AUTO AT DEADLINE: DIVERT (P < 0.65)`. */
  autoNote: string;
  deadline: DeadlineVM;
  options: DecisionOptionVM[];
  state: Severity;
  /** Forces 1× while open (D2, D3, D3b); D1 is advisory. */
  blocking: boolean;
  queued: number;
  /** Command sent, awaiting projection confirmation. */
  pending: string | null;
}

export interface PropMarginDecisionVM extends DecisionBase {
  kind: 'PROP_MARGIN';
  reserves: MetricVM[];
  orders: { label: string; eta: ValueVM }[];
  fleet: SegmentsVM;
}

export interface PollDecisionVM extends DecisionBase {
  kind: 'POLL';
  pollLabel: string;
  stations: StationVM[];
  riskNote: string | null;
}

export interface CatchDriverVM {
  label: string;
  value: ValueVM;
  /** Contribution to the lateral error, e.g. `σ +0.9 M`. */
  effect: string;
  state: Severity;
}

export interface CatchDecisionVM extends DecisionBase {
  kind: 'CATCH';
  p: ValueVM;
  band: 'CLEAR' | 'LEAN' | 'CONTESTED' | 'AGAINST';
  breakEven: number;
  drivers: CatchDriverVM[];
}

export interface LeakDecisionVM extends DecisionBase {
  kind: 'LEAK';
  loadEta: { label: string; at: ValueVM; state: Severity }[];
}

export type DecisionVM = PropMarginDecisionVM | PollDecisionVM | CatchDecisionVM | LeakDecisionVM;

// --- Debrief (DESIGN_SYSTEM §6.29) ------------------------------------------------------------------

export type DebriefOutcome = 'CAUGHT' | 'DIVERTED' | 'CATCH_FAILED' | 'SCRUBBED';

export interface DebriefVM {
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

// --- World labels, sites ----------------------------------------------------------------------------

export interface LabelVM {
  id: string;
  callSign: string;
  glyph: GlyphId;
  state: Severity;
  selected: boolean;
}

export interface SiteVM {
  id: string;
  code: string;
  kind: string;
  status: string;
  state: Severity;
  current: boolean;
  alertCount: number;
}

/** Root of the throttled projection (ARCHITECTURE §8). */
export interface UiProjection {
  clock: ClockVM;
  timeScale: TimeScaleVM;
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
}
