// Environment (ARCHITECTURE §4 slot 2, GDD §4.10, BALANCING §8): seeded weather at LC-1.
// Ground and upper wind are Ornstein–Uhlenbeck deviations around their means (exact discretisation per
// tick, one normal draw each on the 'weather' stream); gust and tower wind are fixed factors of the ground
// wind; a scripted front adds a trapezoid boost to the upper wind (A2). `config.weather = 'MANUAL'` leaves
// the readings to the caller (tests force series). The wind direction (5.10) is an OU deviation around the mean
// bearing on its own rng stream 'wind' (one normal draw per tick), so it never shifts the speed series.
import { countdown as cdData, weather as wx } from '@data/index';
import { rng } from '../core/rng';
import { DT_S, secondsToTicks } from '../core/time';
import { WIND_FROM_MEAN_RAD } from '../core/world';
import type { WeatherState, World } from '../core/world';
import type { Tick } from '../types';

const G = wx.groundWind;
const U = wx.upperWind;
const F = wx.front;
const RAMP_TICKS = secondsToTicks(F.rampS);

/** Exact OU step: x' = x·a + sd·√(1 − a²)·N, a = e^(−dt/τ). */
const G_DECAY = Math.exp(-DT_S / G.tauS);
const U_DECAY = Math.exp(-DT_S / U.tauS);
const G_NOISE = G.sdMPerS * Math.sqrt(1 - G_DECAY * G_DECAY);
const U_NOISE = U.sdMPerS * Math.sqrt(1 - U_DECAY * U_DECAY);
const D = wx.windDirection;
const D_DECAY = Math.exp(-DT_S / D.tauS);
const D_NOISE = D.sdRad * Math.sqrt(1 - D_DECAY * D_DECAY);
const D_LIMIT = D.clampSd * D.sdRad;
const TWO_PI = 2 * Math.PI;

const clampDir = (dev: number): number => Math.min(D_LIMIT, Math.max(-D_LIMIT, dev));

/** Wind direction (from), wrapped to [0, 2π), rad. */
export function windFromRadOf(devRad: number): number {
  const a = (WIND_FROM_MEAN_RAD + devRad) % TWO_PI;
  return a < 0 ? a + TWO_PI : a;
}

/** Front contribution to the upper wind at `tick`, m/s (0 before arrival, ramp, plateau, ramp down). */
export function frontBoostAt(front: WeatherState['front'], tick: Tick): number {
  if (!front) return 0;
  const u = tick - front.arrivalTick;
  if (u <= 0) return 0;
  if (u < RAMP_TICKS) return (F.upperWindBoostMPerS * u) / RAMP_TICKS;
  const plateauEnd = RAMP_TICKS + front.durationTicks;
  if (u <= plateauEnd) return F.upperWindBoostMPerS;
  const down = u - plateauEnd;
  return down < RAMP_TICKS ? F.upperWindBoostMPerS * (1 - down / RAMP_TICKS) : 0;
}

/** Writes the readings derived from the series state. */
function writeReadings(w: WeatherState, tick: Tick): void {
  const ground = Math.max(0, G.meanMPerS + w.groundDevMPerS);
  w.groundWindMPerS = ground;
  w.groundGustMPerS = ground * G.gustFactor;
  w.towerWindMPerS = ground * G.towerFactor;
  w.frontBoostMPerS = frontBoostAt(w.front, tick);
  w.upperWindMPerS = Math.max(0, U.meanMPerS + w.upperDevMPerS + w.frontBoostMPerS);
  w.windFromRad = windFromRadOf(w.windDirDevRad);
}

/** First tick: start deviations from the stationary distribution, and the natural front roll. */
function initialize(world: World): void {
  const w = world.weather;
  const r = rng(world, 'weather');
  w.groundDevMPerS = r.normal(0, G.sdMPerS);
  w.upperDevMPerS = r.normal(0, U.sdMPerS);
  w.windDirDevRad = clampDir(rng(world, 'wind').normal(0, D.sdRad));
  if (r.chance(F.probabilityPerRun)) {
    const arrivalTS = r.range(F.arrivalEarliestTS, F.arrivalLatestTS);
    w.front = {
      arrivalTick: world.tick + secondsToTicks(arrivalTS - cdData.scenarioStartTS),
      durationTicks: secondsToTicks(r.range(F.durationMinS, F.durationMaxS)),
    };
  }
  w.initialized = true;
}

/** A front has arrived and has not fully passed yet. */
export function frontActive(world: World): boolean {
  const f = world.weather.front;
  return !!f && f.arrivalTick <= world.tick && world.tick - f.arrivalTick < 2 * RAMP_TICKS + f.durationTicks;
}

/**
 * Brings a front in now (director A2): a pending, passed or absent front is replaced by one arriving this
 * tick; a front already blowing is kept. Returns true when a new front was started.
 */
export function startFrontNow(world: World): boolean {
  const w = world.weather;
  if (frontActive(world)) return false;
  const r = rng(world, 'weather');
  w.front = { arrivalTick: world.tick, durationTicks: secondsToTicks(r.range(F.durationMinS, F.durationMaxS)) };
  return true;
}

/** Pipeline system (slot 2). */
export function environmentSystem(world: World): void {
  if (world.config.weather !== 'SERIES') return;
  const w = world.weather;
  if (!w.initialized) initialize(world);
  else {
    // One Box–Muller pair per tick: cos → ground, sin → upper.
    const r = rng(world, 'weather');
    const rad = Math.sqrt(-2 * Math.log(1 - r.float()));
    const ang = 2 * Math.PI * r.float();
    w.groundDevMPerS = w.groundDevMPerS * G_DECAY + G_NOISE * rad * Math.cos(ang);
    w.upperDevMPerS = w.upperDevMPerS * U_DECAY + U_NOISE * rad * Math.sin(ang);
    w.windDirDevRad = clampDir(w.windDirDevRad * D_DECAY + D_NOISE * rng(world, 'wind').normal());
  }
  writeReadings(w, world.tick);
}

// --- Forecast (UI Range tab, WEATHER station MARGINAL-by-forecast) ------------------------------------

export interface WindForecast {
  /** Expected wind at the lead time, m/s. */
  meanMPerS: number;
  /** ± band (forecast error grows linearly with lead), m/s. */
  bandMPerS: number;
}

/**
 * Forecast `leadS` seconds ahead: OU expectation (deviation decays with τ) plus the front once it has
 * started (a front that has not arrived yet is not forecast: it "arrives early", GDD §7.2 A2).
 */
export function weatherForecast(world: World, leadS: number): { ground: WindForecast; upper: WindForecast } {
  const w = world.weather;
  const band = wx.forecast.errorGrowthMPerSPerS * Math.max(0, leadS);
  const known = w.front && w.front.arrivalTick <= world.tick ? w.front : null;
  const at = world.tick + secondsToTicks(Math.max(0, leadS));
  return {
    ground: { meanMPerS: Math.max(0, G.meanMPerS + w.groundDevMPerS * Math.exp(-leadS / G.tauS)), bandMPerS: band },
    upper: {
      meanMPerS: Math.max(0, U.meanMPerS + w.upperDevMPerS * Math.exp(-leadS / U.tauS) + frontBoostAt(known, at)),
      bandMPerS: band,
    },
  };
}

/**
 * Highest expected upper wind between now and `untilTick` (deviation decays monotonically, so the peak is
 * now or at the start of a known front's plateau), m/s.
 */
export function peakUpperForecast(world: World, untilTick: Tick): number {
  const w = world.weather;
  let peak = weatherForecast(world, 0).upper.meanMPerS;
  const front = w.front;
  if (front && front.arrivalTick <= world.tick) {
    const plateauTick = front.arrivalTick + RAMP_TICKS;
    if (plateauTick > world.tick && plateauTick <= untilTick) {
      peak = Math.max(peak, weatherForecast(world, (plateauTick - world.tick) * DT_S).upper.meanMPerS);
    }
  }
  return peak;
}
