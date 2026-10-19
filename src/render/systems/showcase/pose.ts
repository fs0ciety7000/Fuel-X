// Showcase stage choreography (docs/SHOWCASE.md §3): story progress p → entity transforms, tower mechanisms and
// camera. Pure and allocation-free so it runs every frame and is unit-tested. World frame = LC-1 site metres
// (src/data/site-lc1.ts): OLM-1 at the origin, TOWER-1 at z −26, sea toward +x, road toward +z.
// Heights from src/data/siteGeometry.ts; this is a film of the launch, not the sim (no physics, no RNG).
import { siteGeometry } from '@data/siteGeometry';
import { tower } from '@data/tower';

const MOUNT_Y = siteGeometry.pad.vehicleMountM; // 20
const CARGO_Y = siteGeometry.transporter.cargoM; // 4.6
const PIN = siteGeometry.booster.catchPinM; // 66
const SHIP_ON_STACK = MOUNT_Y + siteGeometry.booster.shipMountM; // 91
const CATCH_CARRIAGE = siteGeometry.tower.catchCarriageM; // 126
const CATCH_Y = CATCH_CARRIAGE - PIN; // 60
const OPEN = tower.arms.openRad;
const QD = tower.qdArm.engagedRad;
const ROAD_Z = 260;

export interface Vec {
  x: number;
  y: number;
  z: number;
}

export interface Pose {
  transporter: Vec;
  /** Transporter heading, rad about +y (0 = facing +z). */
  transporterYaw: number;
  booster: Vec;
  boosterVisible: boolean;
  ship: Vec;
  shipVisible: boolean;
  /** TOWER_Carriage height, m (contract value, rest 86). */
  carriageM: number;
  /** Arm opening, rad (0 closed … OPEN). ArmL takes +, ArmR −. */
  armsRad: number;
  qdRad: number;
  /** Booster exhaust: 0 off … 1 full liftoff thrust. */
  thrust: number;
  /** Landing burn exhaust (3 engines), 0 … 1. */
  landing: number;
  /** Ground steam cloud at liftoff, 0 … 1 (expansion), and its fade 0 … 1. */
  steam: number;
  camera: Vec;
  target: Vec;
}

export function createPose(): Pose {
  const v = (): Vec => ({ x: 0, y: 0, z: 0 });
  return {
    transporter: v(),
    transporterYaw: 0,
    booster: v(),
    boosterVisible: true,
    ship: v(),
    shipVisible: false,
    carriageM: tower.carriage.restM,
    armsRad: OPEN,
    qdRad: 0,
    thrust: 0,
    landing: 0,
    steam: 0,
    camera: v(),
    target: v(),
  };
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
/** 0 → 1 across [a, b], smoothstep eased (mechanical: no overshoot). */
export const ease = (p: number, a: number, b: number): number => {
  const t = clamp01((p - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lin = (p: number, a: number, b: number): number => clamp01((p - a) / (b - a));
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const set = (o: Vec, x: number, y: number, z: number): void => {
  o.x = x;
  o.y = y;
  o.z = z;
};

/** Camera keys: p, eye, target, and how much the target follows the booster (0 fixed … 1 booster + offset). */
type Key = readonly [
  p: number,
  eye: readonly [number, number, number],
  at: readonly [number, number, number],
  follow: number,
];
const KEYS: readonly Key[] = [
  [0, [-300, 175, 430], [0, 55, 10], 0],
  [0.14, [-170, 70, 300], [0, 22, 90], 0],
  [0.22, [-120, 55, 150], [0, 40, 0], 0],
  [0.3, [-120, 140, 150], [0, 110, -6], 0],
  [0.4, [-125, 48, 125], [0, 62, -6], 0],
  [0.49, [-160, 16, 175], [0, 72, 0], 0],
  [0.56, [-230, 25, 270], [0, 60, 0], 1],
  [0.63, [-300, 50, 320], [0, 420, 0], 0],
  [0.71, [-190, 130, 215], [0, 0, 0], 1],
  [0.79, [-175, 120, 180], [0, 88, -8], 0],
  [0.9, [-210, 130, 270], [0, 70, -6], 0],
  [1, [-430, 260, 560], [0, 45, 30], 0],
];

const FOLLOW_OFFSET_Y = 40;

function camera(p: number, booster: Vec, out: Pose): void {
  let i = 1;
  while (i < KEYS.length - 1 && p > (KEYS[i] as Key)[0]) i += 1;
  const [p0, e0, a0, f0] = KEYS[i - 1] as Key;
  const [p1, e1, a1, f1] = KEYS[i] as Key;
  const t = ease(p, p0, p1);
  set(out.camera, mix(e0[0], e1[0], t), mix(e0[1], e1[1], t), mix(e0[2], e1[2], t));
  const follow = mix(f0, f1, t);
  const fx = mix(a0[0], a1[0], t);
  const fy = mix(a0[1], a1[1], t);
  const fz = mix(a0[2], a1[2], t);
  set(out.target, mix(fx, booster.x, follow), mix(fy, booster.y + FOLLOW_OFFSET_Y, follow), mix(fz, booster.z, follow));
}

/** Writes the stage pose for story progress `p` into `out`. */
export function stagePose(p: number, out: Pose): Pose {
  // §02 Rollout: SP-41 brings B-09 down the road onto the mount axis (0.10 → 0.20), then leaves (0.28 → 0.33).
  const inbound = ease(p, 0.1, 0.2);
  const outbound = ease(p, 0.28, 0.33);
  set(out.transporter, 0, 0, mix(ROAD_Z, 0, inbound) + outbound * ROAD_Z);
  out.transporterYaw = 0;

  // §02 Stack: arms take the booster from the deck (4.6) up to the mount (20), 0.22 → 0.27.
  const lift = ease(p, 0.22, 0.27);
  let by = mix(CARGO_Y, MOUNT_Y, lift);
  let carriage = mix(CARGO_Y + PIN, MOUNT_Y + PIN, lift);
  if (p < 0.2) carriage = mix(tower.carriage.restM, CARGO_Y + PIN, ease(p, 0.15, 0.2));
  let arms = p < 0.205 ? OPEN : p < 0.27 ? OPEN * (1 - ease(p, 0.205, 0.22)) : OPEN * ease(p, 0.27, 0.28);
  // Ship: lowered onto the booster from above the tower top (0.29 → 0.33); the arms take its lift pins on the way
  // down (carriage = ship pins, a little over its contract travel at the very top), release, then open.
  const SHIP_FROM = SHIP_ON_STACK + 70;
  const descent = ease(p, 0.29, 0.33);
  const shipY = mix(SHIP_FROM, SHIP_ON_STACK, descent);
  if (p >= 0.28) {
    const pins = shipY + siteGeometry.ship.liftPinM;
    const top = tower.carriage.maxM + 12;
    carriage = mix(MOUNT_Y + PIN, Math.min(pins, top), ease(p, 0.28, 0.29));
    if (p >= 0.29) carriage = Math.min(pins, top);
    arms = pins > top + 1 ? OPEN : p < 0.335 ? 0 : OPEN * ease(p, 0.335, 0.345);
  }
  out.shipVisible = p >= 0.285 && p < 0.62;
  set(out.ship, 0, shipY, 0);

  // §03 Count down: QD arm engages (0.34 → 0.36), retracts in the last seconds (0.493 → 0.499).
  out.qdRad = QD * (ease(p, 0.34, 0.36) - ease(p, 0.493, 0.499));

  // §04 Fly: liftoff at 0.5; the stack climbs out of frame by 0.6.
  const climb = lin(p, 0.5, 0.6);
  const rise = 1300 * climb ** 2.2;
  if (p >= 0.5) {
    by = MOUNT_Y + rise;
    out.ship.y = SHIP_ON_STACK + rise;
  }
  if (p >= 0.33 && p < 0.5) out.ship.y = SHIP_ON_STACK;
  out.thrust = p < 0.497 ? 0 : p < 0.5 ? lin(p, 0.497, 0.5) : p < 0.6 ? 1 : 0;
  out.steam = lin(p, 0.497, 0.56) * (1 - lin(p, 0.58, 0.64));
  if (p >= 0.6) {
    carriage = mix(tower.carriage.maxM, CATCH_CARRIAGE, ease(p, 0.6, 0.64));
    arms = OPEN;
  }

  // §05 Recover: boostback brings B-09 back over the tower; landing burn 0.7 → 0.78; arms close 0.776 → 0.8.
  out.boosterVisible = p < 0.6 || p >= 0.64;
  if (p >= 0.64) {
    const s = lin(p, 0.64, 0.78);
    by = CATCH_Y + 840 * (1 - s) ** 2;
    out.landing = p >= 0.7 && p < 0.785 ? 1 - lin(p, 0.775, 0.785) : 0;
    arms = OPEN * (1 - ease(p, 0.776, 0.8));
  } else {
    out.landing = 0;
  }
  // Until the arms take it, B-09 rides the transporter deck.
  set(out.booster, 0, by, p < 0.22 ? out.transporter.z : 0);
  out.carriageM = carriage;
  out.armsRad = arms;

  camera(p, out.booster, out);
  return out;
}

/** Exposed for tests and the stage (catch geometry). */
export const STAGE = { MOUNT_Y, CARGO_Y, SHIP_ON_STACK, CATCH_Y, CATCH_CARRIAGE, ROAD_Z, OPEN } as const;
