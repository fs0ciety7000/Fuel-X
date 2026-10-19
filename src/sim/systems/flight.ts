// Flight (ARCHITECTURE §4 slot 8, GDD §4.7–4.8, AC 16, 18–21). "Plausible, readable, cheap": the booster
// follows the nominal keyframe profile (src/data/flightProfile.ts) in profile time, which runs at mission
// time except between an ascent engine-out and MECO (the burn stretches by `ascentMecoDelayS`). Ground track
// along `launchHeadingRad`; until a CATCH is committed the booster aims at the offshore divert point.
//
// Recovery: `DecisionRequired { decision: 'CATCH' }` at boostback start, deadline = landing-burn ignition.
// `CatchDecision` GO/DIVERT, else the auto policy at the deadline (catch if p ≥ autoCatchThreshold); forced
// divert on low landing propellant or tower wind over the limit. The outcome is one seeded roll on the
// 'catch' stream at the catch keyframe. S-21 separates at hot staging, flies to SECO, then leaves the scene.
//
// Positions are asset origins in world metres (5.0b): liftoff from the mount deck (20 m), the stacked ship rides on
// the booster's `SOCKET_ShipMount` along its tilted axis, the catch puts the booster origin on the catch point so
// its catch pins meet the carriage at 126 m. Attitude (`tiltRad` → `rot`): rate-limited toward a target per profile
// phase — vertical rise, prograde (profile climb angle), boostback flip, engines-first entry, upright landing burn;
// the ship flies prograde on its own after separation (flightProfile.attitude).
import { catchModel as cm, flightProfile as fp, lc1Layout, siteGeometry as geo, vehicles } from '@data/index';
import type { CommandOf } from '../core/commands';
import { despawnEntity, getEntity } from '../core/entities';
import { emit } from '../core/events';
import { rng } from '../core/rng';
import { DT_S, secondsToTicks } from '../core/time';
import { countdownIds } from '../core/world';
import type { World } from '../core/world';
import { boosterFsm, fire, setArms, shipFsm, towerFsm } from '../entities/machines';
import { ON_PAD_ROT, approachAngle, rotateVec, tiltQuat } from '../math/attitude';
import { catchProbability } from '../math/catch';
import { carriageForBoosterM } from '../math/tower';
import {
  CATCH_PROFILE,
  DIVERT_PROFILE,
  LANDING_BURN_PROP_KG,
  SEPARATION_FRAME,
  T_BOOSTBACK_END,
  T_BOOSTBACK_START,
  T_CATCH,
  T_LANDING_BURN,
  T_MECO,
  boosterThrottle,
  sampleProfile,
} from '../math/profile';
import type { Keyframe } from '../math/profile';
import { setCarriageTarget } from './tower';
import type {
  BoosterFlight,
  Countdown,
  Engines,
  EntityOf,
  FlightEventName,
  FlightTelemetry,
  ForcedDivertReason,
  Id,
  Phase,
  PropTanks,
  RecoveryDecidedBy,
  RecoveryMode,
  RecoveryResult,
  RecoveryState,
  ShipFlight,
} from '../types';

type Booster = EntityOf<'booster'>;
type Ship = EntityOf<'ship'>;

const FLIGHT_PHASES: readonly Phase[] = ['Liftoff', 'Boostback', 'TowerCatch', 'Divert', 'Safing'];
const HEADING = fp.launchHeadingRad;
const DIR = { x: Math.sin(HEADING), z: -Math.cos(HEADING) };
const OFFSHORE_M = fp.divert.offshoreDistanceM;
const PAD = lc1Layout.points.olm1;
const CATCH_POINT = lc1Layout.points.catchPoint;
/** Keyframe crossing tolerance on accumulated profile time, s. */
const EPS_S = 1e-9;
const ATT = fp.attitude;
const SHIP_MOUNT = { x: 0, y: geo.booster.shipMountM, z: 0 };

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

function setLit(world: World, e: { id: Id; engines: Engines }, lit: number): void {
  const n = Math.max(0, lit);
  if (n === 0) e.engines.throttle = 0;
  if (e.engines.lit === n) return;
  e.engines.lit = n;
  emit(world, { t: 'EnginesChanged', id: e.id, lit: n, failed: e.engines.failed });
}

function flightEvent(world: World, cd: Countdown, e: Booster | Ship, event: FlightEventName): void {
  const f = e.flight;
  emit(world, {
    t: 'FlightEvent',
    countdownId: cd.id,
    id: e.id,
    kind: e.kind,
    event,
    altitudeM: f?.altitudeM ?? 0,
    speedMPerS: f?.speedMPerS ?? 0,
  });
}

function splitProp(prop: PropTanks, totalKg: number): void {
  const loxShare = prop.loxCapKg / (prop.loxCapKg + prop.ch4CapKg);
  const total = Math.max(0, totalKg);
  prop.loxKg = total * loxShare;
  prop.ch4Kg = total - prop.loxKg;
}

function towerOf(world: World, cd: Countdown): EntityOf<'tower'> | null {
  const id = world.prep[cd.id]?.towerId;
  const t = id === undefined ? null : getEntity(world, id);
  return t?.kind === 'tower' ? t : null;
}

/** Carriage height for the catch: the catch points meet the booster catch pins at CATCH_POINT (60 + 66 = 126 m). */
function catchCarriageM(tower: EntityOf<'tower'>): number {
  return carriageForBoosterM(CATCH_POINT.y - tower.pos.y);
}

/** Telemetry at liftoff, origin `altitudeM` above ground (mount deck for the booster). */
const telemetry = (altitudeM: number): FlightTelemetry => ({
  altitudeM,
  downrangeM: 0,
  speedMPerS: 0,
  verticalSpeedMPerS: 0,
  headingRad: HEADING,
  tiltRad: 0,
});

/** Tilt step toward `target` at `rateRadPerS`; writes `tiltRad` and the entity rotation. */
function steer(e: Booster | Ship, f: FlightTelemetry, target: number, rateRadPerS: number): void {
  f.tiltRad = approachAngle(f.tiltRad, target, rateRadPerS * DT_S);
  e.rot = tiltQuat(ON_PAD_ROT, DIR, f.tiltRad);
}

/** Booster attitude target and rate at profile time `tS`, from this tick's motion (dh downrange, dAlt up), m. */
function boosterAttitude(tS: number, dh: number, dAlt: number, current: number): [number, number] {
  if (tS < ATT.verticalRiseS) return [0, ATT.ascentRateRadPerS];
  if (tS < T_BOOSTBACK_START - EPS_S) {
    return [dh === 0 && dAlt === 0 ? current : Math.atan2(dh, dAlt), ATT.ascentRateRadPerS];
  }
  if (tS < T_BOOSTBACK_END - EPS_S) return [ATT.boostbackTiltRad, ATT.flipRateRadPerS];
  if (tS < T_LANDING_BURN - EPS_S) return [Math.atan2(-dh, Math.abs(dAlt)), ATT.entryRateRadPerS];
  return [0, ATT.entryRateRadPerS];
}

// --- Catch model inputs -------------------------------------------------------------------------------

function landingPropKg(f: BoosterFlight): number {
  return LANDING_BURN_PROP_KG - f.landingPropPenaltyKg;
}

function forcedReason(landingKg: number, towerWindMPerS: number): ForcedDivertReason | null {
  if (landingKg < fp.landingMinPropKg) return 'LOW_PROPELLANT';
  if (towerWindMPerS > cm.towerWindLimitCatchMPerS) return 'TOWER_WIND';
  return null;
}

/** Recomputes p, σ and the forced-divert reason from the live drivers (UI reads these). */
function updateRecoveryModel(world: World, b: Booster, r: RecoveryState, f: BoosterFlight): void {
  r.towerWindMPerS = world.weather.towerWindMPerS;
  r.landingPropKg = landingPropKg(f);
  const { p, sigmaM } = catchProbability({
    enginesOut: b.engines.failed,
    towerWindMPerS: r.towerWindMPerS,
    landingPropKg: r.landingPropKg,
  });
  r.p = p;
  r.sigmaM = sigmaM;
  r.forcedDivert = forcedReason(r.landingPropKg, r.towerWindMPerS);
}

function commit(world: World, cd: Countdown, b: Booster, mode: RecoveryMode, by: RecoveryDecidedBy): void {
  const r = b.recovery;
  const f = b.flight;
  if (!r || !f) return;
  r.mode = mode;
  r.decidedBy = by;
  cd.inputs.recoveryMode = mode;
  if (mode === 'CATCH') {
    f.aimDecision = { profileTimeS: f.profileTimeS, offsetM: f.aimOffsetM };
    const tower = towerOf(world, cd);
    if (tower) {
      fire(world, towerFsm, tower, 'catchArmed');
      setCarriageTarget(world, tower, catchCarriageM(tower));
    }
  } else {
    fire(world, boosterFsm, b, 'divert');
  }
  emit(world, { t: 'RecoveryCommitted', countdownId: cd.id, boosterId: b.id, mode, by, p: r.p });
}

function autoPolicy(world: World, cd: Countdown, b: Booster, r: RecoveryState): void {
  if (r.forcedDivert) commit(world, cd, b, 'DIVERT', 'FORCED');
  else commit(world, cd, b, r.p >= cm.autoCatchThreshold ? 'CATCH' : 'DIVERT', 'AUTO');
}

function finish(world: World, cd: Countdown, b: Booster, result: RecoveryResult, roll: number | null): void {
  const r = b.recovery;
  const f = b.flight;
  if (!r || !f || !r.mode) return;
  r.result = result;
  r.roll = roll;
  f.done = true;
  setLit(world, b, 0);
  cd.inputs.recoveryComplete = true;
  emit(world, {
    t: 'RecoveryOutcome',
    countdownId: cd.id,
    boosterId: b.id,
    mode: r.mode,
    result,
    p: r.p,
    roll,
  });
}

/** The single seeded roll at the catch keyframe. */
function resolveCatch(world: World, cd: Countdown, b: Booster, r: RecoveryState): void {
  const roll = rng(world, 'catch').float();
  const tower = towerOf(world, cd);
  if (roll < r.p) {
    fire(world, boosterFsm, b, 'caught');
    if (tower) {
      // The booster is caught at CATCH_POINT, so the carriage is there: snap it if the hoist was still moving.
      tower.carriageM = catchCarriageM(tower);
      setCarriageTarget(world, tower, tower.carriageM);
      setArms(world, tower, 'CLOSED');
      fire(world, towerFsm, tower, 'caught');
    }
    b.pos = { ...CATCH_POINT };
    b.rot = { ...ON_PAD_ROT };
    if (b.flight) Object.assign(b.flight, { speedMPerS: 0, verticalSpeedMPerS: 0, tiltRad: 0 });
    finish(world, cd, b, 'CAUGHT', roll);
  } else {
    fire(world, boosterFsm, b, 'lost');
    if (tower) fire(world, towerFsm, tower, 'catchFailed');
    finish(world, cd, b, 'CATCH_FAILED', roll);
  }
}

// --- Booster ------------------------------------------------------------------------------------------

function liftoffBooster(world: World, cd: Countdown, b: Booster): void {
  fire(world, boosterFsm, b, 'liftoff');
  b.engines.failed = 0;
  b.flight = {
    ...telemetry(b.pos.y - PAD.y),
    profileTimeS: 0,
    profileRate: 1,
    nextKeyframe: 1,
    failedAscent: 0,
    failedBoostback: 0,
    landingPropPenaltyKg: 0,
    aimOffsetM: 0,
    aimDecision: null,
    done: false,
  };
  b.recovery = {
    p: 0,
    sigmaM: 0,
    landingPropKg: 0,
    towerWindMPerS: 0,
    forcedDivert: null,
    decisionRequiredTick: null,
    deadlineTick: null,
    mode: null,
    decidedBy: null,
    result: null,
    roll: null,
  };
  updateRecoveryModel(world, b, b.recovery, b.flight);
  setLit(world, b, b.engines.total);
  b.engines.throttle = boosterThrottle(0, T_CATCH);
  flightEvent(world, cd, b, 'LIFTOFF');
}

function aimOffsetM(f: BoosterFlight, tS: number): number {
  if (f.aimDecision) {
    const { profileTimeS: td, offsetM } = f.aimDecision;
    return offsetM * clamp01((T_CATCH - tS) / (T_CATCH - td));
  }
  return OFFSHORE_M * clamp01((tS - T_BOOSTBACK_START) / (T_LANDING_BURN - T_BOOSTBACK_START));
}

function profileOf(r: RecoveryState): readonly Keyframe[] {
  return r.mode === 'DIVERT' ? DIVERT_PROFILE : CATCH_PROFILE;
}

function sampleBooster(b: Booster, f: BoosterFlight, frames: readonly Keyframe[]): void {
  const s = sampleProfile(frames, f.profileTimeS);
  const prevH = f.downrangeM;
  const prevAlt = f.altitudeM;
  f.aimOffsetM = aimOffsetM(f, f.profileTimeS);
  const h = s.downrangeM + f.aimOffsetM;
  f.altitudeM = s.altitudeM;
  f.downrangeM = h;
  f.speedMPerS = s.speedMPerS;
  f.verticalSpeedMPerS = (s.altitudeM - prevAlt) / DT_S;
  if (h - prevH > 1e-6) f.headingRad = HEADING;
  else if (h - prevH < -1e-6) f.headingRad = (HEADING + Math.PI) % (2 * Math.PI);
  b.pos = { x: PAD.x + DIR.x * h, y: PAD.y + s.altitudeM, z: PAD.z + DIR.z * h };
  const [target, rate] = boosterAttitude(f.profileTimeS, h - prevH, s.altitudeM - prevAlt, f.tiltRad);
  steer(b, f, target, rate);
  splitProp(b.prop, s.boosterPropKg - f.landingPropPenaltyKg);
}

function onKeyframe(world: World, cd: Countdown, b: Booster, ship: Ship | null, event: FlightEventName): void {
  const f = b.flight;
  const r = b.recovery;
  if (!f || !r) return;
  switch (event) {
    case 'MECO':
      f.profileRate = 1;
      setLit(world, b, 0);
      break;
    case 'HOT_STAGING':
      cd.inputs.stageSeparated = true;
      if (ship) separateShip(world, ship, b);
      break;
    case 'BOOSTBACK_START':
      fire(world, boosterFsm, b, 'boostbackStart');
      setLit(world, b, vehicles.booster.boostbackEngines - f.failedBoostback);
      r.decisionRequiredTick = world.tick;
      r.deadlineTick = world.tick + secondsToTicks(T_LANDING_BURN - f.profileTimeS);
      emit(world, {
        t: 'DecisionRequired',
        countdownId: cd.id,
        decision: 'CATCH',
        poll: null,
        deadlineTick: r.deadlineTick,
      });
      if (r.forcedDivert) commit(world, cd, b, 'DIVERT', 'FORCED');
      break;
    case 'BOOSTBACK_END':
      fire(world, boosterFsm, b, 'boostbackEnd');
      setLit(world, b, 0);
      break;
    case 'LANDING_BURN': {
      if (r.mode === null) autoPolicy(world, cd, b, r);
      setLit(world, b, vehicles.booster.landingEngines);
      const tower = towerOf(world, cd);
      if (r.mode === 'CATCH' && tower) fire(world, towerFsm, tower, 'catchStart');
      break;
    }
    case 'CATCH':
      if (r.mode === 'CATCH') resolveCatch(world, cd, b, r);
      break;
    case 'SPLASHDOWN':
      fire(world, boosterFsm, b, 'lost');
      finish(world, cd, b, 'DIVERTED', null);
      break;
    default:
      break;
  }
  flightEvent(world, cd, b, event);
}

function updateBooster(world: World, cd: Countdown, b: Booster, ship: Ship | null): void {
  const f = b.flight;
  const r = b.recovery;
  if (!f || !r || f.done) return;
  f.profileTimeS += DT_S * f.profileRate;
  sampleBooster(b, f, profileOf(r));
  updateRecoveryModel(world, b, r, f);
  if (r.forcedDivert && r.mode === null && r.decisionRequiredTick !== null) commit(world, cd, b, 'DIVERT', 'FORCED');
  for (;;) {
    const frames = profileOf(r);
    const next = frames[f.nextKeyframe];
    if (!next || f.profileTimeS < next.tS - EPS_S || f.done) break;
    f.nextKeyframe++;
    onKeyframe(world, cd, b, ship, next.event);
  }
  const end = profileOf(r).at(-1)?.tS ?? T_CATCH;
  b.engines.throttle = b.engines.lit > 0 ? boosterThrottle(f.profileTimeS, end) : 0;
}

// --- Ship ---------------------------------------------------------------------------------------------

const SHIP_SECO = fp.ship;

/** Stacked ship: origin on the booster `SOCKET_ShipMount` along the booster's (tilted) axis, same attitude. */
function rideOnBooster(ship: Ship, f: ShipFlight, b: Booster): void {
  const off = rotateVec(b.rot, SHIP_MOUNT);
  ship.pos = { x: b.pos.x + off.x, y: b.pos.y + off.y, z: b.pos.z + off.z };
  ship.rot = { ...b.rot };
  if (b.flight) Object.assign(f, telemetryOf(b.flight));
  f.altitudeM = ship.pos.y - PAD.y;
  f.downrangeM = (ship.pos.x - PAD.x) * DIR.x + (ship.pos.z - PAD.z) * DIR.z;
}

function separateShip(world: World, ship: Ship, b: Booster): void {
  fire(world, shipFsm, ship, 'separation');
  const f = ship.flight;
  if (f) {
    rideOnBooster(ship, f, b);
    f.profileTimeS = SEPARATION_FRAME.tS;
    f.sepAltitudeM = f.altitudeM;
    f.sepDownrangeM = f.downrangeM;
  }
  setLit(world, ship, ship.engines.total);
  ship.engines.throttle = fp.throttle.ship;
}

function updateShip(world: World, cd: Countdown, ship: Ship, b: Booster | null): void {
  const f = ship.flight;
  if (!f || f.done) return;
  if (ship.fsm.state === 'ASCENT') {
    if (b) rideOnBooster(ship, f, b);
    return;
  }
  if (ship.fsm.enteredTick === world.tick && ship.fsm.state === 'SEPARATED') return; // separated this tick
  if (ship.fsm.state === 'SECO') {
    fire(world, shipFsm, ship, 'leave');
    f.done = true;
    despawnEntity(world, ship.id);
    return;
  }
  f.profileTimeS += DT_S;
  const k = clamp01((f.profileTimeS - SEPARATION_FRAME.tS) / (SHIP_SECO.secoTS - SEPARATION_FRAME.tS));
  const lerp = (x: number, y: number): number => x + (y - x) * k;
  const prevAlt = f.altitudeM;
  const prevH = f.downrangeM;
  f.altitudeM = lerp(f.sepAltitudeM, SHIP_SECO.secoAltitudeM);
  f.downrangeM = lerp(f.sepDownrangeM, SHIP_SECO.secoDownrangeM);
  f.speedMPerS = lerp(SEPARATION_FRAME.speedMPerS, SHIP_SECO.secoSpeedMPerS);
  f.verticalSpeedMPerS = (f.altitudeM - prevAlt) / DT_S;
  f.headingRad = HEADING;
  steer(ship, f, Math.atan2(f.downrangeM - prevH, f.altitudeM - prevAlt), ATT.ascentRateRadPerS);
  ship.pos = { x: PAD.x + DIR.x * f.downrangeM, y: PAD.y + f.altitudeM, z: PAD.z + DIR.z * f.downrangeM };
  splitProp(ship.prop, lerp(ship.prop.loxCapKg + ship.prop.ch4CapKg, SHIP_SECO.secoPropKg));
  if (f.profileTimeS >= SHIP_SECO.secoTS - EPS_S) {
    fire(world, shipFsm, ship, 'seco');
    setLit(world, ship, 0);
    flightEvent(world, cd, ship, 'SECO');
  }
}

function telemetryOf(f: FlightTelemetry): FlightTelemetry {
  return {
    altitudeM: f.altitudeM,
    downrangeM: f.downrangeM,
    speedMPerS: f.speedMPerS,
    verticalSpeedMPerS: f.verticalSpeedMPerS,
    headingRad: f.headingRad,
    tiltRad: f.tiltRad,
  };
}

// --- Commands, hooks, system --------------------------------------------------------------------------

function countdownOfBooster(world: World, boosterId: Id): Countdown | null {
  for (const id of countdownIds(world)) {
    const cd = world.countdowns[id];
    if (cd?.boosterId === boosterId) return cd;
  }
  return null;
}

/** `CatchDecision { boosterId, choice }`: only between DecisionRequired and the landing-burn deadline. */
export function commandCatchDecision(world: World, cmd: CommandOf<'CatchDecision'>): string | null {
  const b = getEntity(world, cmd.boosterId);
  const cd = countdownOfBooster(world, cmd.boosterId);
  if (b?.kind !== 'booster' || !cd) return 'UNKNOWN_BOOSTER';
  const r = b.recovery;
  if (!r || r.decisionRequiredTick === null) return 'NO_CATCH_DECISION_PENDING';
  // A forced divert commits itself as soon as the decision opens, so this also covers "catch not allowed".
  if (r.mode !== null) return 'ALREADY_DECIDED';
  commit(world, cd, b, cmd.choice, 'PLAYER');
  return null;
}

/**
 * Engine-out hook for the anomaly director (3.7, A4): `count` engines fail on a booster in ascent (MECO
 * slips by `ascentMecoDelayS` each, landing propellant −`ascentLandingPropPenaltyKg`) or in boostback
 * (−`boostbackLandingPropPenaltyKg`). σ grows by `sigmaPerEngineOutM` per engine out. Returns false (no
 * effect) outside those phases.
 */
export function engineOut(world: World, boosterId: Id, count = 1): boolean {
  const b = getEntity(world, boosterId);
  if (b?.kind !== 'booster' || !b.flight || b.flight.done || count <= 0) return false;
  const f = b.flight;
  if (b.fsm.state === 'ASCENT' && f.profileTimeS < T_MECO) {
    const remaining = T_MECO - f.profileTimeS;
    f.profileRate = remaining / (remaining / f.profileRate + fp.engineOut.ascentMecoDelayS * count);
    f.failedAscent += count;
    f.landingPropPenaltyKg += fp.engineOut.ascentLandingPropPenaltyKg * count;
    b.engines.failed += count;
    setLit(world, b, b.engines.total - b.engines.failed);
  } else if (b.fsm.state === 'BOOSTBACK') {
    f.failedBoostback += count;
    f.landingPropPenaltyKg += fp.engineOut.boostbackLandingPropPenaltyKg * count;
    b.engines.failed += count;
    setLit(world, b, vehicles.booster.boostbackEngines - f.failedBoostback);
  } else {
    return false;
  }
  return true;
}

function updateCountdown(world: World, cd: Countdown): void {
  if (cd.liftoffTick === null || !FLIGHT_PHASES.includes(cd.phase.state)) return;
  const be = getEntity(world, cd.boosterId);
  const se = getEntity(world, cd.shipId);
  const b = be?.kind === 'booster' ? be : null;
  const ship = se?.kind === 'ship' ? se : null;
  if (world.tick === cd.liftoffTick) {
    if (b) liftoffBooster(world, cd, b);
    if (ship) {
      fire(world, shipFsm, ship, 'liftoff');
      ship.flight = {
        ...telemetry(ship.pos.y - PAD.y),
        profileTimeS: 0,
        sepAltitudeM: 0,
        sepDownrangeM: 0,
        done: false,
      };
    }
    return;
  }
  if (b) updateBooster(world, cd, b, ship);
  if (ship) updateShip(world, cd, ship, b);
}

/** Pipeline system (slot 8): every flying countdown, sorted ids. */
export function flightSystem(world: World): void {
  for (const id of countdownIds(world)) {
    const cd = world.countdowns[id];
    if (cd) updateCountdown(world, cd);
  }
}
