// Catch model (BALANCING §7): lateral error e ~ N(0, σ); success if |e| ≤ tolerance → p = erf(tol / (σ·√2)).
import { catchModel as cm } from '@data/index';

/** Error function, Abramowitz & Stegun 7.1.26 (|error| ≤ 1.5e-7, ample for a p shown to 1 %). */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return sign * (1 - poly * Math.exp(-a * a));
}

export interface CatchDrivers {
  enginesOut: number;
  towerWindMPerS: number;
  /** Predicted propellant at landing-burn ignition, kg. */
  landingPropKg: number;
}

export function catchSigmaM(d: CatchDrivers): number {
  return (
    cm.sigmaBaseM +
    cm.sigmaPerEngineOutM * d.enginesOut +
    cm.sigmaWindCoefMPerMPerS * Math.max(0, d.towerWindMPerS - cm.sigmaWindRefMPerS) +
    (d.landingPropKg < cm.lowPropRefKg ? cm.sigmaLowPropM : 0)
  );
}

export function catchProbability(d: CatchDrivers): { p: number; sigmaM: number } {
  const sigmaM = catchSigmaM(d);
  return { p: erf(cm.armsToleranceM / (sigmaM * Math.SQRT2)), sigmaM };
}
