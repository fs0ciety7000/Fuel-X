---
name: blender-asset-pipeline
description: Create or modify a Fuel-X 3D asset (tower, booster, ship, tank, tanker, transporter, crane, building, boat, prop) end to end — procedural bpy script run headless in Blender, GLB export, optimization, typed wrapper generation, Blender preview render, validation against the asset contract. Use for any change under blender/ or public/models/.
---

# Blender asset pipeline

Assets are **code**: `blender/assets/<asset>.py` → `public/models/<asset>.glb` + `docs/assets/<asset>.png`. Never hand-edit a `.blend` or a `.glb`.

## 0. Prerequisites
- `blender --version` must print 4.5 LTS. If missing: `scripts/install-blender.sh` (portable build in `~/.local`, symlink in `~/.local/bin` — make sure that dir is on `PATH`).
- Read `docs/ASSETS_GUIDE.md` (dimensions table, node naming, sockets, materials, budgets) before modeling.

## 1. Write / edit the script
Start from `template_asset.py` (next to this file). Copy it to `blender/assets/<asset>.py`. Rules:
- Start from an empty factory scene; build everything procedurally from helpers in `blender/lib/` (create the helper there if it's reusable: trusses, tanks, wheels, railings…).
- 1 BU = 1 m, Z-up, origin at ground contact / logical pivot. Parameters as module-level constants (or CLI args after `--`).
- Node names follow the contract: `<ASSET>_<Part>` for meshes, `SOCKET_<Name>` empties for attachment points (exhaust, labels, catch points, cargo). Animated parts are separate objects with their pivot at the joint.
- Only shared materials: `MAT_Clay`, `MAT_ClayDark`, `MAT_Metal`, `MAT_Glass`, `MAT_Accent`, colors from the design tokens (`src/ui/tokens` or `docs/DESIGN_SYSTEM.md`). Matte (roughness ≈ 0.9), no textures by default.
- Apply modifiers and transforms before export; keep the triangle count within the asset's budget.

## 2. Run headless
```bash
blender -b --factory-startup -P blender/assets/<asset>.py -- --out public/models/<asset>.glb --preview docs/assets/<asset>.png
```
(Once scaffolding exists, the same thing is `npm run asset -- <asset>`; `npm run assets` rebuilds everything.)
The exporter uses `export_yup=True` — the Z-up → Y-up conversion happens only there.

## 3. Optimize
Run the optimizer chosen in the asset-pipeline ADR (default: `gltf-transform` — dedup, prune, weld, quantize, meshopt; Draco only if the ADR says so). Never optimize away named nodes or empties: sockets must survive.

## 4. Generate the typed wrapper
Use the tool chosen in the ADR (e.g. `gltfjsx --types` for R3F) so render code references nodes by typed name. Re-generate on every node change.

## 5. Preview render (Blender)
The template renders a 1024×1024 PNG with Cycles (CPU, low samples + denoise): paper substrate background (`#F4F4F0`), soft sun from the same direction as the game, 3/4 elevated camera auto-framed on the asset bounds. Commit it in `docs/assets/`. Optionally render a 12-frame turntable for the review.

## 6. Validate (all must pass)
- [ ] Script runs with no Python errors; output deterministic (re-run → identical GLB size)
- [ ] `gltf-transform inspect` (or validator) clean; triangles and file size within budget
- [ ] Every node/socket name referenced in code exists (grep render code for `<ASSET>_` / `SOCKET_`)
- [ ] Preview PNG committed and reviewed (look at it with the Read tool)
- [ ] Asset visible in-scene at correct scale (`visual-check`), ASSETS_GUIDE.md table updated
- [ ] Renamed nodes = breaking change: callers updated in the same commit
