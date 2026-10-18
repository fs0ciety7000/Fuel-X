// Range (ARCHITECTURE §4 slots 4–6, GDD §4.5 station table, §4.11, AC 10, 26): PICKET patrols and intercepts,
// the A1 intruder, crew vans, and the five Go/No-Go stations derived from sim state.
//
//   WEATHER    GO within limits · MARGINAL within `marginalBand` of a limit, or a known front forecast to
//              cross the upper-wind limit before the window closes · NO-GO over a limit
//   RANGE      GO pickets on station · MARGINAL a picket repositioning · NO-GO intruder in AREA BRAVO
//   PROPELLANT GO reserve ≥ 1 hold-hour · MARGINAL reserve < `stationMarginalBelowToppingS` of topping ·
//              NO-GO farm cannot finish the load and top to T-0 (reserve < 0)
//   VEHICLE    GO · MARGINAL A3 GSE leak (soft fault) or health below the GO threshold · (no hard faults in MVP)
//   PAD_CREW   GO · MARGINAL crew past `crew.marginalFromS` · NO-GO a van inside the hazard radius after
//              `crewPadClearByTS`, or crew over the shift limit
// Stations are written to `cd.inputs.stations` (read by the countdown later in the same tick) only when
// `config.stations = 'LIVE'`; boats and vans always move.
import {
  STATION_IDS,
  anomalies as an,
  countdown as cdData,
  intruderCallSign,
  lc1Layout,
  logistics as ld,
  propellant as pd,
  vehicles,
  weather as wx,
} from '@data/index';
import type { Propellant } from '@data/index';
import { despawnEntity, entitiesOfKind, getEntity, spawnEntity } from '../core/entities';
import { emit } from '../core/events';
import type { Rng } from '../core/rng';
import { DT_S, secondsToTicks } from '../core/time';
import { countdownIds } from '../core/world';
import type { World } from '../core/world';
import { boatFsm, fire, vanFsm } from '../entities/machines';
import { headingToQuat, pointAt } from '../math/path';
import type { Countdown, EntityOf, GoStatus, Id, Phase, Station, StationDriver, StationReading, Vec3 } from '../types';
import { isPreLiftoff } from './countdown';
import { peakUpperForecast } from './environment';
import { advanceLeg, advancePatrol, advanceRoute, startLeg, startRoute } from './motion';
import { PROPELLANTS, farmUsableKg } from './propellant';

type Boat = EntityOf<'boat'>;
type Van = EntityOf<'van'>;

const PAD = lc1Layout.points.olm1;
const HAZARD_R = ld.hazardPadRadiusM;
const BAND = cdData.marginalBand;
const HYST = cdData.stationHysteresisFraction;
const SAMPLE_TICKS = Math.max(1, secondsToTicks(cdData.stationSampleS));
const CLEAR_BY_TICKS = secondsToTicks(cdData.crewPadClearByTS);
const VAN_DEPART_TICKS = secondsToTicks(cdData.crew.vanDepartTS);
const VAN_STAGGER_TICKS = secondsToTicks(cdData.crew.vanStaggerS);
const LOAD_START_S = cdData.loadStartTS;
const ESCORT_TICKS = secondsToTicks(an.A1.clearAfterInterceptS);
const AWAY_AFTER_LIFTOFF: readonly Phase[] = ['Liftoff', 'Boostback', 'TowerCatch', 'Divert', 'Safing'];

const AREA = (() => {
  const xs = lc1Layout.maritimeHazardArea.map((p) => p.x);
  const zs = lc1Layout.maritimeHazardArea.map((p) => p.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
})();

const dist2d = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Boats in entity order (a copy: callers may spawn/despawn while iterating). */
const boatsOf = (world: World): Boat[] => entitiesOfKind(world, 'boat').slice();

// --- A1: intruder + picket intercept ------------------------------------------------------------------

/**
 * A1 range fouled: spawns `UNK-01` inside AREA BRAVO, 4–12 km from a patrolling picket (rejection sampling on
 * the area, last draw accepted), and dispatches the nearest patrolling picket at intercept speed. Returns the
 * intruder id, or null when no picket is on patrol or an intruder already exists.
 */
export function foulRange(world: World, r: Rng): Id | null {
  const all = boatsOf(world);
  if (all.some((b) => b.role === 'intruder')) return null;
  const pickets = all.filter((b) => b.role === 'picket' && b.fsm.state === 'PATROL');
  if (pickets.length === 0) return null;
  let pos: Vec3 = { x: 0, y: 0, z: 0 };
  let nearest: Boat = pickets[0] as Boat;
  for (let i = 0; i < an.A1.spawnAttempts; i++) {
    pos = { x: r.range(AREA.minX, AREA.maxX), y: 0, z: r.range(AREA.minZ, AREA.maxZ) };
    nearest = pickets.reduce((best, p) => (dist2d(p.pos, pos) < dist2d(best.pos, pos) ? p : best));
    const d = dist2d(nearest.pos, pos);
    if (d >= an.A1.intruderDistanceMinM && d <= an.A1.intruderDistanceMaxM) break;
  }
  const intruder = spawnEntity(world, {
    kind: 'boat',
    callSign: intruderCallSign,
    siteId: lc1Layout.siteId,
    pos,
    rot: headingToQuat(Math.PI),
    asset: 'boat_range',
    role: 'intruder',
    fsm: { state: 'IN_AREA', enteredTick: world.tick },
    route: null,
    leg: null,
    targetId: nearest.id,
    escortEndTick: null,
  });
  fire(world, boatFsm, nearest, 'dispatch');
  nearest.targetId = intruder.id;
  startLeg(nearest, pos, ld.picketSpeedMPerS);
  return intruder.id;
}

function updatePicket(world: World, b: Boat): void {
  switch (b.fsm.state) {
    case 'PATROL':
      advancePatrol(b);
      return;
    case 'INTERCEPT': {
      if (!advanceLeg(b)) return;
      const t = b.targetId === null ? null : getEntity(world, b.targetId);
      fire(world, boatFsm, b, 'intercepted');
      b.escortEndTick = world.tick + ESCORT_TICKS;
      // Escort out of the area, seaward (+X), at the escort speed for the clear-after-intercept time.
      const out = { x: b.pos.x + an.A1.escortSpeedMPerS * an.A1.clearAfterInterceptS, y: 0, z: b.pos.z };
      startLeg(b, out, an.A1.escortSpeedMPerS);
      if (t?.kind === 'boat') {
        fire(world, boatFsm, t, 'intercepted');
        startLeg(t, out, an.A1.escortSpeedMPerS);
      }
      return;
    }
    case 'ESCORT': {
      advanceLeg(b);
      if (b.escortEndTick === null || world.tick < b.escortEndTick) return;
      const t = b.targetId === null ? null : getEntity(world, b.targetId);
      if (t?.kind === 'boat') {
        fire(world, boatFsm, t, 'leave');
        despawnEntity(world, t.id);
      }
      b.targetId = null;
      b.escortEndTick = null;
      fire(world, boatFsm, b, 'escortDone');
      const loop = b.route?.pathId;
      if (loop) startLeg(b, pointAt(loop, 0).pos, ld.picketSpeedMPerS);
      return;
    }
    case 'RETURNING':
      if (!advanceLeg(b)) return;
      b.leg = null;
      if (b.route) b.route.movedTicks = 0;
      fire(world, boatFsm, b, 'onLoop');
      return;
    default:
      return;
  }
}

function updateBoats(world: World, boats: readonly Boat[]): void {
  for (const b of boats) {
    if (b.role === 'picket') updatePicket(world, b);
    else if (b.role === 'intruder' && b.fsm.state === 'INTERCEPTED') advanceLeg(b);
  }
}

// --- Crew vans ----------------------------------------------------------------------------------------

/** Vans must be away from the pad (T ≥ van departure, flight, detank); `sinceTicks` = T-clock past the mark. */
function vansAway(world: World): { away: boolean; sinceTicks: number } {
  let away = false;
  let since = 0;
  for (const id of countdownIds(world)) {
    const cd = world.countdowns[id];
    if (!cd || cd.siteId !== lc1Layout.siteId) continue;
    if (isPreLiftoff(cd.phase.state) && cd.tClockTicks >= VAN_DEPART_TICKS) {
      away = true;
      since = Math.max(since, cd.tClockTicks - VAN_DEPART_TICKS);
    } else if (
      AWAY_AFTER_LIFTOFF.includes(cd.phase.state) ||
      (cd.phase.state === 'Scrubbed' && !cd.inputs.detankComplete)
    ) {
      away = true;
      since = Number.MAX_SAFE_INTEGER;
    }
  }
  return { away, sinceTicks: since };
}

function updateVans(world: World, vans: readonly Van[]): void {
  const { away, sinceTicks } = vansAway(world);
  vans.forEach((v, index) => updateVan(world, v, away && sinceTicks >= index * VAN_STAGGER_TICKS, away));
}

function updateVan(world: World, v: Van, depart: boolean, away: boolean): void {
  switch (v.fsm.state) {
    case 'AT_PAD':
      if (depart) {
        fire(world, vanFsm, v, 'toSafe');
        startRoute(v, 'cv.padToSafe', ld.crewVanSpeedMPerS);
      }
      return;
    case 'TO_SAFE':
    case 'TO_PAD':
      if (!advanceRoute(v)) return;
      fire(world, vanFsm, v, 'arrived');
      v.route = null;
      return;
    case 'PARKED':
      if (!away) {
        fire(world, vanFsm, v, 'toPad');
        startRoute(v, 'cv.safeToPad', ld.crewVanSpeedMPerS);
      }
      return;
  }
}

// --- Stations -----------------------------------------------------------------------------------------

const reading = (status: GoStatus, driver: StationDriver, value: number, limit: number): StationReading => ({
  status,
  driver,
  value,
  limit,
});

const RANK: Record<GoStatus, number> = { GO: 0, MARGINAL: 1, NO_GO: 2 };
const worst = (a: StationReading, b: StationReading): StationReading => (RANK[b.status] > RANK[a.status] ? b : a);

/** Upper-limit reading with a deadband: a worse `prev` status is kept until the value is HYST·limit clear. */
function limitReading(driver: StationDriver, value: number, limit: number, prev: GoStatus): StationReading {
  const h = HYST * limit;
  if (value > limit - (prev === 'NO_GO' ? h : 0)) return reading('NO_GO', driver, value, limit);
  if (value > limit * (1 - BAND) - (prev !== 'GO' ? h : 0)) return reading('MARGINAL', driver, value, limit);
  return reading('GO', driver, value, limit);
}

function weatherStation(world: World, cd: Countdown): StationReading {
  const w = world.weather;
  const L = wx.launchLimit;
  const prev = cd.inputs.stations.WEATHER;
  let r = limitReading('GROUND_WIND', w.groundWindMPerS, L.groundWindMPerS, prev);
  r = worst(r, limitReading('UPPER_WIND', w.upperWindMPerS, L.upperWindMPerS, prev));
  if (r.status === 'GO') {
    const peak = peakUpperForecast(world, cd.windowCloseTick);
    if (peak > L.upperWindMPerS) r = reading('MARGINAL', 'FORECAST_UPPER_WIND', peak, L.upperWindMPerS);
  }
  return r.status === 'GO' ? reading('GO', 'NOMINAL', w.upperWindMPerS, L.upperWindMPerS) : r;
}

function rangeStation(world: World, boats: readonly Boat[]): StationReading {
  let repositioning = false;
  for (const b of boats) {
    if (b.role === 'intruder') {
      // Intercept ETA of the dispatched picket (0 once intercepted and being escorted out).
      const p = b.targetId === null ? null : getEntity(world, b.targetId);
      const leg = p?.kind === 'boat' && p.fsm.state === 'INTERCEPT' ? p.leg : null;
      return reading('NO_GO', 'INTRUDER', leg ? (leg.totalTicks - leg.movedTicks) * DT_S : 0, 0);
    }
    if (b.role === 'picket' && b.fsm.state !== 'PATROL') repositioning = true;
  }
  return repositioning ? reading('MARGINAL', 'PICKET_REPOSITIONING', 0, 0) : reading('GO', 'NOMINAL', 0, 0);
}

export interface PropellantReserve {
  /** Usable farm mass left at T-0 after finishing the load and topping (negative = cannot), kg. */
  reserveKg: number;
  /** Topping draw of the fully loaded stack, kg/s. */
  toppingKgPerS: number;
  /** Reserve expressed in seconds of topping (= hold time it covers), s. */
  holdS: number;
}

function stagesOf(world: World, cd: Countdown): (EntityOf<'booster'> | EntityOf<'ship'>)[] {
  const b = getEntity(world, cd.boosterId);
  const s = getEntity(world, cd.shipId);
  return [b, s].filter((e): e is EntityOf<'booster'> | EntityOf<'ship'> => e?.kind === 'booster' || e?.kind === 'ship');
}

/**
 * PROPELLANT station input: farm usable mass minus what the load still needs to finish (fill + boil-off of
 * the filling tanks, approximated as half-full on average) and to top both stages from full to T-0, at the
 * current load rate (a paused A3 fix counts at full rate).
 */
export function propellantReserve(world: World, cd: Countdown, fluid: Propellant): PropellantReserve {
  const key = fluid === 'LOX' ? 'loxKg' : 'ch4Kg';
  const capKey = fluid === 'LOX' ? 'loxCapKg' : 'ch4CapKg';
  const f = pd.vehicleBoilOffFractionPerS[fluid];
  const factor = world.logistics.loadRateFactor > 0 ? world.logistics.loadRateFactor : 1;
  const tS = cd.tClockTicks * DT_S;
  let needKg = 0;
  let toppingKgPerS = 0;
  for (const st of stagesOf(world, cd)) {
    const cap = st.prop[capKey];
    const m = st.prop[key];
    toppingKgPerS += cap * f;
    const remaining = Math.max(0, cap - m);
    const fillS = remaining / (pd.loadRateKgPerS[st.kind][fluid] * factor);
    const fullAtS = Math.max(tS, LOAD_START_S) + fillS;
    needKg += remaining + f * ((m + cap) / 2) * fillS + cap * f * Math.max(0, -fullAtS);
  }
  const reserveKg = farmUsableKg(world, fluid) - needKg;
  return { reserveKg, toppingKgPerS, holdS: toppingKgPerS > 0 ? reserveKg / toppingKgPerS : 0 };
}

function propellantStation(world: World, cd: Countdown): StationReading {
  let r: StationReading | null = null;
  const prev = cd.inputs.stations.PROPELLANT;
  const limit = pd.stationMarginalBelowToppingS;
  const h = HYST * limit;
  for (const fluid of PROPELLANTS) {
    const res = propellantReserve(world, cd, fluid);
    if (res.toppingKgPerS <= 0) continue;
    const driver: StationDriver = fluid === 'LOX' ? 'FARM_RESERVE_LOX' : 'FARM_RESERVE_CH4';
    const status: GoStatus =
      res.holdS < (prev === 'NO_GO' ? h : 0)
        ? 'NO_GO'
        : res.holdS < limit + (prev !== 'GO' ? h : 0)
          ? 'MARGINAL'
          : 'GO';
    const cand = reading(status, driver, res.holdS, limit);
    // Worst status wins; on a tie the smaller hold time drives.
    if (!r || RANK[cand.status] > RANK[r.status] || (cand.status === r.status && cand.value < r.value)) r = cand;
  }
  if (!r) return reading('GO', 'NOMINAL', 0, pd.stationMarginalBelowToppingS);
  return r.status === 'GO' ? { ...r, driver: 'NOMINAL' } : r;
}

/** Vehicle health (0–1) from booster wear (BALANCING §1 sim addition). */
export function vehicleHealth(world: World, cd: Countdown): number {
  const b = getEntity(world, cd.boosterId);
  return b?.kind === 'booster' ? 1 - vehicles.healthLossPerWear * b.wear : 1;
}

function vehicleStation(world: World, cd: Countdown): StationReading {
  const health = vehicleHealth(world, cd);
  const limit = vehicles.vehicleHealthGoThreshold;
  if (world.anomalies[cd.id]?.leak.active) return reading('MARGINAL', 'GSE_LEAK', health, limit);
  if (health < limit) return reading('MARGINAL', 'VEHICLE_HEALTH', health, limit);
  return reading('GO', 'NOMINAL', health, limit);
}

/** Crew time on shift, s (AC 12: keeps accruing during holds). */
export function crewElapsedS(world: World, cd: Countdown): number {
  return cdData.crew.elapsedAtStartS + (world.tick - cd.createdTick) * DT_S;
}

function padCrewStation(world: World, cd: Countdown): StationReading {
  const c = cdData.crew;
  const elapsed = crewElapsedS(world, cd);
  if (cd.tClockTicks >= CLEAR_BY_TICKS) {
    for (const v of entitiesOfKind(world, 'van')) {
      if (dist2d(v.pos, PAD) < HAZARD_R) {
        return reading('NO_GO', 'CREW_IN_HAZARD', dist2d(v.pos, PAD), HAZARD_R);
      }
    }
  }
  if (elapsed >= c.shiftLimitS) return reading('NO_GO', 'CREW_SHIFT', elapsed, c.shiftLimitS);
  if (elapsed >= c.marginalFromS) return reading('MARGINAL', 'CREW_SHIFT', elapsed, c.shiftLimitS);
  return reading('GO', 'NOMINAL', elapsed, c.shiftLimitS);
}

function computeStations(world: World, cd: Countdown, boats: readonly Boat[]): Record<Station, StationReading> {
  return {
    WEATHER: weatherStation(world, cd),
    RANGE: rangeStation(world, boats),
    PROPELLANT: propellantStation(world, cd),
    VEHICLE: vehicleStation(world, cd),
    PAD_CREW: padCrewStation(world, cd),
  };
}

function updateStations(world: World, cd: Countdown, boats: readonly Boat[]): void {
  const next = computeStations(world, cd, boats);
  for (const s of STATION_IDS) {
    const r = next[s];
    if (cd.inputs.stations[s] !== r.status) {
      emit(world, { t: 'StationChanged', countdownId: cd.id, station: s, status: r.status, driver: r.driver });
    }
    cd.inputs.stations[s] = r.status;
  }
  world.range[cd.id] = { stations: next };
}

/**
 * Pipeline system (before the countdown): boats, vans, then — every `stationSampleS` (10 Hz) — the stations of
 * every pre-liftoff countdown.
 */
export function rangeSystem(world: World): void {
  updateBoats(world, boatsOf(world));
  updateVans(world, entitiesOfKind(world, 'van'));
  const boats = entitiesOfKind(world, 'boat');
  if (world.config.stations !== 'LIVE' || world.tick % SAMPLE_TICKS !== 0) return;
  for (const id of countdownIds(world)) {
    const cd = world.countdowns[id];
    if (cd && isPreLiftoff(cd.phase.state)) updateStations(world, cd, boats);
  }
}
