// Fixture view models for the 6.4 / 6.7 panels (flight card, inspector per class, tabbed panel, events, debrief).
// Same conventions as `./index.ts`: MVP-scenario numbers, typed against the bridge projection types, not sim output.
import { val } from '../components/Value';
import type {
  ActionVM,
  DebriefVM,
  EventVM,
  FlightCardVM,
  InspectorVM,
  ListRowVM,
  ListsVM,
  MetricVM,
  TaskRowVM,
} from '../types';
import * as base from './index';

const m = (
  key: string,
  label: string,
  text: string,
  value: number | null,
  unit?: string,
  state: MetricVM['state'] = 'neutral',
): MetricVM => ({
  key,
  label,
  value: val(text, value, unit),
  state,
});

const ramp = (n: number, from: number, to: number): number[] =>
  Array.from({ length: n }, (_, i) => +(from + ((to - from) * i) / (n - 1)).toFixed(3));

// --- Flight card ------------------------------------------------------------------------------------

/** Pre-liftoff, the projector's shape (farm reserve tick, contract line). */
export const flightCardCounting: FlightCardVM = {
  ...base.flightCard,
  farmReserve: 0.6,
  farmReserveTime: val('0.60', 2160, 'H'),
  farmReserveFluid: 'LOX',
  contract: { id: 'NRL-3', customer: 'NORTHREACH', status: 'ACTIVE', state: 'info' },
};

/** Reserve below the 1 hold-hour limit and a NO-GO range: the D1 / D2 alert treatments. */
export const flightCardAlert: FlightCardVM = {
  ...flightCardCounting,
  propellant: { ...base.metrics.prop, value: val('71.4', 0.714, '%', { width: 5 }), state: 'warn' },
  farmReserve: 0.35,
  farmReserveTime: val('0.35', 1260, 'H'),
  stations: {
    key: 'st',
    label: 'STATIONS GO',
    value: val('2 OF 5', 2),
    state: 'danger',
    segments: { value: 2, max: 5, label: 'Stations go, 2 of 5' },
  },
  range: { ...base.flightCard.range, value: val('NO-GO', null), state: 'danger' },
};

/** After liftoff: FLOWN tile, no farm tick, sparklines kept. */
export const flightCardFlown: FlightCardVM = {
  ...base.flightCard,
  nextLaunch: { key: 't', label: 'FLOWN', value: val('T+00:03:16', 196, undefined, { width: 10 }), state: 'active' },
  propellant: { ...base.metrics.prop, value: val('41.2', 0.412, '%', { width: 5 }), state: 'neutral' },
  farmReserve: null,
  stations: {
    key: 'st',
    label: 'STATIONS GO',
    value: val('5 OF 5', 5),
    state: 'ok',
    segments: { value: 5, max: 5, label: 'Stations go, 5 of 5' },
  },
  range: { ...base.flightCard.range, value: val('GO', null), state: 'ok' },
};

// --- Inspector --------------------------------------------------------------------------------------

/** The projector's full booster set (12 metrics, `project-entities.ts` keys): compact keeps 6 (§3.3). */
export const inspectorBooster: InspectorVM = {
  ...base.inspector,
  kind: 'booster',
  className: 'BULWARK',
  selected: true,
  metrics: [
    m('clock', 'MISSION CLOCK', 'T+00:01:45', 105),
    m('altitude', 'ALTITUDE', '38.6', 38600, 'KM'),
    m('velocity', 'VELOCITY', '5 410', 1503, 'KM/H'),
    m('prop', 'PROPELLANT', '11.8', 0.118, '%'),
    { ...base.metrics.engines, key: 'engines' },
    m('heading', 'HEADING', '088', 1.54, '°'),
    m('downrange', 'DOWNRANGE', '41.2', 41200, 'KM'),
    m('arms', 'CATCH ARMS', 'OPEN', null),
    m('landingProp', 'LANDING PROP', '212', 212000, 'T'),
    m('towerWind', 'TOWER WIND', '9.4', 9.4, 'M/S'),
    m('catchP', 'CATCH P', '0.61', 0.61, undefined, 'warn'),
    m('wear', 'WEAR', '18', 0.18, '%'),
  ],
  actions: [
    {
      id: 'DIVERT',
      label: 'DIVERT',
      key: 'D',
      enabled: true,
      variant: 'danger',
      confirm: [
        { label: 'BOOSTER LOST', value: val('−40.0', -40e6, 'M CR'), state: 'warn' },
        { label: 'TOWER', value: val('SAFE', null), state: 'ok' },
      ],
      command: { t: 'CatchDecision', boosterId: 'B-09', choice: 'DIVERT' },
    },
    {
      id: 'START_ROLLOUT',
      label: 'START ROLLOUT',
      enabled: false,
      reason: 'IN FLIGHT',
      variant: 'secondary',
      command: null,
    },
  ],
};

/** Selected but not followed; one metric in danger → header band. */
export const inspectorShip: InspectorVM = {
  id: 'S-21',
  callSign: 'S-21',
  kind: 'ship',
  classLabel: 'SHIP',
  className: 'VESPER',
  sub: 'SHIP · LC-1 FLIGHT 7',
  status: { glyph: 'ascent', label: 'ASCENT', meta: 'SELECTED', state: 'active' },
  selected: true,
  following: false,
  metrics: [
    m('clock', 'MISSION CLOCK', 'T+00:03:16', 196),
    m('altitude', 'ALTITUDE', '71.8', 71800, 'KM'),
    m('velocity', 'VELOCITY', '9 540', 2650, 'KM/H'),
    m('prop', 'PROPELLANT', '41.2', 0.412, '%'),
    m('engines', 'ENGINES LIT', '6 OF 6', 6),
    m('heading', 'HEADING', '092', 1.6, '°'),
    m('downrange', 'DOWNRANGE', '118', 118000, 'KM'),
  ],
  progress: { label: 'FLIGHT TO SECO', value: val('38.4', 0.384, '%', { width: 5 }), fraction: 0.384, tone: 'ink' },
  chart: { label: 'ALTITUDE · KM', series: ramp(40, 0, 71.8), unit: 'KM' },
  actions: [],
  lost: false,
};

export const inspectorVessel: InspectorVM = {
  id: 'RV-1',
  callSign: 'RV-1',
  kind: 'boat',
  classLabel: 'RECOVERY VESSEL',
  className: 'GRAPPLE',
  sub: 'RECOVERY VESSEL · GRAPPLE',
  status: { glyph: 'holding', label: 'ON STATION, HOLDING', meta: 'FOLLOWING', state: 'neutral' },
  selected: true,
  following: true,
  metrics: [m('speed', 'SPEED', '4', 1.1, 'KM/H'), m('target', 'TARGET', 'B-09', null)],
  progress: null,
  chart: null,
  actions: [],
  lost: false,
};

export const inspectorTransporter: InspectorVM = {
  id: 'SP-41',
  callSign: 'SP-41',
  kind: 'transporter',
  classLabel: 'TRANSPORTER',
  className: 'MULE',
  sub: 'TRANSPORTER · MULE',
  status: { glyph: 'warn', label: 'WIND HOLD', meta: 'SELECTED', state: 'warn' },
  selected: true,
  following: false,
  metrics: [m('speed', 'SPEED', '0', 0, 'KM/H', 'warn'), m('cargo', 'CARGO', 'B-09', null)],
  progress: { label: 'ROLLOUT TO OLM-1', value: val('46.0', 0.46, '%', { width: 5 }), fraction: 0.46, tone: 'ink' },
  chart: null,
  actions: [],
  lost: false,
};

export const inspectorTanker: InspectorVM = {
  id: 'LX-02',
  callSign: 'LX-02',
  kind: 'tanker',
  classLabel: 'TANKER',
  className: 'RIME',
  sub: 'TANKER · RIME · CHARTERED',
  status: { glyph: 'driving', label: 'INBOUND', meta: 'SELECTED', state: 'neutral' },
  selected: true,
  following: false,
  metrics: [
    m('speed', 'SPEED', '47', 13.1, 'KM/H'),
    m('cargo', 'CARGO', '18', 18000, 'T'),
    m('fluid', 'FLUID', 'LOX', null),
    m('order', 'ORDER', 'O-03', null),
    m('gate', 'GATE ETA', 'T−01:42:10', -6130),
  ],
  progress: { label: 'TO GATE', value: val('63.0', 0.63, '%', { width: 5 }), fraction: 0.63, tone: 'ink' },
  chart: null,
  actions: [],
  lost: false,
};

export const inspectorLost: InspectorVM = {
  ...base.inspector,
  id: 'B-07',
  callSign: 'B-07',
  sub: 'BOOSTER · 9 FLIGHTS',
  status: { glyph: 'danger', label: 'LOST', meta: null, state: 'danger' },
  following: false,
  selected: true,
  progress: null,
  chart: null,
  metrics: base.inspector.metrics.map((x) => ({ ...x, value: val('', null, x.value.unit), state: 'neutral' })),
  lost: true,
};

// --- Lists ------------------------------------------------------------------------------------------

const orderAction = (
  id: string,
  label: string,
  key: string,
  command: NonNullable<ActionVM['command']>,
  reason?: string,
): ActionVM => ({
  id,
  label,
  key,
  enabled: !reason,
  variant: 'secondary',
  ...(reason ? { reason } : {}),
  command,
});

export const tasks: TaskRowVM[] = [
  ...base.tasks,
  {
    id: 'stack:S-21',
    kind: 'task',
    glyph: 'pending',
    name: 'STACK S-21',
    sub: 'TOWER-1 · QUEUED',
    keyValue: val('0', 0, '%', { width: 3 }),
    state: 'info',
    selected: false,
    following: false,
    progress: null,
    eta: val('', null),
    actions: [],
  },
  {
    id: 'order:LOX',
    kind: 'task',
    glyph: 'pending',
    name: 'ORDER LOX',
    sub: 'ROAD CLOSES T−00:40:00',
    keyValue: val('0', 0, '%', { width: 3 }),
    state: 'warn',
    selected: false,
    following: false,
    progress: null,
    eta: val('T−00:40:00', -2400),
    actions: [
      orderAction('ORDER_LOX_STD', 'STANDARD 4.0 M', 'S', { t: 'OrderDelivery', fluid: 'LOX', rush: false }),
      orderAction(
        'ORDER_LOX_RUSH',
        'RUSH 6.5 M',
        'R',
        { t: 'OrderDelivery', fluid: 'LOX', rush: true },
        'NO TANKER FREE',
      ),
    ],
  },
];

export const rangeAssets: ListRowVM[] = [
  {
    id: 'PK-03',
    kind: 'boat',
    glyph: 'patrol',
    name: 'PK-03',
    sub: 'PICKET · INTERCEPT',
    keyValue: val('21.3', 21300, 'KM', { width: 5 }),
    state: 'warn',
    selected: false,
    following: false,
  },
  {
    id: 'WX-1',
    kind: 'wxStation',
    glyph: 'ok',
    name: 'WX-1',
    sub: 'WEATHER STATION · VANE',
    keyValue: val('8.1', 8.1, 'M/S', { width: 5 }),
    state: 'neutral',
    selected: false,
    following: false,
  },
];

const more = (i: number, e: Omit<EventVM, 'id' | 'acked'>): EventVM => ({ ...e, id: `x${i}`, acked: true });

export const eventLog: EventVM[] = [
  ...base.events,
  more(1, {
    time: '13:36:54',
    state: 'info',
    entityId: null,
    entityCode: 'LC-1',
    message: 'LAUNCH WINDOW OPEN',
    glyph: 'pending',
  }),
  more(2, {
    time: '13:21:10',
    state: 'warn',
    entityId: null,
    entityCode: 'LC-1',
    message: 'HOLD · POLL · LOAD POLL',
    glyph: 'warn',
    tClock: 'T−01:20:00',
  }),
  more(3, {
    time: '13:04:00',
    state: 'ok',
    entityId: 'LX-02',
    entityCode: 'LX-02',
    message: 'DELIVERED 18 T LOX',
    glyph: 'ok',
  }),
  more(4, {
    time: '12:40:00',
    state: 'neutral',
    entityId: 'TOWER-1',
    entityCode: 'TOWER-1',
    message: 'CATCH ARMS OPEN',
    glyph: 'current',
  }),
];

export const lists: ListsVM = {
  vehicles: base.vehicles,
  tanks: base.tanks,
  tasks,
  range: base.stations,
  rangeAssets,
  events: eventLog,
  badges: {
    vehicles: { warn: 1, danger: 1 },
    tanks: { warn: 1, danger: 0 },
    tasks: { warn: 1, danger: 0 },
    range: { warn: 1, danger: 1 },
    events: { warn: 1, danger: 1 },
  },
};

// --- Debrief ----------------------------------------------------------------------------------------

export const debriefCaught: DebriefVM = base.debrief;

export const debriefDiverted: DebriefVM = {
  ...base.debrief,
  outcome: 'DIVERTED',
  outcomeLabel: 'DIVERTED',
  stamp: 'DIVERTED',
  state: 'warn',
  money: { delta: val('−3.6', -3.6e6, 'M CR'), from: val('812.0', 812e6, 'M'), to: val('808.4', 808.4e6, 'M') },
  reputation: { delta: val('+1', 1), from: val('61', 61), to: val('62', 62) },
  booster: {
    callSign: 'B-09',
    state: 'EXPENDED · SPLASHDOWN',
    flights: '6 → 7',
    wear: { value: 10, max: 10, label: 'Wear 1.00', text: '0.18 → LOST' },
  },
  ledger: [
    { label: 'CONTRACT NRL-3', amount: val('+62.0', 62e6, 'M'), reputation: val('+5', 5) },
    { label: 'EXPENDED BOOSTER B-09', amount: val('−40.0', -40e6, 'M'), reputation: null },
    { label: 'EXPENDED SHIP S-21', amount: val('−20.0', -20e6, 'M'), reputation: null },
    { label: 'PROPELLANT', amount: val('−1.1', -1.1e6, 'M'), reputation: null },
    { label: 'OPS', amount: val('−4.5', -4.5e6, 'M'), reputation: val('−4', -4) },
  ],
  decisions: [
    { time: 'T−01:20:00', id: 'D2', detail: 'GO', by: 'PLAYER' },
    { time: 'T+00:05:39', id: 'D3', detail: 'DIVERT · P 0.58', by: 'PLAYER' },
  ],
};

export const debriefFailed: DebriefVM = {
  ...base.debrief,
  outcome: 'CATCH_FAILED',
  outcomeLabel: 'CATCH FAILED',
  stamp: 'CATCH FAILED',
  state: 'danger',
  money: { delta: val('−48.5', -48.5e6, 'M CR'), from: val('812.0', 812e6, 'M'), to: val('763.5', 763.5e6, 'M') },
  reputation: { delta: val('−6', -6), from: val('61', 61), to: val('55', 55) },
  booster: {
    callSign: 'B-09',
    state: 'LOST AT TOWER',
    flights: '6 → 7',
    wear: { value: 10, max: 10, label: 'Wear 1.00', text: '0.18 → LOST' },
  },
  tower: { label: 'TOWER-1 DAMAGED · 21 D', state: 'danger' },
  turnaround: val('21.0', 1814400, 'D'),
  decisions: [
    { time: 'T−01:20:00', id: 'D2', detail: 'GO', by: 'PLAYER' },
    { time: 'T+00:05:39', id: 'D3', detail: 'CATCH P 0.62 → ROLL 0.71', by: 'PLAYER' },
  ],
};

export const debriefScrubbed: DebriefVM = {
  ...base.debrief,
  outcome: 'SCRUBBED',
  outcomeLabel: 'SCRUBBED',
  stamp: 'SCRUBBED',
  state: 'danger',
  facts: [
    { label: 'CONTRACT', value: 'NRL-3 WINDOW LOST' },
    { label: 'LIFTOFF', value: '—' },
    { label: 'HOLDS', value: '01:12:40 · 3 HOLDS' },
  ],
  money: { delta: val('−16.0', -16e6, 'M CR'), from: val('812.0', 812e6, 'M'), to: val('796.0', 796e6, 'M') },
  reputation: { delta: val('−3', -3), from: val('61', 61), to: val('58', 58) },
  booster: {
    callSign: 'B-09',
    state: 'NOT FLOWN',
    flights: '6 → 6',
    wear: { value: 2, max: 10, label: 'Wear 0.18', text: '0.18 → 0.18' },
  },
  turnaround: val('2.0', 172800, 'D'),
  ledger: [
    { label: 'SCRUB PENALTY NRL-3', amount: val('−14.9', -14.9e6, 'M'), reputation: val('−3', -3) },
    { label: 'PROPELLANT', amount: val('−1.1', -1.1e6, 'M'), reputation: null },
  ],
  decisions: [
    { time: 'T−01:20:00', id: 'D2', detail: 'HOLD · RANGE', by: 'PLAYER' },
    { time: 'T−00:10:00', id: 'D2', detail: 'SCRUB', by: 'PLAYER' },
  ],
  anomalies: [{ id: 'A1', label: 'RANGE FOULED', time: 'T−01:22:40' }],
};
