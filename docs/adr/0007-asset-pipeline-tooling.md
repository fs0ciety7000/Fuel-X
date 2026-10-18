# ADR 0007 — Asset pipeline: Blender 4.5 LTS bpy headless → glTF-Transform (meshopt) → generated typed asset manifests

- **Status**: Proposed (Gate 1)
- **Date**: 2026-10-18
- **Owner**: systems-architect (consulted: blender-technical-artist, three-graphics-engineer)
- **Related**: skill `blender-asset-pipeline`, `docs/ASSETS_GUIDE.md` (naming, sockets, dimensions), `docs/ARCHITECTURE.md` §Asset pipeline, §Performance budget

## Context
Every asset is produced by a committed `blender/assets/<asset>.py`, exported to GLB, optimized,
given a typed code-side handle, and rendered to a preview PNG. Node and socket names are an API.
Assets are matte clay with ~5 shared materials and normally **no textures**. Render code mostly
needs *geometry + named nodes + sockets* to build instanced meshes and drive animated parts — not
a hand-written JSX tree.

## Options considered
| Concern | Options | Choice |
|---|---|---|
| Modeling | **Blender 4.5.14 LTS bpy, headless** · Blender GUI files · code-only three geometry | bpy headless: reproducible, reviewable diffs, preview renders for free |
| Optimization | **glTF-Transform 4.5** (CLI + JS API) · gltfpack | glTF-Transform: scriptable from Node, preserves named empties, validate/inspect built in |
| Mesh compression | **EXT_meshopt_compression** · Draco (KHR_draco) · none | Meshopt: decoder ~20 KB vs Draco wasm ~300 KB, faster decode, works with quantization; Draco rejected |
| Textures | none by default · KTX2/Basis if ever needed | none; KTX2 only via a future ADR |
| Typed wrapper | gltfjsx 6.5.3 (`--types`) · **custom codegen** from the optimized GLB | Custom codegen (below) |

**Why not gltfjsx**: last release Nov 2024; emits a JSX tree that bakes hierarchy into component
code (regeneration overwrites hand edits), and targets one-mesh-per-node rendering, while we need
geometries for `InstancedMesh`/`BatchedMesh`, LOD selection, socket matrices and node lookups by
typed name. A 150-line generator gives exactly that.

## Decision
One command per asset: `npm run asset -- <name>` (all: `npm run assets`), implemented by
`scripts/assets/build.ts` (tsx), stages:
1. **Model + export**: `blender -b --factory-startup -P blender/assets/<name>.py -- --out .cache/assets/<name>.raw.glb --preview docs/assets/<name>.png --tokens src/tokens/generated/tokens.json`. Exporter: `export_format='GLB'`, `export_yup=True` (the only Z→Y conversion), `export_apply=True`, extras on, no textures/cameras/lights. LODs are separate root collections exported as nodes `<ASSET>_LOD0/1`.
2. **Optimize** (glTF-Transform JS API): `dedup → prune (keepLeaves, keep empties/extras) → weld → quantize (position 14 bit, normal 10 bit) → meshopt`; **`flatten`/`join` disabled** on nodes named `SOCKET_*` or animated parts listed in node extras `{ "fx_keep": true }`.
3. **Validate**: glTF-Transform `validate`, then a contract check: required nodes for the asset class (from `blender/assets/<name>.contract.json`: required node names, sockets, tri budget, size budget) — fails the build on violation.
4. **Codegen**: `src/render/assets/generated/<name>.ts` exporting `{ url, nodes: readonly [...] as const, sockets: { SOCKET_Label: {position, quaternion}, … }, bounds, triangles: { LOD0, LOD1 }, bytes }` and a typed `AssetNode<'tower'>` union, plus a registry `generated/index.ts`. Render code loads via `useAsset('tower')` → `{ gltf, node(name: AssetNode<'tower'>) }`.
5. **Determinism check**: build twice in CI-like `npm run assets -- --verify` → byte-identical GLBs (Blender seeds fixed; no timestamps in extras).
6. Output: `public/models/<name>.glb` (committed, never hand-edited), `docs/assets/<name>.png` (preview, Cycles CPU, paper background), budget report appended to `test-results/assets.json` for `perf-audit`.

Runtime decoding: three's `MeshoptDecoder` (`three/examples/jsm/libs/meshopt_decoder.module.js`) registered on the GLTF loader through drei `useGLTF`.

Blender is a **system tool**, not an npm dependency: installed by `scripts/install-blender.sh` (portable 4.5 LTS → `~/.local/bin/blender`), checked by the asset script (`blender --version` must report 4.5.x).

## Consequences
- Positive: assets reproducible from source, small (meshopt + quantization), type-safe node references that break the TS build when a node is renamed.
- Negative: we own the codegen and contract checker; Blender is a ~400 MB system install (already automated by the SessionStart hook).
- Follow-ups: blender-technical-artist owns `blender/lib/{export,materials,preview}.py` and contract JSONs; three-graphics-engineer owns `useAsset` and the codegen output shape.

## Dependencies introduced
| Package | Exact version | One-line justification |
|---|---|---|
| `@gltf-transform/core` | 4.5.0 | Read/write GLB in Node scripts |
| `@gltf-transform/functions` | 4.5.0 | dedup/prune/weld/quantize/meshopt transforms |
| `@gltf-transform/cli` | 4.5.0 | `inspect`/`validate` for humans and the perf audit |
| `meshoptimizer` | 1.2.0 | Meshopt encoder used by glTF-Transform's `meshopt()` |
| *(system)* Blender | 4.5.14 LTS | Procedural modeling, GLB export, preview renders |
