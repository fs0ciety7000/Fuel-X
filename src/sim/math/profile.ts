// Nominal flight profile (BALANCING §6): piecewise-linear interpolation of the booster keyframes, except the first
// segment (LIFTOFF → MAX_Q), which is the eased liftoff (`flightProfile.liftoff`, 5.10): acceleration from rest on the
// mount, a(t) = a0 + j·t, meeting the MAX_Q keyframe exactly. Keyframe times and values are unchanged.
import { flightProfile as fp } from '@data/index';
import type { BoosterKeyframe } from '@data/index';
import type { FlightEventName } from '../types';

export interface Keyframe {
  readonly event: FlightEventName;
  readonly tS: number;
  readonly altitudeM: number;
  readonly downrangeM: number;
  readonly speedMPerS: number;
  readonly boosterPropKg: number;
}

const RAW: readonly BoosterKeyframe[] = fp.booster;

/** `null` speeds (not specified) are filled by interpolating across their neighbours. */
function fillSpeeds(frames: readonly BoosterKeyframe[]): Keyframe[] {
  return frames.map((k, i) => {
    if (k.speedMPerS !== null) return { ...k, speedMPerS: k.speedMPerS };
    const prev = frames.slice(0, i).findLast((f) => f.speedMPerS !== null);
    const next = frames.slice(i + 1).find((f) => f.speedMPerS !== null);
    if (!prev || !next || prev.speedMPerS === null || next.speedMPerS === null) {
      throw new Error(`profile: cannot fill speed at ${k.event}`);
    }
    const f = (k.tS - prev.tS) / (next.tS - prev.tS);
    return { ...k, speedMPerS: prev.speedMPerS + (next.speedMPerS - prev.speedMPerS) * f };
  });
}

function kf(event: FlightEventName): Keyframe {
  const k = CATCH_PROFILE.find((f) => f.event === event);
  if (!k) throw new Error(`profile: no ${event} keyframe`);
  return k;
}

/** Nominal booster profile ending at the tower catch. */
export const CATCH_PROFILE: readonly Keyframe[] = fillSpeeds(RAW);
const LB_INDEX = CATCH_PROFILE.findIndex((f) => f.event === 'LANDING_BURN');
const CATCH_FRAME = CATCH_PROFILE[CATCH_PROFILE.length - 1] as Keyframe;

/** Divert profile: identical up to landing-burn ignition, then down to the sea at the splashdown time. */
export const DIVERT_PROFILE: readonly Keyframe[] = [
  ...CATCH_PROFILE.slice(0, LB_INDEX + 1),
  { ...CATCH_FRAME, event: 'SPLASHDOWN', tS: fp.divert.splashdownTS, altitudeM: 0 },
];

export const T_MECO = kf('MECO').tS;
export const T_SEPARATION = kf('HOT_STAGING').tS;
export const T_BOOSTBACK_START = kf('BOOSTBACK_START').tS;
export const T_BOOSTBACK_END = kf('BOOSTBACK_END').tS;
export const T_LANDING_BURN = kf('LANDING_BURN').tS;
export const T_CATCH = CATCH_FRAME.tS;
export const LANDING_BURN_PROP_KG = kf('LANDING_BURN').boosterPropKg;
export const SEPARATION_FRAME = kf('HOT_STAGING');

/**
 * Eased liftoff curve between the LIFTOFF keyframe `a` and the next keyframe `b` (MAX_Q). Vertical: h = h0 + a0·u²/2 +
 * j·u³/6 with j = 6·(Δh − a0·T²/2)/T³ (u = t − t0, T = segment length). Downrange: 0 until the vertical rise ends, then
 * D·w² (w = 0 → 1 over the rest of the segment). Speed: |(ḣ, ḋ)| × k, k so the speed meets `b.speedMPerS`.
 */
export interface LiftoffCurve {
  readonly t0S: number;
  readonly durationS: number;
  readonly h0M: number;
  readonly accelMPerS2: number;
  readonly jerkMPerS3: number;
  readonly d0M: number;
  readonly dRangeM: number;
  /** Start of downrange motion (end of the vertical rise), s after t0. */
  readonly riseS: number;
  readonly speedScale: number;
}

export function liftoffCurve(a: Keyframe, b: Keyframe): LiftoffCurve {
  const T = b.tS - a.tS;
  const a0 = fp.liftoff.accelMPerS2;
  const jerk = (6 * (b.altitudeM - a.altitudeM - (a0 * T * T) / 2)) / (T * T * T);
  if (!(jerk >= 0)) throw new Error('profile: liftoff acceleration too high to meet the MAX_Q altitude');
  const riseS = Math.min(fp.attitude.verticalRiseS, T / 2);
  const vEnd = a0 * T + (jerk * T * T) / 2;
  const dRangeM = b.downrangeM - a.downrangeM;
  const dEnd = (2 * dRangeM) / (T - riseS);
  return {
    t0S: a.tS,
    durationS: T,
    h0M: a.altitudeM,
    accelMPerS2: a0,
    jerkMPerS3: jerk,
    d0M: a.downrangeM,
    dRangeM,
    riseS,
    speedScale: b.speedMPerS / Math.hypot(vEnd, dEnd),
  };
}

/** Eased-liftoff state at `tS` (inside the curve's segment). */
export function sampleLiftoff(c: LiftoffCurve, a: Keyframe, b: Keyframe, tS: number): Omit<Keyframe, 'event'> {
  const u = tS - c.t0S;
  const a0 = c.accelMPerS2;
  const j = c.jerkMPerS3;
  const vv = a0 * u + (j * u * u) / 2;
  const span = c.durationS - c.riseS;
  const w = Math.max(0, (u - c.riseS) / span);
  const vh = (2 * c.dRangeM * w) / span;
  const f = u / c.durationS;
  return {
    tS,
    altitudeM: c.h0M + (a0 * u * u) / 2 + (j * u * u * u) / 6,
    downrangeM: c.d0M + c.dRangeM * w * w,
    speedMPerS: c.speedScale * Math.hypot(vv, vh),
    boosterPropKg: a.boosterPropKg + (b.boosterPropKg - a.boosterPropKg) * f,
  };
}

/** The eased liftoff of the nominal profile (shared by the catch and divert profiles). */
export const LIFTOFF_CURVE = liftoffCurve(CATCH_PROFILE[0] as Keyframe, CATCH_PROFILE[1] as Keyframe);

/** Interpolated profile state at profile time `tS` (clamped to the first/last keyframe). */
export function sampleProfile(frames: readonly Keyframe[], tS: number): Omit<Keyframe, 'event'> {
  const first = frames[0] as Keyframe;
  if (tS <= first.tS) return first;
  for (let i = 1; i < frames.length; i++) {
    const b = frames[i] as Keyframe;
    if (tS > b.tS) continue;
    const a = frames[i - 1] as Keyframe;
    if (i === 1 && a.event === 'LIFTOFF') {
      const c = frames[0] === CATCH_PROFILE[0] && b === CATCH_PROFILE[1] ? LIFTOFF_CURVE : liftoffCurve(a, b);
      return sampleLiftoff(c, a, b, tS);
    }
    const f = (tS - a.tS) / (b.tS - a.tS);
    const lerp = (x: number, y: number): number => x + (y - x) * f;
    return {
      tS,
      altitudeM: lerp(a.altitudeM, b.altitudeM),
      downrangeM: lerp(a.downrangeM, b.downrangeM),
      speedMPerS: lerp(a.speedMPerS, b.speedMPerS),
      boosterPropKg: lerp(a.boosterPropKg, b.boosterPropKg),
    };
  }
  return frames[frames.length - 1] as Keyframe;
}

const THR = fp.throttle;

/**
 * Booster throttle (0–1) at profile time `tS` while its engines are lit (`flightProfile.throttle`): full in ascent with
 * the Max-Q bucket, full in boostback, landing burn ramping from `landingStart` at ignition to `landingEnd` at
 * `endS` (catch or splashdown). The caller forces 0 when no engine is lit.
 */
export function boosterThrottle(tS: number, endS: number): number {
  if (tS >= T_LANDING_BURN) {
    const k = Math.min(1, Math.max(0, (tS - T_LANDING_BURN) / (endS - T_LANDING_BURN)));
    return THR.landingStart + (THR.landingEnd - THR.landingStart) * k;
  }
  if (tS >= T_BOOSTBACK_START) return THR.boostback;
  const q = THR.maxQBucket;
  let dip = 0;
  if (tS > q.startS - q.rampS && tS < q.endS + q.rampS) {
    if (tS < q.startS) dip = (tS - (q.startS - q.rampS)) / q.rampS;
    else if (tS <= q.endS) dip = 1;
    else dip = (q.endS + q.rampS - tS) / q.rampS;
  }
  return THR.ascent + (q.level - THR.ascent) * dip;
}
