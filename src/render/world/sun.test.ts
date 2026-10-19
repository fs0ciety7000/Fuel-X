import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SUN_DIR, SUN_ROTATION_DEG, sunDirection } from './sun';

describe('SUN_DIR (shared with the Blender previews)', () => {
  it('uses the same rotation as blender/lib/preview.py', () => {
    const py = readFileSync(resolve(import.meta.dirname, '../../../blender/lib/preview.py'), 'utf8');
    const m = /SUN_ROTATION_DEG\s*=\s*\(([^)]*)\)/.exec(py);
    expect(m).not.toBeNull();
    const rot = (m?.[1] ?? '').split(',').map((v) => Number(v.trim()));
    expect(rot).toEqual([...SUN_ROTATION_DEG]);
  });

  it('is a unit vector at 40° elevation from the south-east', () => {
    const [x, y, z] = SUN_DIR;
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12);
    expect((Math.asin(y) * 180) / Math.PI).toBeCloseTo(40, 9);
    // compass bearing: 0 = north (−Z), 90 = east (+X)
    const bearing = (Math.atan2(x, -z) * 180) / Math.PI;
    expect(bearing).toBeCloseTo(145, 9);
  });

  it('maps Blender axes to three (X→X, Z→Y, Y→−Z)', () => {
    // no rotation: the sun shines straight down, so it sits at +Y
    const [x, y, z] = sunDirection([0, 0, 0]);
    expect([x, y, z].map((v) => Math.round(v * 1e9) / 1e9 + 0)).toEqual([0, 1, 0]);
  });
});
