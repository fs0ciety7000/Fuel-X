// MVP site layout: BRACKWATER LC-1 (GDD §13.1). Data only.
//
// Frame: site-local, right-handed, Y-up, metres — identical to glTF/three (ARCHITECTURE §6):
// X = east, Y = up, Z = south. OLM-1 sits at the origin. Open sea lies east (coast ≈ x +400 m),
// the bay west; the yard is on the spit west of the pad. `headingRad` is a compass heading
// (0 = north = −Z, π/2 = east = +X). Assets face glTF +Z, i.e. heading π with no rotation.
import type { SiteId } from './names';

export type EntityKind =
  | 'booster'
  | 'ship'
  | 'tower'
  | 'pad'
  | 'tank'
  | 'tanker'
  | 'transporter'
  | 'crane'
  | 'van'
  | 'boat'
  | 'wxStation'
  | 'building';

/** Asset classes from ASSETS_GUIDE §2 (lower-case = generated wrapper key). */
export type AssetKey =
  | 'tower'
  | 'pad'
  | 'booster'
  | 'ship'
  | 'tank_v'
  | 'tank_h'
  | 'tank_sphere'
  | 'tanker'
  | 'transporter'
  | 'van'
  | 'boat_range'
  | 'vessel_recovery'
  | 'wx_station'
  | 'bldg_highbay'
  | 'bldg_megabay'
  | 'hangar_tent'
  | 'crane';

export interface V3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Placement {
  readonly callSign: string;
  readonly kind: EntityKind;
  readonly asset: AssetKey;
  /** Start position, m. Off-map units (tankers) start at `points.offMapEntry`. */
  readonly pos: V3;
  readonly headingRad: number;
}

export interface SitePath {
  /** Polyline vertices, m. */
  readonly points: readonly V3[];
  /** Closed loop (patrols): the last vertex connects back to the first. */
  readonly closed: boolean;
}

const v = (x: number, y: number, z: number): V3 => ({ x, y, z });
const N = 0;
const E = Math.PI / 2;
const S = Math.PI;
const W = (3 * Math.PI) / 2;

/** Named points, m. */
const points = {
  /** OLM-1 launch mount centre (origin). */
  olm1: v(0, 0, 0),
  /** Booster catch point above the mount (flightProfile CATCH altitude). */
  catchPoint: v(0, 60, 0),
  /** SP-41 pickup bay in the yard (CR-77 loads stages here). */
  yardPickup: v(-1_340, 0, 460),
  /** Road gate on the hazard radius: tankers wait here (GATE_WAIT) during road closure. */
  tankerGate: v(-3_100, 0, 60),
  /** Where off-map tankers appear/disappear (supplier is abstracted). */
  offMapEntry: v(-6_000, 0, 60),
  loxOffloadBay: v(-300, 0, 140),
  ch4OffloadBay: v(-380, 0, 140),
  /** Crew safe area, outside the hazard radius. */
  crewSafeArea: v(-3_400, 0, 300),
  /** Crew van parking at the pad. */
  crewPadParking: v(-80, 0, 120),
  picketDock: v(600, 0, 2_500),
  /** Booster divert / offshore splashdown aim point = RV-1 holding station (8 km offshore). */
  divertPoint: v(8_000, 0, 0),
} as const;

const placements: readonly Placement[] = [
  // Pad
  { callSign: 'OLM-1', kind: 'pad', asset: 'pad', pos: points.olm1, headingRad: S },
  /** Mount centre is 26 m in front (+Z) of the tower origin (ASSETS_GUIDE §2). */
  { callSign: 'TOWER-1', kind: 'tower', asset: 'tower', pos: v(0, 0, -26), headingRad: S },
  // Tank farm
  { callSign: 'LOX-1', kind: 'tank', asset: 'tank_v', pos: v(-300, 0, 200), headingRad: S },
  { callSign: 'LOX-2', kind: 'tank', asset: 'tank_v', pos: v(-300, 0, 230), headingRad: S },
  { callSign: 'LOX-3', kind: 'tank', asset: 'tank_v', pos: v(-300, 0, 260), headingRad: S },
  { callSign: 'CH4-1', kind: 'tank', asset: 'tank_v', pos: v(-380, 0, 200), headingRad: S },
  { callSign: 'CH4-2', kind: 'tank', asset: 'tank_v', pos: v(-380, 0, 230), headingRad: S },
  { callSign: 'LN2-1', kind: 'tank', asset: 'tank_sphere', pos: v(-460, 0, 220), headingRad: S },
  // Yard
  { callSign: 'HB-1', kind: 'building', asset: 'bldg_highbay', pos: v(-1_400, 0, 560), headingRad: E },
  { callSign: 'TH-1', kind: 'building', asset: 'hangar_tent', pos: v(-1_460, 0, 380), headingRad: E },
  { callSign: 'B-09', kind: 'booster', asset: 'booster', pos: v(-1_380, 0, 470), headingRad: S },
  { callSign: 'S-21', kind: 'ship', asset: 'ship', pos: v(-1_380, 0, 520), headingRad: S },
  { callSign: 'SP-41', kind: 'transporter', asset: 'transporter', pos: points.yardPickup, headingRad: N },
  { callSign: 'SP-42', kind: 'transporter', asset: 'transporter', pos: v(-1_300, 0, 420), headingRad: N },
  { callSign: 'CR-77', kind: 'crane', asset: 'crane', pos: v(-1_320, 0, 500), headingRad: W },
  // Tankers (start off-map)
  { callSign: 'LX-01', kind: 'tanker', asset: 'tanker', pos: points.offMapEntry, headingRad: E },
  { callSign: 'LX-02', kind: 'tanker', asset: 'tanker', pos: points.offMapEntry, headingRad: E },
  { callSign: 'LX-03', kind: 'tanker', asset: 'tanker', pos: points.offMapEntry, headingRad: E },
  { callSign: 'LX-04', kind: 'tanker', asset: 'tanker', pos: points.offMapEntry, headingRad: E },
  { callSign: 'MX-01', kind: 'tanker', asset: 'tanker', pos: points.offMapEntry, headingRad: E },
  { callSign: 'MX-02', kind: 'tanker', asset: 'tanker', pos: points.offMapEntry, headingRad: E },
  // Crew vans (at the pad at scenario start)
  { callSign: 'CV-01', kind: 'van', asset: 'van', pos: v(-80, 0, 120), headingRad: W },
  { callSign: 'CV-02', kind: 'van', asset: 'van', pos: v(-80, 0, 130), headingRad: W },
  { callSign: 'CV-03', kind: 'van', asset: 'van', pos: v(-80, 0, 140), headingRad: W },
  // Sea
  { callSign: 'PK-03', kind: 'boat', asset: 'boat_range', pos: v(2_500, 0, -1_500), headingRad: E },
  { callSign: 'PK-04', kind: 'boat', asset: 'boat_range', pos: v(2_500, 0, 1_500), headingRad: E },
  { callSign: 'RV-1', kind: 'boat', asset: 'vessel_recovery', pos: points.divertPoint, headingRad: N },
  // Weather
  { callSign: 'WX-1', kind: 'wxStation', asset: 'wx_station', pos: v(-150, 0, -300), headingRad: N },
  { callSign: 'WX-2', kind: 'wxStation', asset: 'wx_station', pos: v(-1_200, 0, 900), headingRad: N },
];

const paths = {
  /** SP-41 yard pickup → OLM-1; length = logistics.routeYardToPadM (1 800 m). */
  'sp.yardToOlm1': {
    points: [points.yardPickup, v(-1_340, 0, 60), v(0, 0, 60), points.olm1],
    closed: false,
  },
  'sp.olm1ToYard': {
    points: [points.olm1, v(0, 0, 60), v(-1_340, 0, 60), points.yardPickup],
    closed: false,
  },
  /** Inbound tankers end at the gate; GATE_WAIT happens at the last vertex. */
  'tanker.offMapToGate': { points: [points.offMapEntry, points.tankerGate], closed: false },
  'tanker.gateToLoxBay': {
    points: [points.tankerGate, v(-300, 0, 60), points.loxOffloadBay],
    closed: false,
  },
  'tanker.gateToCh4Bay': {
    points: [points.tankerGate, v(-380, 0, 60), points.ch4OffloadBay],
    closed: false,
  },
  'tanker.loxBayToOffMap': {
    points: [points.loxOffloadBay, v(-300, 0, 60), points.offMapEntry],
    closed: false,
  },
  'tanker.ch4BayToOffMap': {
    points: [points.ch4OffloadBay, v(-380, 0, 60), points.offMapEntry],
    closed: false,
  },
  'cv.padToSafe': {
    points: [points.crewPadParking, v(-80, 0, 60), v(-3_400, 0, 60), points.crewSafeArea],
    closed: false,
  },
  'cv.safeToPad': {
    points: [points.crewSafeArea, v(-3_400, 0, 60), v(-80, 0, 60), points.crewPadParking],
    closed: false,
  },
  /** PICKET patrol loops over the maritime hazard area (north and south halves). */
  'pk03.patrol': {
    points: [v(2_500, 0, -1_500), v(6_000, 0, -1_500), v(6_000, 0, -5_000), v(2_500, 0, -5_000)],
    closed: true,
  },
  'pk04.patrol': {
    points: [v(2_500, 0, 1_500), v(6_000, 0, 1_500), v(6_000, 0, 5_000), v(2_500, 0, 5_000)],
    closed: true,
  },
} satisfies Record<string, SitePath>;

export type Lc1PathId = keyof typeof paths;

export const lc1Layout = {
  siteId: 'LC-1' satisfies SiteId,
  points,
  placements,
  paths,
  /** Maritime hazard area (AREA BRAVO) polygon on the sea surface, m. */
  maritimeHazardArea: [v(500, 0, -6_000), v(10_000, 0, -6_000), v(10_000, 0, 6_000), v(500, 0, 6_000)],
};
