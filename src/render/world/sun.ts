// Key light shared with the Blender previews (ASSETS_GUIDE §9, blender/lib/preview.py SUN_ROTATION_DEG).
// Blender sun: Euler XYZ (50°, 0°, 35°), emits along its local −Z, energy 2.2 W/m², fill = paper at 0.25.
// sun.test.ts parses blender/lib/preview.py so the two never drift apart.

/** Blender sun rotation, degrees (Euler XYZ, Z-up). Must equal preview.py SUN_ROTATION_DEG. */
export const SUN_ROTATION_DEG = [50, 0, 35] as const;
/** Blender sun strength (irradiance, W/m²) → three directional intensity (three divides diffuse by π too). */
export const SUN_INTENSITY = 2.2;
/**
 * Blender world fill = paper at strength 0.25 (uniform radiance → hemisphere irradiance π × 0.25), raised to 0.3 to
 * stand in for the Cycles ground bounce: calibrated so the PAD apron matches docs/assets/_stack.png (≈ #C0BEB7).
 */
export const FILL_INTENSITY = Math.PI * 0.3;

/** Unit vector from the scene toward the sun in three space (Y-up), derived from SUN_ROTATION_DEG. */
export function sunDirection(rotDeg: readonly [number, number, number] = SUN_ROTATION_DEG): [number, number, number] {
  const [rx, ry, rz] = rotDeg.map((d) => (d * Math.PI) / 180) as [number, number, number];
  // Light travels along R·(0,0,−1) with R = Rz·Ry·Rx (Blender XYZ Euler); the sun lies opposite.
  let x = 0;
  let y = 0;
  let z = -1;
  // Rx
  [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
  // Ry
  [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
  // Rz
  [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
  // Toward the sun (negate), then Blender (X, Y, Z) → three (X, Z, −Y).
  return [-x, -z, y];
}

/** Toward-sun unit vector, three space: elevation 40°, from the south-east (+X east, +Z south). */
export const SUN_DIR = sunDirection();
