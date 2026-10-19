// Per-site camera framing (render-owned view data). Site-local metres, three frame (X east, Y up, Z south).
import type { CameraOrbit } from '../controls';

export interface SiteView {
  /** Home view look-at point. */
  target: readonly [number, number, number];
  home: CameraOrbit;
  /** Coastline x (m): land west of it, sea east (site-lc1 header: coast ≈ x +400 m). */
  coastX: number;
}

export const SITE_VIEWS: Record<string, SiteView> = {
  // Pad + tower at the origin, tank farm ~(-380, 0, 230): look from the south-east like the asset previews.
  'LC-1': { target: [-175, 30, 95], home: { yawDeg: 140, pitchDeg: 30, distM: 820 }, coastX: 400 },
};

export const DEFAULT_SITE = 'LC-1';

export function siteView(code: string): SiteView {
  return SITE_VIEWS[code] ?? (SITE_VIEWS[DEFAULT_SITE] as SiteView);
}
