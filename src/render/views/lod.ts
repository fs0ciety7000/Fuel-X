// LOD selection on projected screen height (ASSETS_GUIDE §6 LODs): independent of FOV and resolution.
// LOD0 ≥ 15 % of the viewport height, LOD1 3–15 %, LOD2 0.3–3 %, hidden below 0.3 % (the label stays).
// Assets with fewer files use their last level down to 0.3 %. 10 % hysteresis so a level does not flicker.

/** Viewport-height fractions at which LOD0 / LOD1 / LOD2 end. */
export const LOD_FRACTIONS = [0.15, 0.03, 0.003] as const;
export const LOD_HYSTERESIS = 0.1;
/** `pickLod` result for "draw nothing". */
export const LOD_HIDDEN = -1;

/** Size used for the projected height, m: the vertical extent, or half the longest horizontal side for flat or
 *  long assets (apron, vessel) so they do not vanish while still large on screen. */
export function lodSize(bounds: { min: readonly number[]; max: readonly number[] }): number {
  const [x0 = 0, y0 = 0, z0 = 0] = bounds.min;
  const [x1 = 0, y1 = 0, z1 = 0] = bounds.max;
  return Math.max(y1 - y0, 0.5 * Math.max(x1 - x0, z1 - z0));
}

/** Fraction of the viewport height covered by `sizeM` at `distM` for a vertical FOV. */
export function projectedFraction(sizeM: number, distM: number, fovDeg: number): number {
  return sizeM / (2 * Math.max(distM, 1e-3) * Math.tan((fovDeg * Math.PI) / 360));
}

function classify(frac: number): number {
  for (let i = 0; i < LOD_FRACTIONS.length; i++) if (frac >= (LOD_FRACTIONS[i] ?? 0)) return i;
  return LOD_FRACTIONS.length; // hidden
}

/**
 * Level for `frac` given the `current` level (LOD_HIDDEN or 0…levels−1) and how many LOD files exist.
 * A change needs the fraction to clear the boundary by LOD_HYSTERESIS.
 */
export function pickLod(frac: number, current: number, levels: number): number {
  const cur = current === LOD_HIDDEN ? LOD_FRACTIONS.length : current;
  let d = classify(frac);
  if (d > cur && classify(frac * (1 + LOD_HYSTERESIS)) <= cur) d = cur;
  else if (d < cur && classify(frac * (1 - LOD_HYSTERESIS)) >= cur) d = cur;
  if (d >= LOD_FRACTIONS.length) return LOD_HIDDEN;
  return Math.min(d, levels - 1);
}
