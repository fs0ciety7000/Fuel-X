// Fixture view models (DESIGN_SYSTEM §13.1) for `/design`, unit tests and e2e. Numbers follow the MVP scenario
// (GDD §13, BALANCING) so screenshots read like a real run; they are not sim output.
import { val } from '../components/Value';
import type {
  AlertsVM,
  CatchDecisionVM,
  ClockVM,
  CountdownVM,
  DebriefVM,
  DeadlineVM,
  EventVM,
  FlightCardVM,
  InspectorVM,
  LabelVM,
  LeakDecisionVM,
  ListRowVM,
  MetricVM,
  PollDecisionVM,
  PropMarginDecisionVM,
  RangeVM,
  SiteVM,
  StationVM,
  TankRowVM,
  TaskRowVM,
  TimeScaleVM,
  UiProjection,
} from '../types';

const ramp = (n: number, from: number, to: number, wobble = 0): number[] =>
  Array.from({ length: n }, (_, i) => +(from + ((to - from) * i) / (n - 1) + Math.sin(i * 1.7) * wobble).toFixed(3));

export const clock: ClockVM = {
  utc: '13:41:54',
  tClock: 'T−00:10:00',
  missionClock: null,
  phase: 'TerminalCount',
  phaseLabel: 'TERMINAL COUNT',
  holding: false,
  holdReason: null,
  windowOpenAt: '13:36:54',
  windowCloseAt: '15:06:54',
  windowRemaining: val('01:25:00', 5100, undefined, { width: 8 }),
};

// --- Metrics ----------------------------------------------------------------------------------------

export const metrics = {
  prop: {
    key: 'prop',
    label: 'PROPELLANT LOADED',
    value: val('100.0', 1, '%', { width: 5 }),
    state: 'ok',
    series: ramp(40, 0.2, 1, 0.01),
    threshold: 0.92,
    seriesLabel: 'Propellant loaded, last 40 min, rising',
  },
  propWarn: {
    key: 'prop',
    label: 'FARM RESERVE LOX',
    value: val('0.6', 2160, 'HOLD-H', { width: 4 }),
    state: 'warn',
    series: ramp(40, 1.4, 0.6, 0.02),
    threshold: 1,
    seriesLabel: 'LOX reserve in hold-hours, falling',
  },
  engines: {
    key: 'eng',
    label: 'ENGINES LIT',
    value: val('32 OF 33', 32, undefined, { width: 8 }),
    state: 'danger',
  },
  stale: {
    key: 'tlm',
    label: 'ALTITUDE',
    value: val('8.3', 8300, 'KM', { width: 5, stale: true }),
    state: 'neutral',
    series: ramp(30, 0, 8.3, 0),
  },
  missing: { key: 'vel', label: 'VELOCITY', value: val('', null, 'KM/S'), state: 'neutral' },
  disabled: { key: 'arm', label: 'CATCH ARMS', value: val('N/A', null), state: 'disabled' },
} satisfies Record<string, MetricVM>;

export const flightCard: FlightCardVM = {
  title: 'LC-1 FLIGHT 7',
  nextLaunch: {
    key: 't',
    label: 'NEXT LAUNCH',
    value: val('T−00:10:00', -600, undefined, { width: 10 }),
    state: 'active',
  },
  vehicles: 'B-09 + S-21',
  propellant: metrics.prop,
  farmReserve: 0.92,
  stations: {
    key: 'st',
    label: 'STATIONS GO',
    value: val('4 OF 5', 4),
    state: 'warn',
    segments: { value: 4, max: 5, label: 'Stations go, 4 of 5' },
  },
  range: {
    key: 'rng',
    label: 'RANGE',
    value: val('MARGINAL', null),
    state: 'warn',
    series: ramp(30, 0.4, 0.12, 0.03),
    seriesLabel: 'Weather margin, last 30 min, falling',
  },
};

// --- Stations / range -------------------------------------------------------------------------------

export const stations: StationVM[] = [
  {
    id: 'WEATHER',
    code: 'WX',
    label: 'WEATHER',
    status: 'GO',
    state: 'ok',
    driver: 'GROUND WIND',
    value: val('8.1', 8.1, 'M/S'),
    sourceId: 'WX-1',
  },
  {
    id: 'RANGE',
    code: 'RNG',
    label: 'RANGE',
    status: 'NO_GO',
    state: 'danger',
    driver: 'UNK-01 IN AREA',
    value: val('14', 840, 'MIN ETA'),
    sourceId: 'UNK-01',
  },
  {
    id: 'PROPELLANT',
    code: 'PRP',
    label: 'PROPELLANT',
    status: 'MARGINAL',
    state: 'warn',
    driver: 'LOX RESERVE',
    value: val('0.6', 2160, 'HOLD-H'),
    sourceId: 'LOX-1',
  },
  {
    id: 'VEHICLE',
    code: 'VEH',
    label: 'VEHICLE',
    status: 'GO',
    state: 'ok',
    driver: 'HEALTH',
    value: val('0.98', 0.98),
    sourceId: 'B-09',
  },
  {
    id: 'PAD_CREW',
    code: 'CRW',
    label: 'PAD / CREW',
    status: 'PENDING',
    state: 'neutral',
    driver: 'SHIFT',
    value: val('6:10', 22200, 'H'),
    sourceId: 'CV-01',
  },
];

export const range: RangeVM = {
  aggregate: 'NO_GO',
  state: 'danger',
  reason: 'UNK-01 IN AREA BRAVO',
  goCount: 2,
  stations,
};

// --- Events / alerts --------------------------------------------------------------------------------

export const events: EventVM[] = [
  {
    id: 'e1',
    time: '13:42:16',
    state: 'danger',
    entityId: 'B-09',
    entityCode: 'B-09',
    message: 'ENGINE OUT · 32 OF 33',
    acked: false,
  },
  {
    id: 'e2',
    time: '13:41:58',
    state: 'warn',
    entityId: 'WX-1',
    entityCode: 'WX-1',
    message: 'UPPER WIND 31 M/S · MARGINAL',
    acked: false,
  },
  {
    id: 'e3',
    time: '13:40:02',
    state: 'ok',
    entityId: null,
    entityCode: 'LC-1',
    message: 'TERMINAL COUNT STARTED',
    acked: true,
  },
  {
    id: 'e4',
    time: '13:38:40',
    state: 'info',
    entityId: 'PK-03',
    entityCode: 'PK-03',
    message: 'DISPATCHED · ETA 14 MIN',
    acked: true,
  },
];

export const alerts: AlertsVM = { open: 2, fresh: 1, state: 'danger', items: events.slice(0, 2) };

// --- Lists ------------------------------------------------------------------------------------------

export const vehicles: ListRowVM[] = [
  {
    id: 'B-09',
    glyph: 'ascent',
    name: 'B-09',
    sub: 'BOOSTER · ASCENT',
    keyValue: val('68.5', 0.685, '% PROP', { width: 5 }),
    state: 'active',
    selected: true,
    following: true,
  },
  {
    id: 'RV-1',
    glyph: 'holding',
    name: 'RV-1',
    sub: 'RECOVERY · ON STATION',
    keyValue: val('9.7', 9700, 'KM', { width: 5 }),
    state: 'neutral',
    selected: false,
    following: false,
  },
  {
    id: 'PK-03',
    glyph: 'patrol',
    name: 'PK-03',
    sub: 'PICKET · INTERCEPT',
    keyValue: val('21.3', 21300, 'KM', { width: 5 }),
    state: 'warn',
    selected: false,
    following: false,
  },
  {
    id: 'UNK-01',
    glyph: 'patrol',
    name: 'UNK-01',
    sub: 'INTRUDER · AREA BRAVO',
    keyValue: val('4.2', 4200, 'KM', { width: 5 }),
    state: 'danger',
    selected: false,
    following: false,
  },
  {
    id: 'SP-42',
    glyph: 'offline',
    name: 'SP-42',
    sub: 'TRANSPORTER · OFFLINE',
    keyValue: val('', null, 'KM/H', { width: 5 }),
    state: 'disabled',
    selected: false,
    following: false,
  },
  {
    id: 'LX-02',
    glyph: 'driving',
    name: 'LX-02',
    sub: 'TANKER · GATE WAIT',
    keyValue: val('0', 0, 'KM/H', { width: 5 }),
    state: 'neutral',
    selected: false,
    following: false,
  },
];

export const tanks: TankRowVM[] = [
  {
    id: 'LOX-1',
    glyph: 'fueling',
    name: 'LOX-1',
    sub: 'LIQUID OXYGEN',
    keyValue: val('82', 0.82, '%', { width: 3 }),
    state: 'neutral',
    selected: false,
    following: false,
    fill: 0.82,
    reserve: 0.4,
    rate: val('−0.4', -0.004, '%/H'),
  },
  {
    id: 'CH4-1',
    glyph: 'fueling',
    name: 'CH4-1',
    sub: 'METHANE · BELOW RESERVE',
    keyValue: val('31', 0.31, '%', { width: 3 }),
    state: 'warn',
    selected: false,
    following: false,
    fill: 0.31,
    reserve: 0.4,
    rate: val('−0.6', -0.006, '%/H'),
  },
];

export const tasks: TaskRowVM[] = [
  {
    id: 'T-118',
    glyph: 'current',
    name: 'T-118 LOX TRANSFER',
    sub: 'LOX-1 → B-09',
    keyValue: val('62', 0.62, '%', { width: 3 }),
    state: 'active',
    selected: false,
    following: false,
    progress: 0.62,
    eta: val('00:14:20', 860),
    actions: [],
  },
];

// --- Inspector --------------------------------------------------------------------------------------

export const inspector: InspectorVM = {
  id: 'B-09',
  callSign: 'B-09',
  classLabel: 'BOOSTER',
  sub: 'BOOSTER · FLIGHT 7 · 6 FLIGHTS',
  status: { glyph: 'ascent', label: 'ASCENT', meta: 'FOLLOWING', state: 'active' },
  following: true,
  metrics: [
    { key: 'clk', label: 'MISSION CLOCK', value: val('T+00:00:51', 51, undefined, { width: 10 }), state: 'neutral' },
    { key: 'alt', label: 'ALTITUDE', value: val('8.3', 8300, 'KM', { width: 5 }), state: 'neutral' },
    { key: 'vel', label: 'VELOCITY', value: val('0.24', 240, 'KM/S', { width: 5 }), state: 'neutral' },
    { key: 'prp', label: 'PROPELLANT', value: val('68.5', 0.685, '%', { width: 5 }), state: 'neutral' },
    metrics.engines,
    { key: 'arm', label: 'CATCH ARMS', value: val('CLOSED', null), state: 'neutral' },
  ],
  progress: {
    label: 'FLIGHT TO TOWER CATCH',
    value: val('12.7', 0.127, '%', { width: 5 }),
    fraction: 0.127,
    tone: 'ink',
  },
  chart: { label: 'ALTITUDE · KM', series: ramp(30, 0, 8.3), unit: 'KM' },
  actions: [],
  lost: false,
};

// --- Time ------------------------------------------------------------------------------------------

const skipOff = { enabled: false, target: null, reason: 'FORCED 1×', active: false };
export const timeScales = {
  running: {
    requested: 10,
    effective: 10,
    maxAllowed: 100,
    paused: false,
    lagging: false,
    effectiveRate: '10×',
    lockReason: null,
    skip: { enabled: true, target: 'T−01:20:00 LOAD POLL', reason: null, active: false },
  },
  paused: {
    requested: 0,
    effective: 0,
    maxAllowed: 100,
    paused: true,
    lagging: false,
    effectiveRate: 'PAUSED',
    lockReason: null,
    skip: { enabled: true, target: 'T−01:20:00 LOAD POLL', reason: null, active: false },
  },
  locked: {
    requested: 1,
    effective: 1,
    maxAllowed: 1,
    paused: false,
    lagging: false,
    effectiveRate: '1×',
    lockReason: '1× LOCKED · TERMINAL COUNT',
    skip: skipOff,
  },
  capped: {
    requested: 100,
    effective: 10,
    maxAllowed: 10,
    paused: false,
    lagging: false,
    effectiveRate: '10×',
    lockReason: 'MAX 10× · PROPELLANT LOAD',
    skip: { enabled: true, target: 'T−00:10:00 POLL', reason: null, active: false },
  },
  lagging: {
    requested: 100,
    effective: 100,
    maxAllowed: 100,
    paused: false,
    lagging: true,
    effectiveRate: '7.4× OF 100×',
    lockReason: null,
    skip: { enabled: true, target: 'T−04:40:00 CUT-OFF', reason: null, active: false },
  },
} satisfies Record<string, TimeScaleVM>;

// --- Deadlines & decisions --------------------------------------------------------------------------

export const deadlines = {
  running: {
    label: 'ROAD CLOSES',
    at: 'T−00:40:00',
    remaining: val('03:12:00', 11520, undefined, { width: 8 }),
    fraction: 0.6,
    marker: 0.82,
    held: false,
    state: 'info',
  },
  held: {
    label: 'WINDOW CLOSES',
    at: '15:06:54',
    remaining: val('00:31:10', 1870, undefined, { width: 8 }),
    fraction: 0.34,
    held: true,
    state: 'warn',
  },
  danger: {
    label: 'LANDING BURN',
    at: 'T+00:06:20',
    remaining: val('00:00:41', 41, undefined, { width: 8 }),
    fraction: 0.08,
    held: false,
    state: 'danger',
  },
  expired: {
    label: 'WINDOW CLOSES',
    at: '15:06:54',
    remaining: val('00:00:00', 0, undefined, { width: 8 }),
    fraction: 0,
    held: false,
    state: 'danger',
  },
  none: { label: 'NEXT DEADLINE', at: '—', remaining: val('', null), fraction: 0, held: false, state: 'disabled' },
} satisfies Record<string, DeadlineVM>;

export const decisionCatch: CatchDecisionVM = {
  id: 'd3',
  kind: 'CATCH',
  title: 'D3 RECOVERY',
  question: 'CATCH B-09 AT TOWER-1?',
  autoNote: 'AUTO AT DEADLINE: DIVERT (P < 0.65)',
  deadline: deadlines.danger,
  state: 'warn',
  blocking: true,
  queued: 0,
  pending: null,
  p: val('0.62', 0.62),
  band: 'LEAN',
  breakEven: 0.535,
  drivers: [
    { label: 'ENGINE OUT', value: val('32 OF 33', 32), effect: 'σ +0.9 M', state: 'danger' },
    { label: 'TOWER WIND', value: val('11.2', 11.2, 'M/S'), effect: 'σ +0.4 M', state: 'warn' },
    { label: 'LANDING PROP', value: val('55', 55000, 'T'), effect: 'σ +0.6 M', state: 'warn' },
  ],
  options: [
    {
      id: 'catch',
      label: 'GO FOR CATCH',
      key: '⏎',
      variant: 'primary',
      enabled: true,
      auto: false,
      confirm: false,
      consequences: [
        { label: 'SUCCESS 62 %', value: val('−1.5', -1.5e6, 'M CR'), state: 'ok' },
        { label: 'FAIL 38 % · TOWER 21 D', value: val('−86.0', -86e6, 'M CR'), state: 'danger' },
      ],
      ev: val('−33.6', -33.6e6, 'M CR'),
    },
    {
      id: 'divert',
      label: 'DIVERT',
      key: 'D',
      variant: 'secondary',
      enabled: true,
      auto: true,
      confirm: true,
      consequences: [
        { label: 'BOOSTER LOST', value: val('−40.0', -40e6, 'M CR'), state: 'warn' },
        { label: 'TOWER', value: val('SAFE', null), state: 'ok' },
      ],
      ev: val('−40.0', -40e6, 'M CR'),
    },
  ],
};

export const decisionPoll: PollDecisionVM = {
  id: 'd2',
  kind: 'POLL',
  title: 'D2 GO / NO-GO',
  question: 'POLL T−00:10:00 · 2 OF 5 GO',
  autoNote: 'NO AUTO-GO WHILE A STATION IS NOT GO · WINDOW CLOSE = AUTO-SCRUB',
  deadline: deadlines.held,
  state: 'danger',
  blocking: true,
  queued: 1,
  pending: null,
  pollLabel: 'TERMINAL POLL',
  stations,
  riskNote: 'GO ON MARGINAL: ASCENT RISK ×2.0',
  options: [
    {
      id: 'go',
      label: 'GO',
      key: '⏎',
      variant: 'primary',
      enabled: false,
      reason: 'RANGE NO-GO',
      auto: false,
      confirm: false,
      consequences: [],
    },
    {
      id: 'hold',
      label: 'HOLD',
      key: 'H',
      variant: 'secondary',
      enabled: true,
      auto: true,
      confirm: false,
      consequences: [{ label: 'WINDOW', value: val('−1', -60, 'MIN/MIN'), state: 'warn' }],
    },
    {
      id: 'recycle',
      label: 'RECYCLE',
      key: 'R',
      variant: 'secondary',
      enabled: true,
      auto: false,
      confirm: false,
      consequences: [{ label: 'BACK TO', value: val('T−00:10:00', -600), state: 'neutral' }],
    },
    {
      id: 'scrub',
      label: 'SCRUB',
      key: 'S',
      variant: 'danger',
      enabled: true,
      auto: false,
      confirm: true,
      consequences: [{ label: 'PENALTY', value: val('−14.9', -14.9e6, 'M CR'), state: 'danger' }],
    },
  ],
};

export const decisionLeak: LeakDecisionVM = {
  id: 'd3b',
  kind: 'LEAK',
  title: 'D3B GSE LEAK',
  question: 'CH4 QD LEAK · LOAD RATE ×0.5',
  autoNote: 'AUTO: CONTINUE DEGRADED',
  deadline: deadlines.held,
  state: 'warn',
  blocking: true,
  queued: 0,
  pending: 'HOLD_FIX',
  loadEta: [
    { label: 'DEGRADED', at: val('T−00:02:10', -130), state: 'danger' },
    { label: 'HOLD 20 MIN', at: val('T−00:12:40', -760), state: 'ok' },
  ],
  options: [],
};

export const decisionProp: PropMarginDecisionVM = {
  id: 'd1',
  kind: 'PROP_MARGIN',
  title: 'D1 PROPELLANT MARGIN',
  question: 'ORDER PROPELLANT BEFORE ROAD CLOSURE?',
  autoNote: 'NO ORDER BY DEFAULT',
  deadline: deadlines.running,
  state: 'warn',
  blocking: false,
  queued: 0,
  pending: null,
  reserves: [metrics.propWarn],
  orders: [{ label: 'LX-03 STANDARD', eta: val('02:10:00', 7800) }],
  fleet: { value: 3, max: 4, label: 'LOX tankers in use, 3 of 4' },
  options: [],
};

// --- Debrief ---------------------------------------------------------------------------------------

export const debrief: DebriefVM = {
  title: 'DEBRIEF · LC-1 FLIGHT 7 · NRL-3',
  stamp: 'SEED 42',
  outcome: 'CAUGHT',
  outcomeLabel: 'CAUGHT',
  state: 'ok',
  facts: [
    { label: 'CONTRACT', value: 'FULFILLED · SECO T+00:08:31' },
    { label: 'LIFTOFF', value: '14:22:09 UTC' },
    { label: 'HOLDS', value: '00:23:40 · 2 HOLDS' },
  ],
  money: { delta: val('+37.4', 37.4e6, 'M CR'), from: val('812.0', 812e6, 'M'), to: val('849.4', 849.4e6, 'M') },
  reputation: { delta: val('+4', 4), from: val('61', 61), to: val('65', 65) },
  booster: {
    callSign: 'B-09',
    state: 'CAUGHT, SAFING',
    flights: '6 → 7',
    wear: { value: 3, max: 10, label: 'Wear 0.24', text: '0.18 → 0.24' },
  },
  tower: { label: 'TOWER-1 NOMINAL', state: 'ok' },
  turnaround: val('4.0', 345600, 'D'),
  ledger: [
    { label: 'CONTRACT NRL-3', amount: val('+62.0', 62e6, 'M'), reputation: val('+5', 5) },
    { label: 'EXPENDED SHIP S-21', amount: val('−20.0', -20e6, 'M'), reputation: null },
    { label: 'PROPELLANT', amount: val('−1.1', -1.1e6, 'M'), reputation: null },
    { label: 'REFURB', amount: val('−1.5', -1.5e6, 'M'), reputation: null },
    { label: 'OPS', amount: val('−1.9', -1.9e6, 'M'), reputation: val('−1', -1) },
  ],
  decisions: [
    { time: 'T−05:58:12', id: 'D1', detail: 'ORDER 2× LX STANDARD', by: 'PLAYER' },
    { time: 'T−01:20:00', id: 'D2', detail: 'GO (PRP MARGINAL)', by: 'PLAYER' },
    { time: 'T−00:31:07', id: 'D2', detail: 'HOLD · UNK-01', by: 'PLAYER' },
    { time: 'T+00:05:39', id: 'D3', detail: 'CATCH P 0.71 → ROLL 0.44', by: 'AUTO' },
  ],
  anomalies: [
    { id: 'A1', label: 'RANGE FOULED', time: 'T−00:41:12' },
    { id: 'A4', label: 'ENGINE OUT', time: 'T+00:02:10' },
  ],
  actions: [
    { id: 'replay', label: 'REPLAY SAME SEED', enabled: true, variant: 'primary' },
    { id: 'seed', label: 'NEW SEED', enabled: true, variant: 'secondary' },
    { id: 'export', label: 'EXPORT LOG', enabled: true, variant: 'secondary' },
    { id: 'view', label: 'VIEW SITE', key: 'Esc', enabled: true, variant: 'secondary' },
  ],
};

// --- Countdown, labels, sites -----------------------------------------------------------------------

export const countdown: CountdownVM = {
  title: 'LC-1 · B-09 / S-21',
  tClock: 'T−00:10:00',
  state: 'active',
  windowOpen: 0.55,
  windowClose: 0.8,
  phases: [
    { id: 'Rollout', label: 'ROLLOUT', short: 'ROLL', state: 'done', share: 0.12, progress: 1 },
    { id: 'Stack', label: 'STACK', short: 'STK', state: 'done', share: 0.2, progress: 1 },
    { id: 'PropellantLoad', label: 'PROPELLANT LOAD', short: 'PROP', state: 'done', share: 0.22, progress: 1 },
    { id: 'TerminalCount', label: 'TERMINAL COUNT', short: 'TERM', state: 'current', share: 0.14, progress: 0.4 },
    { id: 'Liftoff', label: 'LIFTOFF', short: 'LIFT', state: 'pending', share: 0.06, progress: 0 },
    { id: 'Boostback', label: 'BOOSTBACK', short: 'BBK', state: 'pending', share: 0.08, progress: 0 },
    { id: 'TowerCatch', label: 'TOWER CATCH', short: 'CATCH', state: 'pending', share: 0.06, progress: 0 },
    { id: 'Safing', label: 'SAFING', short: 'SAFE', state: 'pending', share: 0.12, progress: 0 },
  ],
};

export const labels: LabelVM[] = [
  { id: 'TOWER-1', callSign: 'TOWER-1', glyph: 'current', state: 'neutral', selected: false },
  { id: 'B-09', callSign: 'B-09', glyph: 'ascent', state: 'active', selected: true },
  { id: 'UNK-01', callSign: 'UNK-01', glyph: 'patrol', state: 'danger', selected: false },
];

export const sites: SiteVM[] = [
  { id: 'LC-1', code: 'LC-1', kind: 'ORBITAL PAD', status: 'ACTIVE', state: 'ok', current: true, alertCount: 2 },
  {
    id: 'LC-2',
    code: 'LC-2',
    kind: 'ORBITAL PAD',
    status: 'BUILD 62 %',
    state: 'disabled',
    current: false,
    alertCount: 0,
  },
];

/** A complete projection at T−00:10:00 with the D2 poll open — the shape the 6.1 projector must produce. */
export const projection: UiProjection = {
  clock,
  timeScale: timeScales.locked,
  range,
  alerts,
  flightCard,
  countdown,
  inspector,
  lists: { vehicles, tanks, tasks, range: stations, events },
  decision: decisionPoll,
  debrief: null,
  labels,
  sites,
};
