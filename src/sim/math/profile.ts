// Nominal flight profile (BALANCING §6): piecewise-linear interpolation of the booster keyframes.
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
export const T_LANDING_BURN = kf('LANDING_BURN').tS;
export const T_CATCH = CATCH_FRAME.tS;
export const LANDING_BURN_PROP_KG = kf('LANDING_BURN').boosterPropKg;
export const SEPARATION_FRAME = kf('HOT_STAGING');

/** Interpolated profile state at profile time `tS` (clamped to the first/last keyframe). */
export function sampleProfile(frames: readonly Keyframe[], tS: number): Omit<Keyframe, 'event'> {
  const first = frames[0] as Keyframe;
  if (tS <= first.tS) return first;
  for (let i = 1; i < frames.length; i++) {
    const b = frames[i] as Keyframe;
    if (tS > b.tS) continue;
    const a = frames[i - 1] as Keyframe;
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
