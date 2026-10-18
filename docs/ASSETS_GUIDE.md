# Fuel-X — Assets Guide

Owner: `blender-technical-artist` · Status: **Phase 4** — pipeline live (`npm run asset -- <name>`), TOWER shipped; tank farm, TANKER, TRANSPORTER, VAN, WX_STATION shipped (4.5). Budgets per ARCHITECTURE §13.2, colors from `src/tokens/generated/tokens.json`.
Procedure for producing an asset: skill `blender-asset-pipeline`. This document is the **contract** between Blender scripts and render code.

Class names below (`TOWER`, `BOOSTER`, `TANK_V`…) are technical asset classes, not lore names. Call-signs (`TOWER-1`, `B-14`) are runtime data and never appear in node names.

---

## 1. Space, units, pivots

| Rule | Value |
|---|---|
| Unit | 1 Blender unit = **1 m**. Scene unit scale 1.0. No scaling at runtime except deliberate variants. |
| Up axis | Blender **+Z up**. Conversion to glTF/three **+Y up happens only in the exporter** (`export_yup=True`). Never rotate objects by hand to compensate. |
| Forward | Every asset **faces Blender −Y** (Blender "Front" view looks at this face). The exporter maps Blender −Y → glTF **+Z**, which is the axis `Object3D.lookAt()` aims for non-camera objects. Verified: a node at Blender `(0, 5, 0)` exports to glTF `(0, 0, −5)`. |
| Left / Right | `L` = Blender **+X** side, `R` = Blender **−X** side (explicit, not "viewer's left"). |
| Origin | Ground contact, centered on footprint, at Z = 0 (vehicles: under the wheels/tracks; boats: at the **waterline**; booster/ship: center of the engine plane, i.e. the bottom of the vehicle). |
| Transforms | Applied before export (`transform_apply` rot+scale). Nodes keep only translation, plus rotation where the pivot frame requires it. |
| Pivots | Every animated part is a node whose origin is the physical joint (hinge, slew ring, axle, gimbal plane). |
| Socket frame | A socket's local **+Z (Blender) = emission / attach direction**. After export that is local **+Y** in three. Exhaust sockets therefore point down (rotated 180° about X). |
| Scale reference | Previews and the lineup render include a 1.8 m human silhouette (preview-only, never exported). |

Axis mapping cheat sheet (Blender → three): `X → X`, `Y → −Z`, `Z → Y`. A rotation about Blender +Z equals a rotation about three +Y with the same sign. **Motion ranges in this guide and in node extras are given in three (Y-up) local space.**

## 2. Dimensions (real-ish, MVP and later)

Vehicle class: large fully reusable two-stage methane/LOX rocket, tower-caught booster. Sanity check of the stack: mount deck 20 m + booster 71 m + ship 52 m = **143 m**, under the 146 m tower tip; catch pins at ~66 m on the booster put the carriage at ~86 m when the booster sits on the mount, well inside its 25–135 m travel.

| Class | L × W × H (m) | Notes | Phase |
|---|---|---|---|
| `TOWER` | 13 × 13 × 146 | Square lattice 0–135 m, gantry + lightning mast to 146. Arms ~36 m long, hinges at front corners (x = ±6.5, y = −6.5). Mount center at y = −26. | MVP |
| `PAD` | apron 120 × 120 × 0.5; mount 30 × 30 × 20 | Launch mount: 6 legs (hexagon r 12, none on ±Y), table 13.5–18 m, ring OD 18 / ID 9.5 m with its top (deck) at 20 m. Flame trench toward −Y (front), 10 m wide, floor at grade between 3 m berms (a below-grade cut is hidden by the terrain plane). | MVP |
| `BOOSTER` | Ø 9 × 71 | 33 engines (3 + 10 inner gimballed, 20 outer fixed), 4 grid fins (6 m chord × 3 m span, horizontal lattice) hinged at 68.4 m — above the catch arms, ±30° never reaches them —, 2 catch pins at 66 m (pin lower face = contact plane), hot-stage ring 69–71 m. | MVP |
| `SHIP` | Ø 9 × 52 | Barrel 0–37 m, blunted nose 37–52 m. 6 engines (3 SL gimballed on r 1.3, 3 vac fixed on r 3.25), 2 fore flaps (6.2 m root along the nose line × 3 m, hinges 45.2–51 m), 2 aft flaps (10 × 4 m, hinges 1.5–11.5 m), 2 lift pins at 44 m (just below the fore flaps), heat shield on the −Y half (belly), QD plate at 9 m on the leeward side. | MVP |
| `TANK_V` | Ø 6 × 28 | Vertical cryo tank, 2 m skirt, ellipsoidal head, ladder cage. Variant Ø 4.5 × 20. | MVP |
| `TANK_H` | 22 × Ø 3.6 (top at 5.2) | Horizontal tank on 2 saddles. | MVP |
| `TANK_SPHERE` | Ø 18, top at 24 | Sphere on 8 legs, equatorial ring, stair. | MVP |
| `TANKER` | 21 × 2.6 × 4.0 | Tractor 7 m + cryo trailer 14 m, 5 axles, articulated at the fifth wheel. | MVP |
| `TRANSPORTER` | 16 × 14 × 1.6 deck (+3 m stand) | SPMT-style: 2 lines × 8 bogies, carries booster or ship vertically on a stand. Power pack overhangs the rear by 1.6 m (17.6 m overall). | MVP |
| `VAN` | 6.0 × 2.1 × 2.7 | Pad crew / shift / patrol vans (one mesh, variants by label only). | MVP |
| `BOAT_RANGE` | 26 × 6.5 × 9 (above WL) | Range safety boat, mast + radar. | MVP |
| `VESSEL_RECOVERY` | 72 × 16 × 24 (above WL) | Offshore support vessel, aft cargo deck 30 × 14 m, deck crane, radar. | MVP |
| `WX_STATION` | 3 × 3 × 10 | Mast, instrument box, anemometer, wind vane. | MVP |
| `BLDG_HIGHBAY` | 32 × 32 × 85 | Tall bay for stacking ships; vertical door 18 × 60 m on −Y face. | MVP (yard) |
| `BLDG_MEGABAY` | 70 × 50 × 90 | Booster integration bay; door 22 × 80 m. | MVP (yard) |
| `HANGAR_TENT` | 45 × 30 × 18 | Barrel-vault tent hangar. | MVP (yard) |
| `CRANE` | tracks 12 × 10; boom 96 | Crawler crane, superstructure 14 m, lattice boom. | MVP-nice |
| `PAD_UC` | as `PAD` + scaffolds | Second pad under construction (parameter variant of `PAD`/`TOWER` partial height). | Later |
| `STAND_TEST` | 20 × 20 × 30 | Suborbital test stand. | Later |
| `PROP_LandingFrame` | 12 × 12 × 4 | Cargo on the recovery deck. | Later |
| `PROP_*` | — | Fences, lights masts, road barriers, cones, piping runs. | Later |

## 3. Node naming contract

Node names are **API**. Renaming = breaking change: grep `src/` and update callers in the same commit.

- File: `public/models/<class_lower>.glb` (`tower.glb`, `tank_v.glb`, `vessel_recovery.glb`), LODs `<class_lower>_lod1.glb`, `_lod2.glb`.
- Root: exactly one root empty named `<ASSET>` (e.g. `TOWER`) at the origin, with extras `{ fx_asset, fx_version, fx_lod }`.
- Meshes: `<ASSET>_<Part>` — Part is PascalCase ASCII, indices two digits from 01 (`TRANSPORTER_Wheel_03`), sides suffix `L`/`R` (`TOWER_ArmL`). Mesh data name = object name.
- Sockets: empties `SOCKET_<Name>` (indices `SOCKET_Engine_07`). Socket names are unique inside a GLB, not globally; code always resolves them under an asset instance.
- Forbidden: `.` in names (Blender `.001` duplicates), spaces, non-ASCII, LOD suffixes in node names (each LOD file has the same names).
- Parse with the known class prefix (class names contain `_`, e.g. `TANK_V_Body`); never split on the first underscore.
- **Hierarchy rule: a node with children is an empty** (pivot/group); geometry lives in leaf meshes (`TOWER_Carriage` empty → `TOWER_CarriageGeo` mesh + children). Reason (verified by experiment): `meshopt` quantization moves the mesh of any node that has children into a new **unnamed** child node, so `nodes.X.geometry` would break. Render code animates the named empty as an `Object3D`.
- Static geometry is merged per material into as few leaf meshes as possible (`<ASSET>_Static`, or a few descriptive parts if code needs them).

### Animation metadata in extras (machine-readable)
Every animated node carries custom properties exported as glTF `extras` (verified to survive the 4.5 exporter and `gltf-transform`):
`fx_anim` = `rot` | `trans` | `spin`, `fx_axis` = `x|y|z` (three local space), `fx_min`, `fx_max`, `fx_rest`, `fx_unit` = `deg|m`. The typed-wrapper generator (§7) turns these into constants so the sim/render never hard-code ranges. **No baked animation clips** (unless an ADR says otherwise); motion is driven by sim state.

## 4. Per-asset node & socket contract

Common sockets for every entity: `SOCKET_Label` (tag anchor, 2–4 m above the top), `SOCKET_Focus` (camera follow target, ≈ visual center). Below: additional required nodes. Ranges are in three local space; rotation signs are positive = counter-clockwise looking down the axis.

### TOWER
| Node | Type | Pivot | Motion |
|---|---|---|---|
| `TOWER_Static` | mesh | origin | lattice, gantry, lightning mast, stairs (merged) |
| `TOWER_Carriage` | empty | carriage center on the front face | `trans y` 25 → 135 m, rest 86 |
| `TOWER_ArmL` / `TOWER_ArmR` (children of carriage) | empty | hinge axis at (±6.5, −6.5) | `rot y` 0° (closed, parallel, 9.6 m gap) → open ±40° (L +, R −) |
| `TOWER_ArmLGeo`, `TOWER_ArmRGeo` | mesh | — | arm geometry incl. catch rails |
| `TOWER_QDArm` | empty | hinge on a bracket outboard of the R front corner, (−11, −7.5, 100) | `rot y` 0° (stowed, swung out to the R side, clear of the carriage path and the R arm sweep) → 90° (engaged: points at the ship hull, 17.0 m) |
| Later: `TOWER_ArmL_Cart` / `R` | empty | on arm rail | `trans` along arm 0 → 4 m (shock absorber) |

Sockets: `SOCKET_CatchPointL/R` (on the arm rails, where booster pins rest: (±5.4, −26, carriage z) when closed), `SOCKET_ShipQD` (QD arm tip, +Z along the arm into the ship; engaged it sits on the Ø 9 hull at ≈ (−2.3, −22.1, 100), so SHIP `SOCKET_QD` goes on the hull facing the tower's R front corner, at z = 100 − 91 = 9 m above the ship base), `SOCKET_Mount` (= where `PAD` origin goes, (0, −26, 0)), `SOCKET_Label` (z 150), `SOCKET_Focus` (front face, h 70 m), `SOCKET_CatchFocus` (camera target for the catch, (0, −26, 86)).

Why the QD hinge moved off the front face (Phase 4): stowed across the front face, the QD arm sits in the carriage/arm travel path at 100 m (the carriage passes it between booster catch ~86 m and ship stacking ~135 m). Operational rule for the sim: keep the carriage out of 92–106 m while the QD arm is engaged.

### PAD (launch mount + apron)
`PAD_Static`; `PAD_BQD` (empty on the ring top at (0, 4.75, 20) → `PAD_BQDGeo`; booster quick-disconnect hood against the skirt on the +Y side, `trans y` 0 → −1.5 m, retracted at liftoff); `PAD_Clamps` (empty at the deck center → `PAD_ClampsGeo`, 20 hold-down clamps every 15° with a ±30° gap at the BQD; `trans y` −0.8 → 0 m, rest 0: they drop into the ring at liftoff, cosmetic). Sockets: `SOCKET_VehicleMount` (deck center, (0, 0, 20) = BOOSTER origin), `SOCKET_FlameTrench` (trench exit (0, −48, 1), +Z along the trench toward −Y), `SOCKET_Deluge_01..04` (ring top at 45/135/225/315°, +Z up), `SOCKET_Label` (z 24), `SOCKET_Focus` (z 10).

As built (4.4): one rigid `rot` cannot move 20 clamps "outwards", so `PAD_Clamps` is a single `trans` (one draw call instead of 20 animated nodes). Draw calls 6 = `PAD_Static` × 3 materials + BQD × 2 + clamps × 1.

### BOOSTER
`BOOSTER_Static` (body, chines, raceways, hot-stage ring, catch pins, outer 20 engines); `BOOSTER_EnginesGimbal` (empty at gimbal plane z = 2.5, `rot x` ±8°, pitch) → `BOOSTER_EnginesGimbalYaw` (empty at the same point, `rot z` ±8°, yaw) → `BOOSTER_EnginesInner` (13 engines) + `SOCKET_Engine_01..13`; `BOOSTER_GridFinMount_01..04` (static empties on the hull at 45°/135°/225°/315°, z 68.4, local +X radial) → `BOOSTER_GridFin_01..04` (`rot x` = about the radial axis, ±30°, rest 0, identity rest rotation) → `BOOSTER_GridFinGeo_01..04` (linked duplicates). Landing legs: **none** (tower catch).
Sockets: `SOCKET_Exhaust` (engine plane center, pointing down), `SOCKET_Engine_01..33` (each bell exit, pointing down; 01–03 center, 04–13 inner ring — children of the yaw gimbal so plumes follow it —, 14–33 outer ring; extras `fx_ring` = inner|outer — lets the renderer drop a plume on engine-out), `SOCKET_CatchPinL/R` ((±5.4, 0, 66), the pin's lower face; coincides with tower `SOCKET_CatchPointL/R` when the booster sits on the mount and the carriage is at 86 m), `SOCKET_ShipMount` ((0, 0, 71) top of the hot-stage ring = SHIP origin), `SOCKET_BQD` ((0, 4.5, 1.6) on the skirt, +Z toward +Y = the pad BQD hood), `SOCKET_Label` (z 74), `SOCKET_Focus` (z 35).

As built (4.4): one node carries one `fx_anim`, so two-axis gimbals are two nested empties at the same point (pitch outer, yaw inner). Animated nodes always have an identity rest rotation unless their rest is about their own animated axis — azimuth/tilt lives on a static `…Mount` parent — so render code can set `rotation[axis]` directly.

### SHIP
`SHIP_Static` (hull, nose, heat shield on the −Y half in `MAT_ClayDark`, lift pins, QD plate, vac engines); `SHIP_FlapMountFL/FR/AL/AR` (static empties on the hinge line at the ±X tile line, 0.3 m off the hull; fore mounts tilted 21° to follow the nose) → `SHIP_FlapFL/FR/AL/AR` (`rot y` about the hinge line: 0° folded along +Y (leeward) → 90° deployed radially; **L negative (−90 → 0), R positive (0 → 90)** like `TOWER_ArmL/R`, rest ±45°, exported at rest) → `SHIP_Flap…Geo`; `SHIP_EnginesGimbal` (empty at the gimbal plane z 2.4, `rot x` ±12°) → `SHIP_EnginesGimbalYaw` (`rot z` ±12°) → `SHIP_EnginesSL` (3 SL engines) + `SOCKET_Engine_01..03`.
Sockets: `SOCKET_Exhaust` (origin, down), `SOCKET_Engine_01..06` (bell exits, down; 01–03 SL `fx_ring = inner`, 04–06 vac `fx_ring = outer`), `SOCKET_LiftPinL/R` ((±5.4, 0, 44); on the stack they coincide with TOWER `SOCKET_CatchPointL/R` at carriage 135 m = its max travel), `SOCKET_QD` ((−2.30, 3.87, 9) on the hull radius toward the TOWER QD hinge, +Z outward; coincides with TOWER `SOCKET_ShipQD` at 90°, directions opposed), `SOCKET_Label` (z 55), `SOCKET_Focus` (z 26).

### Stack alignment check (`_stack.png`)
`blender -b --factory-startup --python-exit-code 1 -P blender/lib/composite.py -- --out docs/assets/_stack.png` builds TOWER, PAD, BOOSTER and SHIP from their scripts, places them **only through sockets** (PAD at the site origin, TOWER at PAD − `SOCKET_Mount` = site-lc1 `(0, 0, −26)` three, BOOSTER on `SOCKET_VehicleMount`, SHIP on `SOCKET_ShipMount`) and fails unless: catch points = catch pins (carriage 86 m, arms closed), `SOCKET_ShipQD` = `SOCKET_QD` with opposed +Z (QD arm 90°), catch points = lift pins at carriage 135 m, stack top (143 m) < tower tip (146 m). As built 4.4: all Δ = 0.000 m. Re-run it whenever one of the four scripts changes.

### TANK_V / TANK_H / TANK_SPHERE (instancing-friendly)
Single leaf mesh `<ASSET>_Body` (≤ 2 materials), no animated parts. Sockets: `SOCKET_Fill` (pipe connection, faces −Y), `SOCKET_Vent` (boil-off steam, +Z up), `SOCKET_Label`, `SOCKET_Focus`.
As built (4.5): `MAT_Clay` shell + `MAT_ClayDark` details (`TANK_SPHERE`: `MAT_Metal` legs/stairs), 2 LODs (LOD1 drops ladders, rails, stiffeners). One GLB per class → one `InstancedMesh` per class and LOD in the farm. The Ø 4.5 × 20 `TANK_V` variant is not built yet (no placement uses it).

### TANKER
`TANKER_Tractor` (empty) → `TANKER_TractorGeo`, `TANKER_Axle_01..02` (`spin x`), `TANKER_Steer` (front axle, `rot y` ±35°); `TANKER_Trailer` (empty at fifth wheel, `rot y` ±70°) → `TANKER_TrailerGeo`, `TANKER_Axle_03..05`. Sockets: `SOCKET_Hose` (trailer rear valve box), `SOCKET_Label`, `SOCKET_Focus`.
As built (4.5): every `TANKER_Axle_NN` is an empty on the axle (the hierarchy rule: animated nodes are empties) with a leaf `TANKER_AxleGeo_NN`, all five sharing one mesh (`instanced` list in the wrapper). `TANKER_Axle_01` is a child of `TANKER_Steer` (0, −9.3, 0.5); `TANKER_Axle_02` (drive) at (0, −5.4, 0.5); `TANKER_Trailer` is a sibling of `TANKER_Tractor` at the king pin (0, −5.9, 1.2) with axles 03–05 at world y 6.0 / 7.4 / 8.8; `SOCKET_Hose` is under the trailer, +Z → aft. LX (RIME, LOX) and MX (FEN, LNG) share this one GLB — the trailers are near-identical at game scale, the variant is the call-sign label — so the whole fleet is one instance pool.

### TRANSPORTER
`TRANSPORTER_Static` (chassis, power pack); `TRANSPORTER_Deck` (empty, `trans y` 0 → 0.6 m) → deck + stand; `TRANSPORTER_Bogie_01..16` (empty at king pin, `rot y` ±90° — SPMTs crab and pivot) → each `TRANSPORTER_Wheel_01..16` (one mesh per wheel pair, pivot on axle, `spin x`). Wheels are linked duplicates of one mesh. Sockets: `SOCKET_Cargo` (stand top center — booster/ship origin goes here), `SOCKET_Label`, `SOCKET_Focus`.
As built (4.5): `TRANSPORTER_Deck` at the deck top centre (0, 0, 1.6) → `TRANSPORTER_DeckGeo` + `SOCKET_Cargo` (local z 3.0, world 4.6 at rest; ring girder Ø 9.2 / ID 7.8 on 8 columns, bells sit inside the ring). Bogies: king pins at x = ±5.4, y = −7 … 7 (2 m pitch), z = 1.0; **01–08 = L line (+X) front→rear, 09–16 = R line (−X)**. Each bogie → `TRANSPORTER_BogieGeo_NN` (steering housing) + `TRANSPORTER_Wheel_NN` (empty on the axle, z = 0.45) → `TRANSPORTER_WheelGeo_NN`; BogieGeo and WheelGeo are two shared meshes (16 nodes each). A wheel pair spans 1.64 m, so any steer pattern within ±90° is collision-free at the 2 m pitch (carousel: `rot y = atan(y/x)` per bogie).

### CRANE
`CRANE_Static` (tracks, carbody); `CRANE_Upper` (empty at slew ring, z = 3, `rot y` −180° → 180°); `CRANE_Boom` (empty at boom foot, `rot x` 20° → 85° luff, rest 70°); `CRANE_Cable` (unit-length 1 m mesh hanging from the tip, render scales `y` to cable length); `CRANE_Hook` (empty, `trans y` along the cable). Sockets: `SOCKET_Hook` (load attach), `SOCKET_BoomTip`, `SOCKET_Label`, `SOCKET_Focus`.

### BOAT_RANGE / VESSEL_RECOVERY
`<ASSET>_Static`; `<ASSET>_Radar` (`spin y`, continuous); recovery vessel also `VESSEL_RECOVERY_DeckCrane` (`rot y` ±150°). Sockets: `SOCKET_Wake` (stern, waterline, +Z aft), `SOCKET_Bow` (foam), `SOCKET_Deck` (cargo mount, vessel only), `SOCKET_Label`, `SOCKET_Focus`.

### VAN (instanced)
Single mesh `VAN_Body`, wheels merged, no animated parts (not visible at game scale). Sockets: `SOCKET_Label`.
As built (4.5): `MAT_Clay` + `MAT_Glass` (glass, tyres, bumpers — the only dark material allowed within the 2-material cap); also `SOCKET_Focus` (z 1.4).

### WX_STATION
`WX_STATION_Static`; `WX_STATION_Anemometer` (`spin y`); `WX_STATION_Vane` (`rot y`, 0–360°, shows wind direction — gameplay readable). Sockets: `SOCKET_Label`.
As built (4.5): both rotors are empties at (±1.2, 0, 9.55) with leaf `…Geo` meshes (anemometer L/+X, vane R/−X). **Vane at 0° points its arrow along local −Y (glTF +Z)**; it points into the wind, so render sets `rot y` = the heading the wind blows from (CCW from above, in the asset's frame). Contract class `building` (4 draw calls: Static ×2 materials + 2 rotors) — see §12 Q6.

### BLDG_HIGHBAY / BLDG_MEGABAY / HANGAR_TENT
`<ASSET>_Static`; highbay/megabay `<ASSET>_Door` (vertical lift, `trans y` 0 → door height). Sockets: `SOCKET_DoorOut` (ground point just outside the door, path waypoint), `SOCKET_Label`.

## 5. Material contract

Only these five shared materials may exist in a GLB. Colors come from the design-token export (`materials_from_tokens()` reads it; no hex literal in asset scripts). Proposed mapping — final token names belong to `docs/DESIGN_SYSTEM.md`:

| Material | Token (proposed) | ≈ sRGB | Roughness | Metallic | Use |
|---|---|---|---|---|---|
| `MAT_Clay` | `clay.base` | `#E9E8E3` | 0.9 | 0 | default for everything |
| `MAT_ClayDark` | `clay.shade` | `#B9B8B2` | 0.9 | 0 | engine bells, heat shield, tracks/tyres, doors, trench, contrast details |
| `MAT_Metal` | `clay.metal` | `#CFCFCB` | 0.6 | 0.3 | lattices, rails, piping. Metallic kept ≤ 0.3: without an env map, three renders metals dark |
| `MAT_Glass` | `ink.glass` | neutral grey ≈ `#8E8E8A` | 0.25 | 0 | windows, bridge glazing. **Opaque**, no transmission. (The template's `#9DA3A6` is slightly blue — replace by a neutral ink token: one hue only.) |
| `MAT_Accent` | `accent` | `#FF5A1F` | 0.8 | 0 | see below |

- Colors are converted sRGB → linear in Blender (`hex_to_linear`); glTF stores linear factors; three's GLTFLoader reads them correctly with sRGB output.
- **`MAT_Accent` on models is the exception**: orange means thrust, selection, alerts, hazard/recovery zones, which are runtime states. MVP assets ship with **no** `MAT_Accent`. Allowed only on assets whose sole purpose is a hazard/signal marker (e.g. later `PROP_HazardBuoy`), after design review. Parts that may turn orange at runtime (engine bells, selection) are separate nodes so the renderer can swap their material.
- Keep the five materials **numerically distinct**: `gltf-transform dedup` merges identical materials and keeps only one name (verified).
- Render code dedupes materials by name across all GLBs (one shader program per `MAT_*`) and may replace them with its own token-driven materials.
- No textures, no UVs exported (`export_texcoords=False`), no vertex colors by default.
- **Baked AO policy**: off in MVP. If ARCHITECTURE rejects screen-space AO for budget reasons, bake Cycles AO into `COLOR_0` (vertex color, single channel replicated) for large static structures only (`TOWER_Static`, `PAD_Static`, buildings), multiplied in the shader. Never on instanced assets.

## 6. Geometry rules

- **Trusses/lattices** (tower, crane boom, gantries): procedural `truss()` with square-section members (4 sides, no bevel, no end caps where hidden), merged into the static mesh — one draw call per material, not instanced nodes. Budget check: a 135 m tower with 6 m bays, 4 faces, legs + X-bracing + horizontals ≈ 400 members ≈ 5k tris. Lower LODs replace lattice faces with solid slab boxes.
- **Bevel policy** (clay look needs soft edge highlights): bevel only primary forms (building edges, tank heads/skirts, hull rims, decks): width 0.05–0.3 m scaled to object size, 1–2 segments, limit by angle 30°, followed by a Weighted Normal modifier. Never bevel truss members, wheels or small parts.
- **Normals/shading**: `shade_smooth_by_angle(angle=30°)` (4.1+ operator, verified in 4.5), export normals, no tangents. Cylinders: 24 segments for Ø ≥ 6 m at LOD0, 16 for smaller, 8–12 at LOD1.
- No hidden interior faces, no zero-area faces, no n-gons left after export (exporter triangulates; keep quads clean). Watertight is not required.
- **Instancing-friendly assets** (`TANK_*`, `VAN`, later props): one leaf mesh, ≤ 2 materials, origin on the ground, no animated parts, no per-instance geometry. Variants are separate files (`tank_v_s.glb`), not non-uniform runtime scaling (it distorts heads).
- **Winding**: faces must point outward (three `FrontSide`). Exported materials are currently `doubleSided`, which hides inverted faces in Blender and three alike; `MeshBuilder.beam`, `cylinder` and the bottom pole fan of `revolve` were inside-out until 4.5 (fixed, all assets rebuilt). Hand-written polygons go through `shapes.add_quad(…, facing)` or `add_extrusion_x` (CCW profile).
- Repeated parts inside one asset (wheels, grid fins, flaps) are **linked duplicates** of one mesh — the exporter keeps one shared glTF mesh (verified: 3 linked duplicates → 1 mesh). Do not rely on `EXT_mesh_gpu_instancing` (the 4.5 exporter did not emit it for linked duplicates); the renderer builds `InstancedMesh` where useful.

### LODs
Produced by the **same script** with lower parameters (segments, truss → slabs, details dropped), not by decimation — decimation ruins clean clay silhouettes. Every LOD file keeps the **same animated nodes and all sockets**; LOD2 may merge everything else into `<ASSET>_Static`. Switch on projected screen height (independent of FOV); reference distances below assume a 30° vertical FOV.

| Level | Projected height | Tower | Booster | Tank V | Van |
|---|---|---|---|---|---|
| LOD0 | ≥ 15 % of viewport | < 1.8 km | < 0.9 km | < 350 m | — |
| LOD1 | 3–15 % | < 9 km | < 4.4 km | < 1.7 km | < 1.7 km (only LOD) |
| LOD2 | 0.3–3 % | beyond | beyond | beyond | — |
| hidden | < 0.3 % (label stays) | — | — | > 17 km | > 1.7 km |

### Budgets (proposal — ARCHITECTURE reconciles)
Triangles after export; GLB size after optimization (meshopt ≈ 7–10 B/tri). Draw calls = mesh nodes × materials at LOD0.

| Class | LOD0 tris | LOD1 | LOD2 | GLB LOD0 | Draw calls |
|---|---|---|---|---|---|
| TOWER | 40 k | 12 k | 3 k | ≤ 500 KB | ≤ 10 |
| PAD | 15 k | 5 k | 1 k | ≤ 200 KB | ≤ 6 |
| BOOSTER | 20 k | 6 k | 1.5 k | ≤ 250 KB | ≤ 10 |
| SHIP | 15 k | 5 k | 1 k | ≤ 200 KB | ≤ 10 |
| TANK_V / TANK_H / TANK_SPHERE | 1.5 k / 1.2 k / 2.5 k | 400 / 300 / 600 | — | ≤ 40 KB | ≤ 2 |
| TANKER | 5 k | 1.2 k | — | ≤ 70 KB | ≤ 8 |
| TRANSPORTER | 8 k | 2 k | — | ≤ 100 KB | ≤ 40 (wheels; instance if hot) |
| CRANE | 20 k | 6 k | 1.5 k | ≤ 250 KB | ≤ 8 |
| VESSEL_RECOVERY | 15 k | 4 k | 1 k | ≤ 200 KB | ≤ 8 |
| BOAT_RANGE | 4 k | 1 k | — | ≤ 60 KB | ≤ 4 |
| VAN | 1.5 k | 400 | — | ≤ 25 KB | ≤ 2 |
| WX_STATION | 1 k | 300 | — | ≤ 20 KB | ≤ 4 |
| BLDG_HIGHBAY / MEGABAY / HANGAR_TENT | 3 k / 5 k / 2 k | 800 / 1.2 k / 600 | — | ≤ 70 KB | ≤ 4 |

MVP site estimate at typical framing (tower + pad + booster + ship at LOD0, ~12 tanks, 4 tankers, 2 transporters, 6 vans, 3 boats/vessels, 3 WX, 3 buildings at LOD1/2): ≈ **160 k tris, ≈ 120 draw calls** for assets, before point clouds and particles. Total GLB payload ≈ 2.5 MB.

## 7. Export, optimization, wrappers

### glTF export (Blender 4.5.14 LTS — every option name below verified)
```python
bpy.ops.export_scene.gltf(
    filepath=path, export_format="GLB",
    export_yup=True, export_apply=True, export_extras=True,
    export_texcoords=False, export_normals=True, export_tangents=False,
    export_materials="EXPORT", export_vertex_color="NONE",  # "ACTIVE" only if baked AO
    export_attributes=False, export_animations=False, export_skins=False, export_morph=False,
    export_cameras=False, export_lights=False,
    export_draco_mesh_compression_enable=False, export_gpu_instances=False,
    export_hierarchy_flatten_objs=False, use_selection=False, use_visible=True,
)
```
Export **before** adding preview-only objects (ground, camera, sun, human). Re-running a script produces a byte-identical GLB (verified md5).

### Optimization (`gltf-transform`, version pinned in `package.json`)
Verified chain — keeps every named node, socket empty and extras:
```bash
gltf-transform dedup  raw.glb   t1.glb
gltf-transform prune  t1.glb    t2.glb --keep-leaves true     # sockets are empty leaves!
gltf-transform weld   t2.glb    t3.glb
gltf-transform meshopt t3.glb   public/models/<asset>.glb --level medium
```
**Never run `gltf-transform optimize` with defaults**: verified, it joined and flattened the whole test asset into a single node and deleted the sockets. Even with `--join false --flatten false --instance false`, its prune step deletes socket empties unless `--prune false`. No `--simplify`, no `--palette`, no Draco (meshopt decodes faster and is enough; the renderer must register `MeshoptDecoder` on `GLTFLoader`). Raw GLBs go to a git-ignored `build/models-raw/`. Optimized output is deterministic (verified md5). `npx` resolved a newer `@gltf-transform/core` than the CLI version asked for, so the version **must** be pinned by the lockfile.

### Typed wrapper generation
`scripts/assets/codegen.ts` (ADR 0007) emits `src/render/assets/generated/<asset>.ts` from `blender/assets/<asset>.contract.json` + the optimized GLBs (the contract check in `scripts/assets/contract.ts` runs first), plus `generated/index.ts` (`ASSETS`, `AssetName`, `AssetNode<N>`, `AssetSocket<N>`). Actual shape (also `name`, `asset`, `bounds` (Y-up, rest pose), `triangles[]`, `bytes[]`, `drawCalls`; `url`/`lods` carry `?v=<sha8>`):
```ts
export const TOWER = {
  url: '/models/tower.glb', lods: ['/models/tower_lod1.glb', '/models/tower_lod2.glb'],
  nodes: { Carriage: 'TOWER_Carriage', ArmL: 'TOWER_ArmL', /* … */ },
  sockets: { CatchPointL: 'SOCKET_CatchPointL', Label: 'SOCKET_Label', /* … */ },
  anim: { Carriage: { kind: 'trans', axis: 'y', min: 25, max: 135, rest: 86, unit: 'm' } },
} as const;
```
**Instanced draw calls** (4.5): a contract with `"instanceLinked": true` budgets draw calls with every shared mesh counted once (`GlbSummary.instancedDrawCalls`), because the renderer draws each group of linked duplicates as one `InstancedMesh`; the wrapper then also carries `instanced: [[node, …], …]` (groups of leaf nodes sharing one mesh) and `drawCalls` is the instanced figure. Used by `TANKER` (5 axles) and `TRANSPORTER` (16 bogie housings + 16 wheel pairs); without the flag the per-node count applies.
If the ADR picks R3F, `gltfjsx --types` may generate components in addition, **without `--transform`** (it re-optimizes and would break the contract). The generator fails the build if a required node from §4 is missing.

## 8. File layout

```
blender/lib/            shared helpers (importable package, see §10)
blender/assets/<asset>.py   one script per class (tower.py, tank_v.py…) — params as constants / CLI args
build/models-raw/       raw exporter output (git-ignored)
public/models/          optimized GLB + LODs (generated, committed, never hand-edited)
docs/assets/<asset>.png             preview 1024²
docs/assets/turntable/<asset>_NN.png  optional 12-frame turntable 512²
docs/assets/_lineup.png             all assets side by side + 1.8 m human, for scale review
docs/assets/_farm.png               tank farm + tanker + transporter + vans + WX composite (blender/scenes/farm.py, raw GLBs)
blender/scenes/<scene>.py           preview-only composites (never exported; not picked up by npm run assets)
src/render/assets/generated/        typed wrappers (generated)
scripts/assets/build.ts npm run asset -- <name>: blender → optimize → codegen → validate (ADR 0007)
```
Asset scripts import the lib with `sys.path.insert(0, str(Path(__file__).resolve().parents[1]))` (Blender runs them with `-P`, not as a package).

## 9. Preview render spec

Matches `template_asset.py` (tested) so previews sit directly on the UI paper substrate:
- Cycles CPU, 32 samples + denoise, `cycles.seed = 0`, view transform **Standard** (keeps the paper hex exact), 1024 × 1024 PNG, RGB 8-bit, no alpha.
- World: camera rays see exactly paper `#F4F4F0` (from tokens); lighting uses the same paper color at strength 0.25 as fill.
- Ground: plane (≥ 500 m, 12 × bounding radius), Cycles **shadow catcher** so it shows exactly the camera-ray paper and only darkens under shadows (a lit paper plane rendered visibly greyer than the background).
- Sun: rotation (50°, 0°, 35°) → elevation 40°, energy 2.2, angle 8° (soft shadow). **The same sun direction must be the game's** — expose it as a shared constant with ARCHITECTURE/render (`SUN_DIR`).
- Camera: 85 mm (≈ 24° FOV, the game's narrow-FOV feel), direction (1, −1, 0.8) from the bounds center → front-right three-quarter view of the −Y face, pulled back until the bounding-box corners fit 86 % of the frame (capped at 5 × bounding radius). Animated parts may be posed after export for the preview only (tower: arms open 25°, QD engaged).
- Turntable (optional, review): 12 frames, camera orbit 30° steps, 512².
- Lineup (`_lineup.png`): all exported LOD0 assets on one ground in a row, orthographic side view, 2048 × 1024.
- No halftone in the committed PNG; the in-game catalog may apply its own dithering.

## 10. `blender/lib/` helpers (to build in Phase 4)

```python
# cli.py
parse_args() -> Namespace                      # --out --preview --lod {0,1,2,all} --turntable N
# materials.py
materials_from_tokens(tokens_path="src/tokens/generated/tokens.json") -> dict[str, bpy.types.Material]
hex_to_linear(hex: str) -> tuple[float, float, float, float]
# nodes.py
root(asset: str, version: int = 1, lod: int = 0) -> Object                  # root empty <ASSET>
pivot(name: str, location, rotation=(0, 0, 0), parent=None, anim: dict | None = None) -> Object
socket(name: str, location, rotation=(0, 0, 0), parent=None, extras: dict | None = None) -> Object
parent_keep(child: Object, parent: Object) -> None                         # keeps world transform
merge_static(objs: list[Object], name: str) -> Object                      # join, one primitive per material
linked_copy(src: Object, name: str, location, rotation=(0, 0, 0), parent=None) -> Object
# prims.py
truss(name, start, end, width, depth, bays, section=0.35, bracing="X", faces=4,
      material="MAT_Metal", lod=0) -> Object                               # lod>=2 → slab box
tank_vertical(name, radius, height, head="ellipsoidal", skirt=2.0, segments=24,
              ladder=True, material="MAT_Clay") -> Object
tank_horizontal(name, radius, length, saddles=2, head="ellipsoidal", segments=20) -> Object
tank_sphere(name, radius, legs=8, leg_height=None, segments=24, rings=12) -> Object
wheel_bogie(name, wheel_radius, wheel_width, track, wheels=2, segments=12) -> tuple[Object, Object]  # (pivot, wheel)
railing(name, points, height=1.1, post_spacing=2.0, section=0.05) -> Object
engine_bell(name, exit_radius, length, segments=16) -> Object
bevel_soft(obj, width, segments=2, angle_deg=30) -> None                   # bevel + weighted normal
shade(obj, angle_deg=30) -> None                                           # shade_smooth_by_angle
# validate.py
validate(asset: str, required_nodes: list[str], tri_budget: int, max_materials: int = 5) -> None
    # fails on missing nodes, '.' in names, foreign materials, over-budget tris, unapplied scale
# export.py / preview.py
export_glb(path: str) -> None                                              # §7 options
render_preview(path: str, size=1024, turntable: int = 0) -> None           # §9
render_lineup(paths: list[str], out: str) -> None
```
Each asset script declares `ASSET`, `REQUIRED_NODES`, `TRI_BUDGETS` and calls `lod.run_asset(ASSET, build, REQUIRED_NODES, TRI_BUDGETS, lods, preview_pose)`, which for each LOD resets the scene, creates materials, calls `build(lod)`, runs `validate()` and `export_glb()`, then renders the preview from LOD0.

As built (Phase 4.1): geometry goes through `mesh.MeshBuilder` (vertex/face lists → one object, one primitive per material, no operators → byte-stable exports); `prims.add_truss/add_tank_*/add_railing/add_engine_bell(mb, …)` append to a builder, `truss()/tank_*()/railing()` wrap them. `nodes.pivot/socket` take **parent-local** coordinates (identity parent inverse); `parent_keep` is the world-preserving variant. `lod.pick(lod, v0, v1, v2)` selects parameters. Python exceptions fail the build (`--python-exit-code 1`).

## 11. MVP asset list (priority order)

| # | Asset | Why this order |
|---|---|---|
| 1 | `TOWER` ✅ | **Pipeline proof**: lattice helper, pivots (carriage → arms), sockets, LODs, export → optimize → wrapper → preview → in-scene. |
| 2 | `PAD` ✅ | Tower and vehicles are placed relative to it; flame trench/deluge sockets for liftoff particles. |
| 3 | `BOOSTER` ✅ | Hero vehicle: exhaust, engines, grid fins, catch pins validated against tower catch points. |
| 4 | `SHIP` ✅ | Stack + QD arm validation. |
| 5 | `TANK_V`, `TANK_H`, `TANK_SPHERE` ✅ | Tank farm, instancing path proven. |
| 6 | `TANKER` ✅ | Background logistics loop (articulation, wheels). |
| 7 | `TRANSPORTER` ✅ | Rollout phase. |
| 8 | `VAN` ✅ | Instanced background traffic. |
| 9 | `WX_STATION` ✅ | Weather go/no-go readability. |
| 10 | `BOAT_RANGE` | Range violations / hazard line. |
| 11 | `VESSEL_RECOVERY` | Recovery fleet, wake sockets. |
| 12 | `BLDG_HIGHBAY`, `BLDG_MEGABAY`, `HANGAR_TENT` | Small yard. |
| 13 | `CRANE` | Stacking/yard flavor (MVP-nice; the tower stacks in the MVP). |

### Asset status (generated numbers: `npm run asset -- <name>`, `src/render/assets/generated/<name>.ts`)

| Asset | Script / contract | LOD0 / LOD1 / LOD2 tris | GLB LOD0 / LOD1 / LOD2 | Draw calls | Nodes / sockets | Preview |
|---|---|---|---|---|---|---|
| `TOWER` | `tower.py` · `tower.contract.json` | 4 084 / 2 486 / 370 | 67 / 45 / 14 KB | 9 | 17 (9 contract nodes, 7 sockets) | `docs/assets/tower.png`, turntable ×12 |
| `PAD` | `pad.py` · `pad.contract.json` | 1 970 / 1 004 / 562 | 29 / 19 / 14 KB | 6 | 14 (5 contract nodes, 8 sockets) | `docs/assets/pad.png`, `docs/assets/_stack.png` |
| `BOOSTER` | `booster.py` · `booster.contract.json` | 6 952 / 2 608 / 756 | 58 / 33 / 19 KB | 8 | 57 (8 contract nodes, 39 sockets) | `docs/assets/booster.png`, `docs/assets/_stack.png` |
| `SHIP` | `ship.py` · `ship.contract.json` | 2 582 / 912 / 276 | 27 / 18 / 13 KB | 8 | 29 (12 contract nodes, 12 sockets) | `docs/assets/ship.png`, `docs/assets/_stack.png` |
| `TANK_V` | `tank_v.py` · `tank_v.contract.json` | 848 / 162 | 12.3 / 5.2 KB | 2 | 6 (`TANK_V_Body`, 4 sockets) | `docs/assets/tank_v.png` |
| `TANK_H` | `tank_h.py` · `tank_h.contract.json` | 602 / 200 | 9.2 / 5.5 KB | 2 | 6 (`TANK_H_Body`, 4 sockets) | `docs/assets/tank_h.png` |
| `TANK_SPHERE` | `tank_sphere.py` · `tank_sphere.contract.json` | 1 732 / 378 | 24.3 / 8.1 KB | 2 | 6 (`TANK_SPHERE_Body`, 4 sockets) | `docs/assets/tank_sphere.png` |

### Acceptance checklist (per asset)
- [ ] Script runs headless (`--factory-startup`), no Python errors; re-run → identical GLB md5.
- [ ] Dimensions match §2 within 5 %; origin, forward (−Y) and L/R per §1; lineup render checked against the 1.8 m human.
- [ ] Single root `<ASSET>`; all §4 nodes and sockets present after optimization; no `.` in names; nodes with children are empties.
- [ ] Animated nodes: pivot at the joint, `fx_*` extras present, motion range exercised in a preview pose (e.g. arms open/closed) without clipping.
- [ ] Only `MAT_*` materials, colors from tokens, no `MAT_Accent` (unless approved), no UVs/textures/vertex colors (unless baked AO approved).
- [ ] Tris, GLB size and draw calls within §6 budgets for every LOD; LOD files share node/socket names.
- [ ] Preview PNG (and turntable if any) committed and looked at; background reads as paper.
- [ ] Typed wrapper regenerated; render code references only existing names; in-scene at correct scale via `visual-check`.
- [ ] Asset-specific: TOWER `SOCKET_CatchPointL/R` coincide with BOOSTER `SOCKET_CatchPinL/R` when the carriage is at the catch height and the booster is at `SOCKET_Mount` + catch offset; TOWER `SOCKET_ShipQD` reaches SHIP `SOCKET_QD` at 90°; TRANSPORTER `SOCKET_Cargo` carries BOOSTER and SHIP without intersecting the stand.
- [ ] This guide's tables updated if a dimension, node or budget changed.

## 12. Open questions
1. Final token names/values for the five materials (DESIGN_SYSTEM) and a JSON token export Blender can read.
2. Scene triangle / draw-call budget (ARCHITECTURE) — this guide proposes ≈ 160 k tris / ≈ 120 draw calls for the MVP site.
3. Screen-space AO vs baked vertex AO (ARCHITECTURE/render).
4. ~~Renderer ADR~~ — resolved: R3F + in-house codegen from `<asset>.contract.json` (ADR 0002/0007); no gltfjsx.
5. Does gameplay need per-engine visuals (33 sockets kept either way), arm shock-absorber carts, or an ocean-landing variant with legs?
6. `WX_STATION` draw calls: ARCHITECTURE §13.2 lists it as a prop (≤ 2 draw calls) but it has two independently animated rotors plus the static mesh (≥ 3); this guide's table says ≤ 4. Built under class `building` (cap 4) until **systems-architect** reconciles — only 2 copies exist, so no instancing pressure.
7. `TANK_V` Ø 4.5 × 20 variant (`tank_v_s.glb`) — build when a placement needs it.
