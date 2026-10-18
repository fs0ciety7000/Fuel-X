// Contract validation + codegen logic for the asset pipeline (scripts/assets, ADR 0007).
import { Document } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import towerContract from '../../blender/assets/tower.contract.json';
import { generateAsset, lodUrl, shortKey } from '../../scripts/assets/codegen.ts';
import { checkContract, parseContract, summarize } from '../../scripts/assets/contract.ts';
import type { AssetContract, GlbSummary } from '../../scripts/assets/contract.ts';

const contract: AssetContract = {
  asset: 'DEMO',
  file: 'demo',
  class: 'prop',
  lods: 2,
  nodes: ['DEMO_Body', 'DEMO_Arm', 'DEMO_ArmGeo'],
  sockets: ['SOCKET_Label'],
  anim: { DEMO_Arm: { kind: 'rot', axis: 'y', min: 0, max: 40, rest: 0, unit: 'deg' } },
  budget: { tris: [100, 50], bytes: 40_000, drawCalls: 2 },
};

interface DocOptions {
  lod?: number;
  dropSocket?: boolean;
  meshOnParent?: boolean;
  material?: string;
  armExtras?: Record<string, unknown>;
  quads?: number;
}

/** Minimal in-memory GLB-like document: root → Body (mesh), Arm (empty) → ArmGeo (mesh), SOCKET_Label. */
function makeDoc(o: DocOptions = {}): Document {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const quads = o.quads ?? 1;
  const pos = new Float32Array(quads * 12);
  const idx: number[] = [];
  for (let q = 0; q < quads; q++) {
    pos.set([0, 0, q, 1, 0, q, 1, 1, q, 0, 1, q], q * 12);
    const b = q * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const mat = doc.createMaterial(o.material ?? 'MAT_Clay');
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(idx)).setBuffer(buffer))
    .setMaterial(mat);
  const mesh = doc.createMesh('m').addPrimitive(prim);
  const lod = o.lod ?? 0;
  const root = doc.createNode('DEMO').setExtras({ fx_asset: 'DEMO', fx_version: 1, fx_lod: lod });
  const body = doc.createNode('DEMO_Body').setMesh(mesh);
  const arm = doc
    .createNode('DEMO_Arm')
    .setExtras(o.armExtras ?? { fx_anim: 'rot', fx_axis: 'y', fx_min: 0, fx_max: 40, fx_rest: 0, fx_unit: 'deg' });
  if (o.meshOnParent) arm.setMesh(mesh);
  arm.addChild(doc.createNode('DEMO_ArmGeo').setMesh(mesh));
  root.addChild(body).addChild(arm);
  if (!o.dropSocket) root.addChild(doc.createNode('SOCKET_Label').setTranslation([0, 3, 0]));
  doc.createScene('s').addChild(root);
  return doc;
}

const sum = (o: DocOptions = {}, bytes = 1000): GlbSummary => summarize(makeDoc(o), bytes, o.lod ?? 0);
const pair = (a: DocOptions = {}, b: DocOptions = {}): GlbSummary[] => [sum(a), sum({ lod: 1, ...b })];

describe('parseContract', () => {
  it('accepts the committed tower contract', () => {
    const c = parseContract(towerContract, 'tower.contract.json');
    expect(c.asset).toBe('TOWER');
    expect(c.anim['TOWER_Carriage']).toMatchObject({ min: 25, max: 135, rest: 86 });
  });

  it('rejects budgets above the ARCHITECTURE §13.2 class caps and bad anim ranges', () => {
    const bad = {
      ...contract,
      budget: { tris: [3000, 50], bytes: 40_000, drawCalls: 2 },
      anim: { DEMO_Arm: { kind: 'rot', axis: 'y', min: 0, max: 40, rest: 90, unit: 'deg' } },
    };
    expect(() => parseContract(bad)).toThrow(/budget.tris\[0\] 3000 exceeds class cap 2500/);
    expect(() => parseContract(bad)).toThrow(/anim.DEMO_Arm needs min <= rest <= max/);
    expect(() => parseContract({ ...contract, nodes: ['Body'] })).toThrow(/must start with DEMO_/);
  });
});

describe('summarize', () => {
  it('counts triangles per mesh instance and primitives as draw calls', () => {
    const s = sum({ quads: 3 });
    expect(s.triangles).toBe(12); // body + arm geo share a 6-tri mesh
    expect(s.drawCalls).toBe(2);
    expect(s.roots).toEqual(['DEMO']);
    expect(s.materials).toEqual(['MAT_Clay']);
  });
});

describe('checkContract', () => {
  it('passes a well-formed asset', () => {
    expect(checkContract(contract, pair())).toEqual([]);
  });

  it('reports missing sockets and LOD socket mismatches', () => {
    const errors = checkContract(contract, pair({}, { dropSocket: true }));
    expect(errors).toContain('LOD1: missing node SOCKET_Label');
    expect(errors).toContain('LOD1: sockets/animated nodes differ from LOD0');
  });

  it('enforces the hierarchy rule (nodes with children are empties)', () => {
    const errors = checkContract(contract, pair({ meshOnParent: true }));
    expect(errors.some((e) => e.includes("'DEMO_Arm' has a mesh and children"))).toBe(true);
  });

  it('checks fx_* extras against the contract', () => {
    const errors = checkContract(
      contract,
      pair({ armExtras: { fx_anim: 'rot', fx_axis: 'x', fx_min: 0, fx_max: 45, fx_rest: 0, fx_unit: 'deg' } }),
    );
    expect(errors).toContain('LOD0: DEMO_Arm.fx_axis x != y');
    expect(errors).toContain('LOD0: DEMO_Arm.fx_max 45 != 40');
  });

  it('rejects foreign materials and MAT_Accent unless allowed', () => {
    expect(checkContract(contract, pair({ material: 'Material.001' }))).toContain(
      "LOD0: material 'Material.001' not allowed",
    );
    expect(checkContract(contract, pair({ material: 'MAT_Accent' }))).toContain(
      "LOD0: material 'MAT_Accent' not allowed",
    );
    expect(checkContract({ ...contract, allowAccent: true }, pair({ material: 'MAT_Accent' }))).toEqual([]);
  });

  it('enforces triangle, byte and draw-call budgets', () => {
    const errors = checkContract(contract, [sum({ quads: 60 }, 50_000), sum({ lod: 1 })]);
    expect(errors).toContain('LOD0: 240 tris > budget 100');
    expect(errors).toContain('LOD0: 50000 B > budget 40000 B');
    expect(checkContract(contract, [sum()])).toContain('expected 2 LOD file(s), got 1');
  });
});

describe('codegen', () => {
  it('derives short keys and cache-busted LOD urls', () => {
    expect(shortKey('TANK_V', 'TANK_V_Body')).toBe('Body');
    expect(shortKey('TOWER', 'SOCKET_CatchPointL')).toBe('CatchPointL');
    expect(lodUrl('tower', 0, 'abcdef1234')).toBe('/models/tower.glb?v=abcdef12');
    expect(lodUrl('tower', 2, 'abcdef1234')).toBe('/models/tower_lod2.glb?v=abcdef12');
  });

  it('emits an `as const` wrapper with nodes, sockets and anim ranges', () => {
    const code = generateAsset({ contract, summaries: pair(), hashes: ['a'.repeat(64), 'b'.repeat(64)] });
    expect(code).toContain('export const DEMO = {');
    expect(code).toContain("ArmGeo: 'DEMO_ArmGeo'");
    expect(code).toContain("Label: 'SOCKET_Label'");
    expect(code).toContain("Arm: { node: 'DEMO_Arm', kind: 'rot', axis: 'y', min: 0, max: 40, rest: 0, unit: 'deg' }");
    expect(code).toContain("lods: ['/models/demo_lod1.glb?v=bbbbbbbb']");
    expect(code).toContain('} as const;');
    expect(code).toContain('export type DemoNode');
  });
});
