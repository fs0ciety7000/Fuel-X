import { describe, expect, it } from 'vitest';
import { concreteFieldDomain } from './terrain-fields';
import { CLOUD, CLOUD_POINTS, buildCloudPattern, cloudBaseLevel } from './ground';
import { classify, coastX, concreteSdf, hash2, landSdf, terrainGlsl, terrainSpec, valueNoise } from './terrain';
import { createRenderControls } from '../controls';
import { VisualClock } from './visual-clock';

const spec = terrainSpec('LC-1');

describe('point cloud (5.3)', () => {
  it('stays within the ARCHITECTURE §13.1 budget', () => {
    expect(CLOUD_POINTS).toBeLessThanOrEqual(300_000);
  });

  it('builds the same seeded unit tile every time, stratified in [0, 1)', () => {
    const a = buildCloudPattern(32, CLOUD.seed);
    const b = buildCloudPattern(32, CLOUD.seed);
    expect(a.position).toEqual(b.position);
    expect(a.rand).toEqual(b.rand);
    expect(buildCloudPattern(32, CLOUD.seed + 1).position).not.toEqual(a.position);
    for (let k = 0; k < 32 * 32; k++) {
      const i = k % 32;
      const j = Math.floor(k / 32);
      const u = a.position[k * 3] as number;
      const v = a.position[k * 3 + 1] as number;
      expect(u).toBeGreaterThanOrEqual(i / 32);
      expect(u).toBeLessThan((i + 1) / 32);
      expect(v).toBeGreaterThanOrEqual(j / 32);
      expect(v).toBeLessThan((j + 1) / 32);
    }
  });

  it('coarsens the LOD base level with camera height', () => {
    expect(cloudBaseLevel(10)).toBeLessThan(cloudBaseLevel(400));
    expect(cloudBaseLevel(400)).toBeLessThan(cloudBaseLevel(8_000));
    expect(cloudBaseLevel(-50)).toBe(cloudBaseLevel(4));
  });
});

describe('terrain (5.3)', () => {
  it('hash and noise are deterministic and bounded', () => {
    expect(hash2(3, -7)).toBe(hash2(3, -7));
    expect(hash2(3, -7)).not.toBe(hash2(-7, 3));
    for (let i = 0; i < 200; i++) {
      const h = hash2(i * 37 - 2000, i * 11);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(1);
      const n = valueNoise(i * 0.37, -i * 0.21);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
  });

  it('puts the sea east of the coast, the pad on concrete, scrub inland, water in the bay', () => {
    expect(coastX(spec, 0)).toBeGreaterThan(300);
    expect(coastX(spec, 0)).toBeLessThan(500);
    expect(classify(spec, 2_000, 0)).toBe('sea');
    expect(classify(spec, 0, 0)).toBe('concrete'); // pad apron
    expect(classify(spec, -380, 200)).toBe('concrete'); // tank farm lot
    expect(classify(spec, -700, -900)).toBe('scrub');
    const b = spec.bay;
    expect(b).not.toBeNull();
    if (b) expect(landSdf(spec, b.cx, b.cz)).toBeLessThan(0);
    // Every placement-derived lot is on land.
    for (const l of spec.lots) expect(landSdf(spec, l.cx, l.cz)).toBeGreaterThan(0);
  });

  it('bakes a concrete field domain that covers every lot and road', () => {
    const d = concreteFieldDomain(spec);
    expect(d.texelM).toBeGreaterThanOrEqual(2);
    expect(d.widthPx).toBeLessThanOrEqual(4096);
    expect(d.heightPx).toBeLessThanOrEqual(4096);
    const x1 = d.x0 + d.widthPx * d.texelM;
    const z1 = d.z0 + d.heightPx * d.texelM;
    for (const l of spec.lots) {
      expect(l.cx - l.hx).toBeGreaterThan(d.x0);
      expect(l.cx + l.hx).toBeLessThan(x1);
      expect(l.cz - l.hz).toBeGreaterThan(d.z0);
      expect(l.cz + l.hz).toBeLessThan(z1);
    }
    expect(concreteSdf(spec, d.x0, d.z0)).toBeGreaterThan(0);
  });

  it('emits GLSL with the spec baked in (no runtime uniforms for the layout)', () => {
    const g = terrainGlsl(spec);
    expect(g).toContain(`FX_LOTS_N = ${spec.lots.length}`);
    expect(g).toContain(`FX_ROADS_N = ${spec.roads.length}`);
    expect(g).not.toMatch(/NaN|Infinity/);
  });
});

describe('visual clock (5.7 freezeVisuals)', () => {
  it('runs on wall time when live, holds the frozen time when frozen, resumes without a jump', () => {
    const c = new VisualClock();
    const live = { ...createRenderControls('LC-1'), frozen: false };
    c.frame(live, 0.5);
    expect(c.frame(live, 0.1)).toBeCloseTo(0.35, 6); // 0.25 clamp + 0.1
    const frozen = { ...live, frozen: true, frozenTimeS: 123.4 };
    expect(c.frame(frozen, 0.016)).toBe(123.4);
    expect(c.frame(frozen, 5)).toBe(123.4);
    expect(c.frame(live, 0.1)).toBeCloseTo(123.5, 6);
  });
});
