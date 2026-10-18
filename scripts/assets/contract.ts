// Asset contract (ADR 0007 stage 3, ASSETS_GUIDE §3–§6, ARCHITECTURE §13.2).
// Pure module: no fs / process access, so vitest can exercise it with in-memory documents.
import { getBounds } from '@gltf-transform/core';
import type { Document, Mesh, Node } from '@gltf-transform/core';

export type AnimKind = 'rot' | 'trans' | 'spin';
export type Axis = 'x' | 'y' | 'z';
export type AnimUnit = 'deg' | 'm';

export interface AnimSpec {
  kind: AnimKind;
  axis: Axis;
  min: number;
  max: number;
  rest: number;
  unit: AnimUnit;
}

/** ARCHITECTURE §13.2 hard caps per asset class (LOD0..LOD2 tris, LOD0 bytes, LOD0 draw calls). */
export const CLASS_CAPS = {
  'hero-structure': { tris: [40_000, 12_000, 3_000], bytes: 500 * 1024, drawCalls: 10 },
  'hero-vehicle': { tris: [20_000, 6_000, 1_500], bytes: 250 * 1024, drawCalls: 10 },
  'large-machine': { tris: [20_000, 6_000, 1_500], bytes: 250 * 1024, drawCalls: 8 },
  'road-sea-vehicle': { tris: [8_000, 2_000], bytes: 100 * 1024, drawCalls: 8 },
  building: { tris: [5_000, 1_200], bytes: 70 * 1024, drawCalls: 4 },
  prop: { tris: [2_500, 600], bytes: 40 * 1024, drawCalls: 2 },
} as const;
export type AssetClass = keyof typeof CLASS_CAPS;

export interface AssetContract {
  /** Root node name / class prefix, e.g. `TOWER`. */
  asset: string;
  /** File stem in public/models (`tower` → tower.glb, tower_lod1.glb …). */
  file: string;
  class: AssetClass;
  /** Number of LOD files (1 = LOD0 only). */
  lods: number;
  /** Required `<ASSET>_*` nodes (exist in every LOD). */
  nodes: string[];
  /** Required `SOCKET_*` empties (exist in every LOD). */
  sockets: string[];
  /** Animated nodes and their `fx_*` extras (three local space). */
  anim: Record<string, AnimSpec>;
  budget: { tris: number[]; bytes: number; drawCalls: number };
  allowAccent?: boolean;
  /**
   * Linked-duplicate meshes (wheels, axles) are drawn as one `InstancedMesh` each by the renderer
   * (ARCHITECTURE §13.2 "transporter wheels instanced"): the draw-call budget then counts every shared
   * mesh once (`GlbSummary.instancedDrawCalls`) instead of once per node.
   */
  instanceLinked?: boolean;
}

export interface NodeSummary {
  name: string;
  parent: string | null;
  hasMesh: boolean;
  children: number;
  extras: Record<string, unknown>;
}

export interface GlbSummary {
  lod: number;
  bytes: number;
  triangles: number;
  /** Primitives summed over mesh nodes (one draw call per node × material). */
  drawCalls: number;
  /** Primitives summed over distinct meshes (nodes sharing a mesh count once — instanced rendering). */
  instancedDrawCalls: number;
  /** Groups of node names that share one glTF mesh (≥ 2 nodes each), in traversal order. */
  sharedMeshes: string[][];
  roots: string[];
  nodes: NodeSummary[];
  materials: string[];
  textures: number;
  hasTexcoords: boolean;
  /** Y-up (three) bounds of the default scene at rest pose. */
  bounds: { min: [number, number, number]; max: [number, number, number] };
}

export const MATERIALS = ['MAT_Clay', 'MAT_ClayDark', 'MAT_Metal', 'MAT_Glass', 'MAT_Accent'] as const;
const NAME_RE = /^[A-Za-z0-9_]+$/;
const KINDS: readonly string[] = ['rot', 'trans', 'spin'];
const AXES: readonly string[] = ['x', 'y', 'z'];
const UNITS: readonly string[] = ['deg', 'm'];

// ------------------------------------------------------------------------------------------------
// Parsing
// ------------------------------------------------------------------------------------------------
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === 'string');
}
function isNumberArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}
function num(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Validates the JSON shape of `blender/assets/<name>.contract.json`; throws with every problem listed. */
export function parseContract(json: unknown, source = 'contract'): AssetContract {
  const errors: string[] = [];
  if (!isRecord(json)) throw new Error(`${source}: not an object`);
  const { asset, file, lods, nodes, sockets, anim, budget, allowAccent, instanceLinked } = json;
  const cls = json['class'];
  if (typeof asset !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(asset)) errors.push('asset must be UPPER_SNAKE');
  if (typeof file !== 'string' || !/^[a-z][a-z0-9_]*$/.test(file)) errors.push('file must be lower_snake');
  if (typeof cls !== 'string' || !(cls in CLASS_CAPS)) errors.push(`class must be one of ${Object.keys(CLASS_CAPS)}`);
  if (!num(lods) || lods < 1 || lods > 3 || !Number.isInteger(lods)) errors.push('lods must be 1..3');
  if (!isStringArray(nodes)) errors.push('nodes must be a string array');
  if (!isStringArray(sockets)) errors.push('sockets must be a string array');
  if (allowAccent !== undefined && typeof allowAccent !== 'boolean') errors.push('allowAccent must be boolean');
  if (instanceLinked !== undefined && typeof instanceLinked !== 'boolean')
    errors.push('instanceLinked must be boolean');
  if (isStringArray(nodes) && typeof asset === 'string') {
    for (const n of nodes) if (!n.startsWith(`${asset}_`)) errors.push(`node ${n} must start with ${asset}_`);
  }
  if (isStringArray(sockets)) {
    for (const s of sockets) if (!s.startsWith('SOCKET_')) errors.push(`socket ${s} must start with SOCKET_`);
  }
  if (!isRecord(anim)) errors.push('anim must be an object');
  else {
    for (const [name, spec] of Object.entries(anim)) {
      if (!isRecord(spec)) {
        errors.push(`anim.${name} must be an object`);
        continue;
      }
      if (typeof spec['kind'] !== 'string' || !KINDS.includes(spec['kind'])) errors.push(`anim.${name}.kind`);
      if (typeof spec['axis'] !== 'string' || !AXES.includes(spec['axis'])) errors.push(`anim.${name}.axis`);
      if (typeof spec['unit'] !== 'string' || !UNITS.includes(spec['unit'])) errors.push(`anim.${name}.unit`);
      const { min, max, rest } = spec;
      if (!num(min) || !num(max) || !num(rest)) errors.push(`anim.${name} min/max/rest must be numbers`);
      else if (!(min <= rest && rest <= max && min < max)) errors.push(`anim.${name} needs min <= rest <= max`);
      if (isStringArray(nodes) && !nodes.includes(name)) errors.push(`anim.${name} is not listed in nodes`);
    }
  }
  if (!isRecord(budget) || !isNumberArray(budget['tris']) || !num(budget['bytes']) || !num(budget['drawCalls'])) {
    errors.push('budget must be { tris: number[], bytes: number, drawCalls: number }');
  } else if (typeof cls === 'string' && cls in CLASS_CAPS) {
    const caps = CLASS_CAPS[cls as AssetClass];
    const tris = budget['tris'];
    if (num(lods) && tris.length !== lods) errors.push(`budget.tris needs ${lods} entries`);
    tris.forEach((t, i) => {
      const cap = caps.tris[i];
      if (cap === undefined) errors.push(`class ${cls} has no LOD${i}`);
      else if (t > cap) errors.push(`budget.tris[${i}] ${t} exceeds class cap ${cap}`);
    });
    if (budget['bytes'] > caps.bytes) errors.push(`budget.bytes exceeds class cap ${caps.bytes}`);
    if (budget['drawCalls'] > caps.drawCalls) errors.push(`budget.drawCalls exceeds class cap ${caps.drawCalls}`);
  }
  if (errors.length > 0) throw new Error(`${source}: ${errors.join('; ')}`);
  return json as unknown as AssetContract;
}

// ------------------------------------------------------------------------------------------------
// Summaries
// ------------------------------------------------------------------------------------------------
function triangleCount(node: Node): { tris: number; prims: number } {
  const mesh = node.getMesh();
  if (!mesh) return { tris: 0, prims: 0 };
  let tris = 0;
  for (const prim of mesh.listPrimitives()) {
    const count = prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0;
    const mode = prim.getMode();
    if (mode === 4) tris += count / 3;
    else if (mode === 5 || mode === 6) tris += Math.max(0, count - 2);
  }
  return { tris, prims: mesh.listPrimitives().length };
}

export function summarize(doc: Document, bytes: number, lod: number): GlbSummary {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  let triangles = 0;
  let drawCalls = 0;
  let instancedDrawCalls = 0;
  const meshUsers = new Map<Mesh, string[]>();
  const nodes: NodeSummary[] = [];
  const visit = (node: Node, parent: string | null): void => {
    const { tris, prims } = triangleCount(node);
    triangles += tris;
    drawCalls += prims;
    const mesh = node.getMesh();
    if (mesh) {
      const users = meshUsers.get(mesh);
      if (users) users.push(node.getName());
      else {
        meshUsers.set(mesh, [node.getName()]);
        instancedDrawCalls += prims;
      }
    }
    const children = node.listChildren();
    nodes.push({
      name: node.getName(),
      parent,
      hasMesh: node.getMesh() !== null,
      children: children.length,
      extras: { ...node.getExtras() },
    });
    for (const c of children) visit(c, node.getName());
  };
  const roots = scene ? scene.listChildren() : [];
  for (const r of roots) visit(r, null);
  const hasTexcoords = root
    .listMeshes()
    .some((m) => m.listPrimitives().some((p) => p.listSemantics().some((s) => s.startsWith('TEXCOORD'))));
  const bb = scene ? getBounds(scene) : { min: [0, 0, 0], max: [0, 0, 0] };
  const r3 = (v: number | undefined): number => Math.round((v ?? 0) * 1000) / 1000;
  return {
    lod,
    bytes,
    triangles,
    drawCalls,
    instancedDrawCalls,
    sharedMeshes: [...meshUsers.values()].filter((u) => u.length > 1),
    roots: roots.map((r) => r.getName()),
    nodes,
    materials: root
      .listMaterials()
      .map((m) => m.getName())
      .sort(),
    textures: root.listTextures().length,
    hasTexcoords,
    bounds: {
      min: [r3(bb.min[0]), r3(bb.min[1]), r3(bb.min[2])],
      max: [r3(bb.max[0]), r3(bb.max[1]), r3(bb.max[2])],
    },
  };
}

// ------------------------------------------------------------------------------------------------
// Check
// ------------------------------------------------------------------------------------------------
function close(a: unknown, b: number): boolean {
  return typeof a === 'number' && Math.abs(a - b) < 1e-4;
}

/** Draw calls the renderer will issue at LOD0: shared meshes count once when the contract opts into instancing. */
export function effectiveDrawCalls(c: AssetContract, s: GlbSummary): number {
  return c.instanceLinked ? s.instancedDrawCalls : s.drawCalls;
}

/** Returns every contract violation (empty = pass). `summaries[i]` is LOD i. */
export function checkContract(c: AssetContract, summaries: GlbSummary[]): string[] {
  const errors: string[] = [];
  if (summaries.length !== c.lods) errors.push(`expected ${c.lods} LOD file(s), got ${summaries.length}`);
  const animNames = new Set(Object.keys(c.anim));
  const nameSets: string[][] = [];

  for (const s of summaries) {
    const tag = `LOD${s.lod}`;
    const err = (m: string): void => {
      errors.push(`${tag}: ${m}`);
    };
    if (s.roots.length !== 1 || s.roots[0] !== c.asset) err(`expected one root '${c.asset}', got [${s.roots}]`);
    const rootNode = s.nodes.find((n) => n.parent === null && n.name === c.asset);
    if (rootNode) {
      if (rootNode.extras['fx_asset'] !== c.asset) err(`root extras.fx_asset must be '${c.asset}'`);
      if (rootNode.extras['fx_lod'] !== s.lod) err(`root extras.fx_lod must be ${s.lod}`);
      if (typeof rootNode.extras['fx_version'] !== 'number') err('root extras.fx_version missing');
      if (rootNode.hasMesh) err('root must be an empty');
    }
    const byName = new Map<string, NodeSummary>();
    for (const n of s.nodes) {
      if (!NAME_RE.test(n.name)) err(`bad node name '${n.name}' (unnamed nodes come from meshes with children)`);
      else if (byName.has(n.name)) err(`duplicate node name '${n.name}'`);
      byName.set(n.name, n);
      if (n.name !== c.asset && !n.name.startsWith(`${c.asset}_`) && !n.name.startsWith('SOCKET_')) {
        err(`node '${n.name}' is neither ${c.asset}_* nor SOCKET_*`);
      }
      if (n.hasMesh && n.children > 0) err(`node '${n.name}' has a mesh and children (must be an empty)`);
      if (n.name.startsWith('SOCKET_') && (n.hasMesh || n.children > 0)) err(`socket '${n.name}' must be a leaf empty`);
      if ('fx_anim' in n.extras && !animNames.has(n.name)) err(`node '${n.name}' has fx_anim but is not in contract`);
    }
    for (const name of [...c.nodes, ...c.sockets]) if (!byName.has(name)) err(`missing node ${name}`);
    for (const [name, spec] of Object.entries(c.anim)) {
      const n = byName.get(name);
      if (!n) continue;
      if (n.hasMesh) err(`animated node '${name}' must be an empty (pivot)`);
      const x = n.extras;
      if (x['fx_anim'] !== spec.kind) err(`${name}.fx_anim ${String(x['fx_anim'])} != ${spec.kind}`);
      if (x['fx_axis'] !== spec.axis) err(`${name}.fx_axis ${String(x['fx_axis'])} != ${spec.axis}`);
      if (x['fx_unit'] !== spec.unit) err(`${name}.fx_unit ${String(x['fx_unit'])} != ${spec.unit}`);
      if (!close(x['fx_min'], spec.min)) err(`${name}.fx_min ${String(x['fx_min'])} != ${spec.min}`);
      if (!close(x['fx_max'], spec.max)) err(`${name}.fx_max ${String(x['fx_max'])} != ${spec.max}`);
      if (!close(x['fx_rest'], spec.rest)) err(`${name}.fx_rest ${String(x['fx_rest'])} != ${spec.rest}`);
    }
    const allowed: readonly string[] = c.allowAccent ? MATERIALS : MATERIALS.filter((m) => m !== 'MAT_Accent');
    for (const m of s.materials) if (!allowed.includes(m)) err(`material '${m}' not allowed`);
    if (s.textures > 0) err(`${s.textures} texture(s) — textures need an ADR`);
    if (s.hasTexcoords) err('TEXCOORD attributes present (export_texcoords must be off)');
    const triBudget = c.budget.tris[s.lod];
    if (triBudget !== undefined && s.triangles > triBudget) err(`${s.triangles} tris > budget ${triBudget}`);
    if (s.lod === 0) {
      if (s.bytes > c.budget.bytes) err(`${s.bytes} B > budget ${c.budget.bytes} B`);
      const dc = effectiveDrawCalls(c, s);
      if (dc > c.budget.drawCalls) {
        err(`${dc}${c.instanceLinked ? ' instanced' : ''} draw calls > budget ${c.budget.drawCalls}`);
      }
    }
    nameSets.push(
      s.nodes
        .map((n) => n.name)
        .filter((n) => n.startsWith('SOCKET_') || animNames.has(n))
        .sort(),
    );
  }
  const ref = nameSets[0];
  nameSets.forEach((set, i) => {
    if (ref && i > 0 && set.join(',') !== ref.join(',')) {
      errors.push(`LOD${i}: sockets/animated nodes differ from LOD0`);
    }
  });
  return errors;
}
