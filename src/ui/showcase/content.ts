// Showcase copy (docs/SHOWCASE.md §2). Names and numbers come from docs/GDD.md §5, §11, §12 and ASSETS_GUIDE §2.
// English only (user decision). Original names only (CLAUDE.md rule 6).
import type { ChapterId } from '@data/showcase';

export const ORG = { org: 'Calder Orbital', region: 'Varne Coast', site: 'Brackwater LC-1' } as const;

export const PITCH = {
  kicker: 'Calder Orbital · Launch director',
  line: 'A live rocket launch site you can play like a strategy game.',
  never: 'You never fly the rocket.',
  body: 'You decide when, whether, and how much risk. Tankers shuttle, transporters crawl, picket boats patrol, and the window keeps closing. Get the stack off the pad, catch the booster in the tower arms, then turn it around faster than last time.',
} as const;

export const FACTS = [
  ['33', 'engines on B-09'],
  ['146 m', 'catch tower'],
  ['4', 'calls per flight'],
  ['0', 'quick-time events'],
] as const;

export interface Chapter {
  id: ChapterId;
  title: string;
  clock: string;
  body: string;
  decision: { question: string; options: readonly (readonly [label: string, cost: string])[] };
  data: readonly (readonly [term: string, value: string])[];
}

export const DOSSIER: readonly Chapter[] = [
  {
    id: 'contract',
    title: 'Contract',
    clock: 'T-06:00:00',
    body: 'Norrland Relay wants fourteen relay satellites in low orbit. The window opens tonight and lasts ninety minutes. The price is good. So is the penalty.',
    decision: {
      question: 'Accept NRL-3?',
      options: [
        ['Accept', 'Window before your margin is built'],
        ['Pass', 'No money, no reputation'],
      ],
    },
    data: [
      ['Customer', 'Norrland Relay'],
      ['Payload', '14 sats · LEO'],
      ['Window', '90 min'],
      ['Pair', 'B-09 / S-21'],
    ],
  },
  {
    id: 'prepare',
    title: 'Prepare',
    clock: 'T-05:15:00',
    body: 'SP-41 crawls B-09 out of the yard at walking pace. The tower arms lift it onto OLM-1, then set S-21 on top. Meanwhile the RIME and FEN tankers queue at the farm gate.',
    decision: {
      question: 'How much propellant margin?',
      options: [
        ['Run lean', 'Cheap, one long hold and you scrub'],
        ['Rush trucks', 'Survives holds, costs 20 times more'],
      ],
    },
    data: [
      ['Transporter', 'SP-41 MULE'],
      ['Stack', 'Booster, then ship'],
      ['Road closes', 'T-00:40:00'],
      ['Farm', 'LOX ×3 · CH4 ×2'],
    ],
  },
  {
    id: 'countdown',
    title: 'Count down',
    clock: 'T-01:20:00',
    body: 'Five stations report: weather, range, propellant, vehicle, pad and crew. Upper winds are rising and a fishing boat is drifting toward the hazard area. The window does not care.',
    decision: {
      question: 'Go, hold, recycle or scrub?',
      options: [
        ['Go on marginal', 'Clock runs, anomaly risk goes up'],
        ['Hold', 'Window shrinks, farm drains, crews tire'],
      ],
    },
    data: [
      ['Stations', '4 of 5 GO'],
      ['Weather', 'Marginal'],
      ['Range', 'PK-03 intercepting'],
      ['Load', '87.4 %'],
    ],
  },
  {
    id: 'fly',
    title: 'Fly',
    clock: 'T+00:00:00',
    body: 'Thirty-three engines light. Max-Q, MECO, hot staging. You watch telemetry, not a joystick. If an engine goes out, the numbers that decide the catch start to move.',
    decision: {
      question: 'Engine out on ascent?',
      options: [
        ['Continue', 'Landing propellant shrinks'],
        ['Abort catch early', 'Booster expended, tower safe'],
      ],
    },
    data: [
      ['Engines', '33 of 33'],
      ['Max-Q', 'T+00:01:02'],
      ['Staging', 'T+00:02:40'],
      ['Ship', 'S-21 to orbit'],
    ],
  },
  {
    id: 'recover',
    title: 'Recover',
    clock: 'T+00:06:00',
    body: 'B-09 boosts back toward an offshore aim point. Catch probability is shown honestly, to one percent. Bet the booster and the tower, or put it in the sea.',
    decision: {
      question: 'Catch p 0.62 · deadline T+00:06:20',
      options: [
        ['Go for catch', 'Miss: booster lost, tower down for weeks'],
        ['Divert', 'Booster lost, tower safe'],
      ],
    },
    data: [
      ['Band', 'Lean'],
      ['Tower wind', '11 m/s'],
      ['Landing prop', '6.1 %'],
      ['Arms', 'Open'],
    ],
  },
  {
    id: 'turnaround',
    title: 'Turn around',
    clock: 'T+00:07:30',
    body: 'Caught, safing. Vent, purge, lower, refurbish. The debrief prices every call you made. Cadence is the score: the next flight starts the moment this one ends.',
    decision: {
      question: 'Quick turn or full refurb?',
      options: [
        ['Quick turn', 'Faster cadence, more wear'],
        ['Full refurb', 'Resets wear, pad sits idle'],
      ],
    },
    data: [
      ['B-09', 'Flight 7 · wear 0.21'],
      ['Turnaround', '5 d 6 h'],
      ['Reputation', '+12'],
      ['Next', 'LC-1 Flight 8'],
    ],
  },
];

export const CALLS = [
  {
    id: 'margin',
    title: 'Propellant margin',
    when: 'Prepare',
    body: 'Standard trucks must be ordered before the forecast can see the window. Rush trucks can wait for the forecast, at twenty times the price.',
    lean: 'Cheap. One long hold and the farm runs dry.',
    safe: 'Survives holds and a recycle. Eats the profit.',
  },
  {
    id: 'gonogo',
    title: 'Go / No-Go',
    when: 'Count down',
    body: 'Hold for the weather while the window shrinks, go on marginal and raise the anomaly odds, or scrub and pay the penalty for sure.',
    lean: 'Go on marginal: the clock runs, risk goes up.',
    safe: 'Hold or scrub: safe vehicle, lost window.',
  },
  {
    id: 'catch',
    title: 'Catch or divert',
    when: 'Recover',
    body: 'Break-even sits near p 0.54. Without an anomaly it is a confirmation. With an engine out, it is a real bet against the tower itself.',
    lean: 'Go for catch: keep the booster, risk the tower.',
    safe: 'Divert: lose the booster, keep the pad flying.',
  },
  {
    id: 'reinvest',
    title: 'Reinvest',
    when: 'Turn around',
    body: 'More tanks, more tankers, faster crews, a weather radar, a second pad at Cobble Reach. Each one removes a different bottleneck.',
    lean: 'Spend on cadence: more flights, thinner margins.',
    safe: 'Spend on margin: fewer surprises, slower growth.',
  },
] as const;

export type Family = 'Vehicles' | 'Pad' | 'Logistics' | 'Fleet';

export interface Plate {
  asset: string;
  name: string;
  callSign: string;
  family: Family;
  size: string;
  role: string;
}

/** Catalogue plates: WebP renders in public/showcase/plates/<asset>.webp (scripts/showcase/plates.py). */
export const PLATES: readonly Plate[] = [
  {
    asset: 'tower',
    name: 'Catch tower',
    callSign: 'TOWER-1',
    family: 'Pad',
    size: '13 × 13 × 146 m',
    role: 'Stacks the vehicle with its arms, then catches the booster on the way back.',
  },
  {
    asset: 'pad',
    name: 'Launch mount',
    callSign: 'OLM-1',
    family: 'Pad',
    size: '30 × 30 × 20 m',
    role: 'Holds the stack and its quick-disconnects until liftoff.',
  },
  {
    asset: 'booster',
    name: 'Bulwark booster',
    callSign: 'B-09',
    family: 'Vehicles',
    size: 'Ø 9 × 71 m',
    role: '33 engines, 4 grid fins, 2 catch pins. Flight-proven hardware is the long game.',
  },
  {
    asset: 'ship',
    name: 'Vesper ship',
    callSign: 'S-21',
    family: 'Vehicles',
    size: 'Ø 9 × 52 m',
    role: 'Upper stage. Carries the payload and the contract.',
  },
  {
    asset: 'transporter',
    name: 'Mule transporter',
    callSign: 'SP-41',
    family: 'Logistics',
    size: '16 × 14 m',
    role: 'Rolls a stage from the yard to the pad at walking pace.',
  },
  {
    asset: 'crane',
    name: 'Derrick crane',
    callSign: 'CR-77',
    family: 'Logistics',
    size: 'boom 96 m',
    role: 'Lifts stages onto the transporter in the yard.',
  },
  {
    asset: 'tanker',
    name: 'Rime / Fen tanker',
    callSign: 'LX-03',
    family: 'Logistics',
    size: '21 × 2.6 × 4 m',
    role: 'LOX and methane by road. Late trucks wait at the gate.',
  },
  {
    asset: 'tank_v',
    name: 'Cryo tank',
    callSign: 'LOX-2',
    family: 'Pad',
    size: 'Ø 6 × 28 m',
    role: 'Farm inventory with real boil-off.',
  },
  {
    asset: 'tank_sphere',
    name: 'Sphere tank',
    callSign: 'LN2-1',
    family: 'Pad',
    size: 'Ø 18 m',
    role: 'Purge and chill nitrogen.',
  },
  {
    asset: 'boat_range',
    name: 'Picket boat',
    callSign: 'PK-03',
    family: 'Fleet',
    size: '26 × 6.5 m',
    role: 'Keeps the maritime hazard area clear.',
  },
  {
    asset: 'vessel_recovery',
    name: 'Grapple vessel',
    callSign: 'RV-1',
    family: 'Fleet',
    size: '72 × 16 m',
    role: 'Holds at the divert point, in case.',
  },
  {
    asset: 'wx_station',
    name: 'Vane station',
    callSign: 'WX-1',
    family: 'Logistics',
    size: '3 × 3 × 10 m',
    role: 'Ground and tower wind for every call.',
  },
];

export interface SiteInfo {
  code: string;
  name: string;
  role: string;
  state: 'Active' | 'Under construction' | 'Operational';
  body: string;
  /** Marker on the schematic map, in map units (0–100). */
  at: readonly [number, number];
}

export const SITES: readonly SiteInfo[] = [
  {
    code: 'LC-1',
    name: 'Brackwater',
    role: 'Orbital pad',
    state: 'Active',
    body: 'A spit between the bay and the open sea. Tower, mount, tank farm and a small yard. Where every campaign starts.',
    at: [70, 58],
  },
  {
    code: 'LC-2',
    name: 'Cobble Reach',
    role: 'Second pad',
    state: 'Under construction',
    body: 'Three kilometres up the coast. Finishing it doubles pad availability, so cadence can beat pad refurbishment.',
    at: [76, 22],
  },
  {
    code: 'TS-1',
    name: 'Flint Hollow',
    role: 'Test stand',
    state: 'Operational',
    body: 'Static fires and hops in a dune hollow. Boosters that pass a test campaign lose fewer engines.',
    at: [44, 40],
  },
  {
    code: 'BY-1',
    name: 'Kilnmoor Works',
    role: 'Build yard',
    state: 'Operational',
    body: 'An old brickworks six kilometres inland. High bays, a mega bay, and road convoys to the pads.',
    at: [18, 70],
  },
];

export const BUILT = [
  [
    'Assets are code',
    'Every tower, booster, tanker and boat is a Python script run headless in Blender, exported to glTF, optimised and loaded in three.js. No hand-made binary.',
    'blender -b -P tower.py',
  ],
  [
    'A deterministic world',
    'A fixed-step simulation runs the whole site at 30 Hz. Same seed, same launch, to the tick. Time compression means more steps, never bigger ones.',
    'sim @ 30 Hz · seed 42',
  ],
  [
    'A printed control room',
    'Paper, ink and one signal orange. Monospace telemetry, a few huge numbers. The 3D world uses the same tokens as the interface.',
    '1 accent · radius 0',
  ],
] as const;

export const CREDIT = 'Developed by CM Interactive. A division of Cardor Media.';
