// Rigs: bind the animation channels of one asset (src/render/snapshot.ts `ANIM`) to the named GLB nodes of one
// cloned LOD scene (ASSETS_GUIDE §4, wrappers in ../assets/generated). Animated nodes have an identity rest rotation
// except about their own axis, so rotations are written to `rotation[axis]` directly; translations are rest + value
// (trans ranges in the contract are absolute along the axis, e.g. TOWER_Carriage y = 86 at rest).
import type { Object3D } from 'three';
import {
  BOAT_RANGE,
  BOOSTER,
  CRANE,
  PAD,
  SHIP,
  TANKER,
  TOWER,
  TRANSPORTER,
  VESSEL_RECOVERY,
  WX_STATION,
} from '../assets/generated';
import type { AssetName } from '../assets/generated';
import { ANIM } from '../snapshot';
import { InstancedParts } from './instanced-parts';

export type ApplyFn = (anim: Float32Array) => void;

const ch = (a: Float32Array, i: number): number => a[i] ?? 0;

/** Contract value along `axis` → node position, relative to the exported rest value. */
function transNode(root: Object3D, name: string, axis: 'x' | 'y' | 'z', rest: number) {
  const n = root.getObjectByName(name);
  if (!n) return null;
  const base = n.position[axis] - rest;
  return (v: number): void => {
    n.position[axis] = base + v;
  };
}

function rotNode(root: Object3D, name: string, axis: 'x' | 'y' | 'z') {
  const n = root.getObjectByName(name);
  if (!n) return null;
  return (v: number): void => {
    n.rotation[axis] = v;
  };
}

const DEG = Math.PI / 180;

function compact<T>(xs: (T | null)[]): T[] {
  return xs.filter((x): x is T => x !== null);
}

function towerRig(root: Object3D): ApplyFn {
  const c = ANIM.tower;
  const carriage = transNode(root, TOWER.nodes.Carriage, 'y', TOWER.anim.Carriage.rest);
  const armL = rotNode(root, TOWER.nodes.ArmL, 'y');
  const armR = rotNode(root, TOWER.nodes.ArmR, 'y');
  const qd = rotNode(root, TOWER.nodes.QDArm, 'y');
  return (a) => {
    carriage?.(ch(a, c.carriageM));
    armL?.(ch(a, c.armLRad));
    armR?.(ch(a, c.armRRad));
    qd?.(ch(a, c.qdArmRad));
  };
}

function padRig(root: Object3D): ApplyFn {
  const clamps = transNode(root, PAD.nodes.Clamps, 'y', PAD.anim.Clamps.rest);
  const bqd = transNode(root, PAD.nodes.BQD, 'y', PAD.anim.BQD.rest);
  return (a) => {
    clamps?.(ch(a, ANIM.pad.clampsM));
    bqd?.(ch(a, ANIM.pad.bqdM));
  };
}

function boosterRig(root: Object3D): ApplyFn {
  const c = ANIM.booster;
  const pitch = rotNode(root, BOOSTER.nodes.EnginesGimbal, 'x');
  const yaw = rotNode(root, BOOSTER.nodes.EnginesGimbalYaw, 'z');
  const finsA = compact([rotNode(root, BOOSTER.nodes.GridFin_01, 'x'), rotNode(root, BOOSTER.nodes.GridFin_03, 'x')]);
  const finsB = compact([rotNode(root, BOOSTER.nodes.GridFin_02, 'x'), rotNode(root, BOOSTER.nodes.GridFin_04, 'x')]);
  return (a) => {
    pitch?.(ch(a, c.gimbalPitchRad));
    yaw?.(ch(a, c.gimbalYawRad));
    for (const f of finsA) f(ch(a, c.finARad));
    for (const f of finsB) f(ch(a, c.finBRad));
  };
}

function shipRig(root: Object3D): ApplyFn {
  const c = ANIM.ship;
  const pitch = rotNode(root, SHIP.nodes.EnginesGimbal, 'x');
  const yaw = rotNode(root, SHIP.nodes.EnginesGimbalYaw, 'z');
  // L flaps negative (−90 → 0), R positive (0 → 90): channels carry the deploy magnitude
  const fl = rotNode(root, SHIP.nodes.FlapFL, 'y');
  const fr = rotNode(root, SHIP.nodes.FlapFR, 'y');
  const al = rotNode(root, SHIP.nodes.FlapAL, 'y');
  const ar = rotNode(root, SHIP.nodes.FlapAR, 'y');
  return (a) => {
    pitch?.(ch(a, c.gimbalPitchRad));
    yaw?.(ch(a, c.gimbalYawRad));
    const f = ch(a, c.flapForeRad);
    const af = ch(a, c.flapAftRad);
    fl?.(-f);
    fr?.(f);
    al?.(-af);
    ar?.(af);
  };
}

/** Bogie angle for a coordinated (Ackermann-like) turn about the deck centre, folded into ±90° (a wheel pair
 *  reads the same both ways). Returns [angle, folded]. Zero speed with a yaw rate = carousel (±90°). */
export function bogieSteer(yawRate: number, speed: number, z: number): [number, boolean] {
  if (Math.abs(yawRate) < 1e-4) return [0, false];
  let a = Math.atan2(yawRate * z, Math.abs(speed) < 1e-3 ? 0 : speed);
  let folded = false;
  if (a > Math.PI / 2) {
    a -= Math.PI;
    folded = true;
  } else if (a < -Math.PI / 2) {
    a += Math.PI;
    folded = true;
  }
  return [a, folded];
}

function transporterRig(root: Object3D): ApplyFn {
  const c = ANIM.transporter;
  const deck = transNode(root, TRANSPORTER.nodes.Deck, 'y', TRANSPORTER.anim.Deck.rest);
  const bogies: { node: Object3D; wheel: Object3D | null; z: number }[] = [];
  for (let i = 1; i <= 16; i++) {
    const nn = String(i).padStart(2, '0');
    const node = root.getObjectByName(`${TRANSPORTER.asset}_Bogie_${nn}`);
    const wheel = root.getObjectByName(`${TRANSPORTER.asset}_Wheel_${nn}`) ?? null;
    if (node) bogies.push({ node, wheel, z: node.position.z });
  }
  const parts = new InstancedParts(root, TRANSPORTER.instanced, true);
  return (a) => {
    deck?.(ch(a, c.deckM));
    const w = ch(a, c.yawRateRadPerS);
    const v = ch(a, c.speedMPerS);
    const spin = ch(a, c.wheelRad);
    for (const b of bogies) {
      const [ang, folded] = bogieSteer(w, v, b.z);
      b.node.rotation.y = ang;
      if (b.wheel) b.wheel.rotation.x = folded ? -spin : spin;
    }
    parts.update();
  };
}

function tankerRig(root: Object3D): ApplyFn {
  const c = ANIM.tanker;
  const steer = rotNode(root, TANKER.nodes.Steer, 'y');
  const trailer = rotNode(root, TANKER.nodes.Trailer, 'y');
  const axles = compact(
    [TANKER.nodes.Axle_01, TANKER.nodes.Axle_02, TANKER.nodes.Axle_03, TANKER.nodes.Axle_04, TANKER.nodes.Axle_05].map(
      (n) => rotNode(root, n, 'x'),
    ),
  );
  const parts = new InstancedParts(root, TANKER.instanced, false);
  return (a) => {
    steer?.(ch(a, c.steerRad));
    trailer?.(ch(a, c.trailerRad));
    const s = ch(a, c.axleRad);
    for (const ax of axles) ax(s);
    parts.update();
  };
}

function craneRig(root: Object3D): ApplyFn {
  const c = ANIM.crane;
  const upper = rotNode(root, CRANE.nodes.Upper, 'y');
  const boom = rotNode(root, CRANE.nodes.Boom, 'x');
  const cable = rotNode(root, CRANE.nodes.Cable, 'x');
  const hook = root.getObjectByName(CRANE.nodes.Hook);
  // CableGeo is a 1 m segment hanging along −Y (meshopt keeps its quantization scale/offset on the node):
  // scale and offset both stretch with the cable length.
  const geo = root.getObjectByName(CRANE.nodes.CableGeo);
  const geoScaleY = geo?.scale.y ?? 1;
  const geoPosY = geo?.position.y ?? 0;
  return (a) => {
    const luff = ch(a, c.luffRad) || CRANE.anim.Boom.rest * DEG;
    const len = -(ch(a, c.hookM) || CRANE.anim.Hook.rest);
    upper?.(ch(a, c.slewRad));
    boom?.(luff);
    cable?.(-luff);
    if (hook) hook.position.y = -len;
    if (geo) {
      geo.scale.y = geoScaleY * len;
      geo.position.y = geoPosY * len;
    }
  };
}

function boatRig(root: Object3D, radarName: string, deckCrane: string | null): ApplyFn {
  const radar = rotNode(root, radarName, 'y');
  const crane = deckCrane ? rotNode(root, deckCrane, 'y') : null;
  return (a) => {
    radar?.(ch(a, 0));
    crane?.(ch(a, ANIM.vessel_recovery.deckCraneRad));
  };
}

function wxRig(root: Object3D): ApplyFn {
  const vane = rotNode(root, WX_STATION.nodes.Vane, 'y');
  const anemo = rotNode(root, WX_STATION.nodes.Anemometer, 'y');
  return (a) => {
    vane?.(ch(a, ANIM.wx_station.vaneRad));
    anemo?.(ch(a, ANIM.wx_station.anemometerRad));
  };
}

/** Rig for one cloned LOD scene of `asset`, or null when the asset has no animated parts. */
export function createRig(asset: AssetName, root: Object3D): ApplyFn | null {
  switch (asset) {
    case 'tower':
      return towerRig(root);
    case 'pad':
      return padRig(root);
    case 'booster':
      return boosterRig(root);
    case 'ship':
      return shipRig(root);
    case 'transporter':
      return transporterRig(root);
    case 'tanker':
      return tankerRig(root);
    case 'crane':
      return craneRig(root);
    case 'boat_range':
      return boatRig(root, BOAT_RANGE.nodes.Radar, null);
    case 'vessel_recovery':
      return boatRig(root, VESSEL_RECOVERY.nodes.Radar, VESSEL_RECOVERY.nodes.DeckCrane);
    case 'wx_station':
      return wxRig(root);
    default:
      return null;
  }
}
