// Per-tick animation channels and visual pose refinements for the RenderSnapshot (5.4, ARCHITECTURE §6).
// Sim fields drive a channel directly where they exist (tower carriage / arms / QD, engines lit, crane task,
// transporter cargo, wind); everything the sim does not model is derived here from motion, deterministically per
// tick (never from the wall clock), so screenshots and jumps are reproducible:
//   - ground vehicles / boats: the sim turns instantly at path vertices → the drawn yaw is rate-limited (the
//     transporter may drive in reverse instead of spinning 180°); speed, yaw rate, wheel spin, bogie steer, tanker
//     steer and the trailer (kinematic follower) come from that motion.
//   - stages: gimbal and grid fins from the filtered lateral acceleration; flaps from the flight state.
//   - CR-77: slew / luff / hook choreography from the lift task progress; the stage hangs from the hook.
//   - TOWER-1 stacking: the stage rises from the transporter stand to the mount / booster top with task progress.
// What the sim should eventually expose instead is listed in docs/TASKS.md (5.4 notes).
import { vehicles } from '@data/index';
import { DT_S } from '@sim/index';
import type { Entity, EntityOf, Id, Quat, Vec3, World } from '@sim/types';
import { ANIM, ANIM_STRIDE } from '@render/snapshot';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** PAD `SOCKET_VehicleMount` height and TRANSPORTER `SOCKET_Cargo` rest height, m (ASSETS_GUIDE §4; RenderSync
 *  reads the same sockets from the GLBs and adds them for ON_MOUNT / ON_CARGO stages). */
export const MOUNT_LIFT_M = 20;
export const CARGO_LIFT_M = 4.6;

/** CRANE geometry in its root frame (ASSETS_GUIDE §4 CRANE as built): boom foot, boom length, luff and hook range. */
export const CRANE_GEOM = {
  footY: 4.6,
  footZ: 3.2,
  boomM: 96,
  luffMin: 20 * DEG,
  luffMax: 85 * DEG,
  luffRest: 70 * DEG,
  hookMin: -90,
  hookMax: -2,
  hookRest: -30,
  /** SOCKET_Hook is 2 m under the hook pin. */
  socketBelowM: 2,
} as const;

interface MoverSpec {
  /** Max drawn yaw rate, rad/s. */
  yawRate: number;
  /** May drive backwards instead of turning around (SPMT). */
  reverse: boolean;
  /** Wheel radius, m (0 = no wheels). */
  wheelR: number;
}

const MOVERS: Partial<Record<string, MoverSpec>> = {
  transporter: { yawRate: 10 * DEG, reverse: true, wheelR: 0.45 },
  tanker: { yawRate: 25 * DEG, reverse: false, wheelR: 0.5 },
  van: { yawRate: 60 * DEG, reverse: false, wheelR: 0 },
  boat_range: { yawRate: 8 * DEG, reverse: false, wheelR: 0 },
  vessel_recovery: { yawRate: 4 * DEG, reverse: false, wheelR: 0 },
};

/** TANKER geometry: tractor wheelbase (steer axle → drive axle) and king pin → trailer bogie centre, m. */
const TANKER_WHEELBASE_M = 3.9;
const TANKER_TRAILER_M = 13.3;
const TANKER_STEER_MAX = 35 * DEG;
const TANKER_TRAILER_MAX = 70 * DEG;
const DECK_RAISED_M = 0.6;
const DECK_RATE_MPS = 0.1;
/** Radar periods, s per turn. */
const RADAR_PERIOD_S = { boat_range: 2.5, vessel_recovery: 3.2 } as const;
/** Anemometer: cup-arm radius, m, and cup efficiency (rotor tip speed / wind speed). */
const ANEMO_R_M = 0.35;
const ANEMO_EFF = 0.35;
/** The sim has no wind direction yet: prevailing onshore sea breeze from the east (compass, rad). */
export const WIND_FROM_RAD = 95 * DEG;

/** A move longer than this in one tick is a teleport (same rule as the snapshot writer). */
export const TELEPORT_M = 250;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const wrapPi = (a: number): number => a - TAU * Math.round(a / TAU);
const wrapTau = (a: number): number => ((a % TAU) + TAU) % TAU;
const smooth = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
/** Moves `v` toward `target` by at most `rate·DT`. */
const approach = (v: number, target: number, rate: number): number => {
  const d = target - v;
  const s = rate * DT_S;
  return Math.abs(d) <= s ? target : v + Math.sign(d) * s;
};

/** Rotation angle about +Y of a quaternion (three's yaw: CCW seen from above; asset forward = +Z at 0). */
export function yawOf(q: Quat): number {
  return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
}

export function quatFromYaw(yaw: number): Quat {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

/** World point → asset local (x, z) of a body at `origin` with yaw `yaw`. */
function toLocal(p: Vec3, origin: Vec3, yaw: number): { x: number; z: number } {
  const dx = p.x - origin.x;
  const dz = p.z - origin.z;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  // inverse rotation about +Y: x' = c·x − s·z, z' = s·x + c·z
  return { x: c * dx - s * dz, z: s * dx + c * dz };
}

// --- Crane ------------------------------------------------------------------------------------------

export interface CranePose {
  slew: number;
  luff: number;
  hook: number;
}

const CRANE_REST: CranePose = { slew: 0, luff: CRANE_GEOM.luffRest, hook: CRANE_GEOM.hookRest };

/** Boom tip (height, forward reach) in the upper frame for a luff angle. */
export function craneTip(luff: number): { y: number; z: number } {
  return {
    y: CRANE_GEOM.footY + CRANE_GEOM.boomM * Math.sin(luff),
    z: CRANE_GEOM.footZ + CRANE_GEOM.boomM * Math.cos(luff),
  };
}

/** SOCKET_Hook in world space for a crane pose. */
export function craneHookWorld(crane: { pos: Vec3; rot: Quat }, pose: CranePose): Vec3 {
  const tip = craneTip(pose.luff);
  const a = yawOf(crane.rot) + pose.slew;
  return {
    x: crane.pos.x + Math.sin(a) * tip.z,
    y: crane.pos.y + tip.y + pose.hook - CRANE_GEOM.socketBelowM,
    z: crane.pos.z + Math.cos(a) * tip.z,
  };
}

/** Slew + luff putting the tip over `p`, hook such that SOCKET_Hook sits at height `hookY` (all clamped). */
function aimCrane(crane: { pos: Vec3; rot: Quat }, p: Vec3, hookY: number): CranePose {
  const l = toLocal(p, crane.pos, yawOf(crane.rot));
  const r = Math.hypot(l.x, l.z);
  const luff = Math.acos(clamp((r - CRANE_GEOM.footZ) / CRANE_GEOM.boomM, Math.cos(CRANE_GEOM.luffMax), 1));
  const lf = clamp(luff, CRANE_GEOM.luffMin, CRANE_GEOM.luffMax);
  const hook = clamp(hookY + CRANE_GEOM.socketBelowM - crane.pos.y - craneTip(lf).y, CRANE_GEOM.hookMin, CRANE_GEOM.hookMax);
  return { slew: Math.atan2(l.x, l.z), luff: lf, hook };
}

function mixPose(a: CranePose, b: CranePose, t: number): CranePose {
  const e = smooth(t);
  return {
    slew: a.slew + wrapPi(b.slew - a.slew) * e,
    luff: a.luff + (b.luff - a.luff) * e,
    hook: a.hook + (b.hook - a.hook) * e,
  };
}

/** Lift choreography keyframes, as fractions of the crane task. The stage hangs between HANG_FROM and HANG_TO. */
const LIFT = { reach: 0.15, lift: 0.25, carry: 0.7, set: 0.85, release: 0.92 } as const;
const LIFT_CLEAR_M = 8;

export interface CraneRig {
  pose: CranePose;
  /** Stage carried this tick and where its origin is (absolute, y included), or null. */
  hang: { stageId: Id; pos: Vec3 } | null;
}

/** Pure function of the world: CR-77 pose for its lift task progress (rest when idle). */
export function craneRig(world: World, crane: EntityOf<'crane'>): CraneRig {
  const task = crane.task;
  if (crane.fsm.state !== 'LIFTING' || !task) return { pose: CRANE_REST, hang: null };
  const stage = world.entities.byId[task.stageId];
  const prep = Object.values(world.prep).find((p) => p.craneId === crane.id);
  const sp = prep ? world.entities.byId[prep.transporterId] : undefined;
  if (!stage || (stage.kind !== 'booster' && stage.kind !== 'ship') || !sp) return { pose: CRANE_REST, hang: null };
  const h = vehicles[stage.kind].heightM;
  const p = task.durationTicks > 0 ? task.elapsedTicks / task.durationTicks : 1;
  const pick = aimCrane(crane, stage.pos, stage.pos.y + h);
  const setDown = { x: sp.pos.x, y: sp.pos.y + CARGO_LIFT_M, z: sp.pos.z };
  const place = aimCrane(crane, setDown, setDown.y + h);
  const pickUp = { ...pick, hook: Math.min(CRANE_GEOM.hookMax, pick.hook + LIFT_CLEAR_M) };
  const placeUp = { ...place, hook: Math.min(CRANE_GEOM.hookMax, place.hook + LIFT_CLEAR_M) };
  let pose: CranePose;
  if (p < LIFT.reach) pose = mixPose(CRANE_REST, pick, p / LIFT.reach);
  else if (p < LIFT.lift) pose = mixPose(pick, pickUp, (p - LIFT.reach) / (LIFT.lift - LIFT.reach));
  else if (p < LIFT.carry) pose = mixPose(pickUp, placeUp, (p - LIFT.lift) / (LIFT.carry - LIFT.lift));
  else if (p < LIFT.set) pose = mixPose(placeUp, place, (p - LIFT.carry) / (LIFT.set - LIFT.carry));
  else if (p < LIFT.release) pose = mixPose(place, placeUp, (p - LIFT.set) / (LIFT.release - LIFT.set));
  else pose = mixPose(placeUp, CRANE_REST, (p - LIFT.release) / (1 - LIFT.release));
  let hang: CraneRig['hang'] = null;
  if (p >= LIFT.reach && p < LIFT.set) {
    const hk = craneHookWorld(crane, pose);
    hang = { stageId: stage.id, pos: { x: hk.x, y: hk.y - h, z: hk.z } };
  } else if (p >= LIFT.set) {
    hang = { stageId: stage.id, pos: setDown };
  }
  return { pose, hang };
}

// --- Per-entity derived state -------------------------------------------------------------------------

interface Mover {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  yawRate: number;
  wheel: number;
  /** Absolute trailer yaw (tanker). */
  trailerYaw: number;
  steer: number;
  deck: number;
}

interface StageState {
  vx: number;
  vy: number;
  vz: number;
  /** Filtered acceleration, m/s². */
  ax: number;
  az: number;
  lastX: number;
  lastY: number;
  lastZ: number;
  gimbalP: number;
  gimbalY: number;
  finA: number;
  finB: number;
  flapF: number;
  flapA: number;
  /** Absolute drawn height of the origin last tick (incl. mount / cargo lifts), m. */
  absY: number;
  stackFromY: number | null;
  init: boolean;
}

interface PadState {
  clamps: number;
  bqd: number;
}

export interface PoseOut {
  x: number;
  y: number;
  z: number;
  q: Quat;
}

const GROUND_STATES: ReadonlySet<string> = new Set([
  'IN_YARD',
  'ON_TRANSPORTER',
  'STACKING',
  'STACKED',
  'LOADING',
  'LOADED',
  'DETANKING',
]);
const FLOWN = new Set(['ASCENT', 'BOOSTBACK', 'DESCENT', 'CAUGHT_SAFING', 'DIVERTED', 'LOST']);
const ON_PAD = new Set(['STACKED', 'LOADING', 'LOADED', 'DETANKING']);

export class AnimWriter {
  private movers = new Map<Id, Mover>();
  private stages = new Map<Id, StageState>();
  private pads = new Map<Id, PadState>();
  private wheels = new Map<Id, number>();
  private cranes = new Map<Id, CraneRig>();

  reset(): void {
    this.movers.clear();
    this.stages.clear();
    this.pads.clear();
    this.wheels.clear();
    this.cranes.clear();
  }

  /** Pass 1 (every entity, before any pose is written): motion state of movers and cranes. */
  update(world: World, e: Entity, snap: boolean): void {
    if (e.kind === 'crane') {
      this.cranes.set(e.id, craneRig(world, e));
      return;
    }
    const spec = MOVERS[e.asset];
    if (!spec) return;
    let m = this.movers.get(e.id);
    const simYaw = yawOf(e.rot);
    if (!m || snap || Math.abs(e.pos.x - m.x) + Math.abs(e.pos.z - m.z) > TELEPORT_M) {
      m = { x: e.pos.x, z: e.pos.z, yaw: simYaw, speed: 0, yawRate: 0, wheel: m?.wheel ?? 0, trailerYaw: simYaw, steer: 0, deck: m?.deck ?? 0 };
      this.movers.set(e.id, m);
    } else {
      let target = simYaw;
      if (spec.reverse && Math.abs(wrapPi(simYaw - m.yaw)) > Math.PI / 2) target = simYaw + Math.PI;
      const dYaw = clamp(wrapPi(target - m.yaw), -spec.yawRate * DT_S, spec.yawRate * DT_S);
      m.yaw = wrapPi(m.yaw + dYaw);
      m.yawRate = dYaw / DT_S;
      const dx = e.pos.x - m.x;
      const dz = e.pos.z - m.z;
      m.speed = (dx * Math.sin(m.yaw) + dz * Math.cos(m.yaw)) / DT_S;
      m.x = e.pos.x;
      m.z = e.pos.z;
      if (spec.wheelR > 0) m.wheel = wrapTau(m.wheel + (m.speed * DT_S) / spec.wheelR);
      if (e.kind === 'tanker') {
        // kinematic trailer pulled at the king pin: dψt/dt = v/L · sin(ψ − ψt)
        m.trailerYaw += ((m.speed / TANKER_TRAILER_M) * Math.sin(m.yaw - m.trailerYaw)) * DT_S;
        const rel = clamp(wrapPi(m.trailerYaw - m.yaw), -TANKER_TRAILER_MAX, TANKER_TRAILER_MAX);
        m.trailerYaw = m.yaw + rel;
        const want = Math.abs(m.speed) > 0.3 ? Math.atan((TANKER_WHEELBASE_M * m.yawRate) / m.speed) : 0;
        m.steer = approach(m.steer, clamp(want, -TANKER_STEER_MAX, TANKER_STEER_MAX), 40 * DEG);
      }
    }
    if (e.kind === 'transporter') m.deck = approach(m.deck, e.cargo ? DECK_RAISED_M : 0, DECK_RATE_MPS);
  }

  /** Transporter carrying `stageId`, if any. */
  private carrier(world: World, stageId: Id): EntityOf<'transporter'> | null {
    for (const id of world.entities.order) {
      const t = world.entities.byId[id];
      if (t?.kind === 'transporter' && t.cargo === stageId) return t;
    }
    return null;
  }

  private stageStackTask(world: World, stageId: Id): { p: number } | null {
    for (const id of world.entities.order) {
      const t = world.entities.byId[id];
      if (t?.kind === 'tower' && t.task?.stageId === stageId && t.fsm.state !== 'IDLE') {
        return { p: t.task.durationTicks > 0 ? t.task.elapsedTicks / t.task.durationTicks : 1 };
      }
    }
    return null;
  }

  /**
   * Pass 2: pose refinements (`out` holds the sim pose on entry) and the channels for `e` into `anim` at offset
   * `o`. `flags` are the render flags already chosen for the slot (ON_MOUNT / ON_CARGO lifts are added by render).
   */
  write(world: World, e: Entity, out: PoseOut, anim: Float32Array, o: number, onMount: boolean, onCargo: boolean): void {
    for (let k = 0; k < ANIM_STRIDE; k++) anim[o + k] = 0;
    const t = world.tick * DT_S;
    const m = this.movers.get(e.id);
    if (m) out.q = quatFromYaw(m.yaw);
    switch (e.kind) {
      case 'tower': {
        const c = ANIM.tower;
        anim[o + c.carriageM] = e.carriageM;
        anim[o + c.armLRad] = e.armLRad;
        anim[o + c.armRRad] = e.armRRad;
        anim[o + c.qdArmRad] = e.qdArmRad;
        return;
      }
      case 'pad': {
        const b = e.boosterId ? world.entities.byId[e.boosterId] : undefined;
        const st = b?.kind === 'booster' ? b.fsm.state : null;
        let s = this.pads.get(e.id);
        if (!s) {
          s = { clamps: 0, bqd: -1.5 };
          this.pads.set(e.id, s);
        }
        s.clamps = approach(s.clamps, st && FLOWN.has(st) ? -0.8 : 0, 0.4);
        s.bqd = approach(s.bqd, st && ON_PAD.has(st) ? 0 : -1.5, 0.5);
        anim[o + ANIM.pad.clampsM] = s.clamps;
        anim[o + ANIM.pad.bqdM] = s.bqd;
        return;
      }
      case 'booster':
      case 'ship':
        this.writeStage(world, e, out, anim, o, onMount, onCargo, t);
        return;
      case 'transporter': {
        const c = ANIM.transporter;
        if (!m) return;
        anim[o + c.deckM] = m.deck;
        anim[o + c.yawRateRadPerS] = m.yawRate;
        anim[o + c.speedMPerS] = m.speed;
        anim[o + c.wheelRad] = m.wheel;
        return;
      }
      case 'tanker': {
        if (!m) return;
        anim[o + ANIM.tanker.steerRad] = m.steer;
        anim[o + ANIM.tanker.trailerRad] = wrapPi(m.trailerYaw - m.yaw);
        anim[o + ANIM.tanker.axleRad] = m.wheel;
        return;
      }
      case 'crane': {
        const r = this.cranes.get(e.id) ?? craneRig(world, e);
        anim[o + ANIM.crane.slewRad] = r.pose.slew;
        anim[o + ANIM.crane.luffRad] = r.pose.luff;
        anim[o + ANIM.crane.hookM] = r.pose.hook;
        return;
      }
      case 'boat': {
        if (e.asset === 'boat_range' || e.asset === 'vessel_recovery') {
          anim[o + 0] = wrapTau((t / RADAR_PERIOD_S[e.asset]) * TAU);
        }
        return;
      }
      case 'wxStation': {
        const w = world.weather;
        // vane points into the wind: local +Z toward the compass heading the wind comes from
        const gustSway = (w.groundGustMPerS - w.groundWindMPerS) * 1.5 * DEG * Math.sin(t * 0.9 + e.slot);
        const worldYaw = Math.atan2(Math.sin(WIND_FROM_RAD), -Math.cos(WIND_FROM_RAD));
        anim[o + ANIM.wx_station.vaneRad] = wrapTau(worldYaw - yawOf(e.rot) + gustSway);
        const prev = this.wheels.get(e.id) ?? 0;
        const next = wrapTau(prev + ((w.groundWindMPerS * ANEMO_EFF) / ANEMO_R_M) * DT_S);
        this.wheels.set(e.id, next);
        anim[o + ANIM.wx_station.anemometerRad] = next;
        return;
      }
      default:
        return;
    }
  }

  private writeStage(
    world: World,
    e: EntityOf<'booster'> | EntityOf<'ship'>,
    out: PoseOut,
    anim: Float32Array,
    o: number,
    onMount: boolean,
    onCargo: boolean,
    t: number,
  ): void {
    let s = this.stages.get(e.id);
    if (!s) {
      s = {
        vx: 0, vy: 0, vz: 0, ax: 0, az: 0, lastX: e.pos.x, lastY: e.pos.y, lastZ: e.pos.z,
        gimbalP: 0, gimbalY: 0, finA: 0, finB: 0, flapF: 45 * DEG, flapA: 45 * DEG,
        absY: e.pos.y, stackFromY: null, init: false,
      };
      this.stages.set(e.id, s);
    }
    const state = e.fsm.state;

    // Pose refinements (positions are absolute here; render adds the mount / cargo socket lift from the flags).
    if (onCargo) {
      const sp = this.carrier(world, e.id);
      const mv = sp ? this.movers.get(sp.id) : undefined;
      if (mv) {
        out.y += mv.deck;
        out.q = quatFromYaw(mv.yaw);
      }
    }
    for (const r of this.cranes.values()) {
      if (r.hang?.stageId === e.id) {
        out.x = r.hang.pos.x;
        out.y = r.hang.pos.y;
        out.z = r.hang.pos.z;
      }
    }
    const stack = state === 'STACKING' ? this.stageStackTask(world, e.id) : null;
    if (stack) {
      s.stackFromY ??= s.absY;
      const final = MOUNT_LIFT_M + (e.kind === 'ship' ? vehicles.booster.heightM : 0);
      // arms close (first 10 %), hoist, settle (last 10 %)
      const y = s.stackFromY + (final - s.stackFromY) * smooth((stack.p - 0.1) / 0.8);
      out.y = y - MOUNT_LIFT_M;
    } else {
      s.stackFromY = null;
    }
    s.absY = out.y + (onMount ? MOUNT_LIFT_M : 0) + (onCargo ? CARGO_LIFT_M : 0);

    // Motion → gimbal / fins (filtered lateral acceleration in the stage frame).
    const vx = (e.pos.x - s.lastX) / DT_S;
    const vy = (e.pos.y - s.lastY) / DT_S;
    const vz = (e.pos.z - s.lastZ) / DT_S;
    s.lastX = e.pos.x;
    s.lastY = e.pos.y;
    s.lastZ = e.pos.z;
    if (s.init && Math.hypot(vx - s.vx, vz - s.vz) < 5_000) {
      const k = DT_S / 1.2;
      s.ax += ((vx - s.vx) / DT_S - s.ax) * k;
      s.az += ((vz - s.vz) / DT_S - s.az) * k;
    }
    s.vx = vx;
    s.vy = vy;
    s.vz = vz;
    s.init = true;
    const local = toLocal({ x: s.ax, y: 0, z: s.az }, { x: 0, y: 0, z: 0 }, yawOf(e.rot));
    const lit = e.engines.lit;
    const total = Math.max(1, e.engines.total);
    const gMax = (e.kind === 'booster' ? 8 : 12) * DEG;
    const wob = Math.sin(t * 1.7 + e.slot) * 0.6 * DEG; // steering chatter while lit
    const wantP = lit > 0 ? clamp(gMax * Math.tanh(local.z / 15) + wob, -gMax, gMax) : 0;
    const wantY = lit > 0 ? clamp(-gMax * Math.tanh(local.x / 15) - wob, -gMax, gMax) : 0;
    s.gimbalP = approach(s.gimbalP, wantP, 10 * DEG);
    s.gimbalY = approach(s.gimbalY, wantY, 10 * DEG);
    const ch = e.kind === 'booster' ? ANIM.booster : ANIM.ship;
    anim[o + ch.litFrac] = lit / total;
    anim[o + ch.gimbalPitchRad] = s.gimbalP;
    anim[o + ch.gimbalYawRad] = s.gimbalY;

    if (e.kind === 'booster') {
      const steering = state === 'BOOSTBACK' || state === 'DESCENT';
      const finMax = 30 * DEG;
      const wantA = steering ? clamp(16 * DEG * Math.sin(t * 0.45) + 10 * DEG * Math.tanh(local.z / 20), -finMax, finMax) : 0;
      const wantB = steering ? clamp(16 * DEG * Math.sin(t * 0.45 + 1.9) - 10 * DEG * Math.tanh(local.x / 20), -finMax, finMax) : 0;
      s.finA = approach(s.finA, wantA, 20 * DEG);
      s.finB = approach(s.finB, wantB, 20 * DEG);
      anim[o + ANIM.booster.finARad] = s.finA;
      anim[o + ANIM.booster.finBRad] = s.finB;
    } else {
      // flaps at the 45° rest on the ground, tucked to 20° for ascent and coast
      const want = GROUND_STATES.has(state) ? 45 * DEG : 20 * DEG;
      s.flapF = approach(s.flapF, want, 15 * DEG);
      s.flapA = approach(s.flapA, want, 15 * DEG);
      anim[o + ANIM.ship.flapForeRad] = s.flapF;
      anim[o + ANIM.ship.flapAftRad] = s.flapA;
    }
  }
}
