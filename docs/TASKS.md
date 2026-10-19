# Fuel-X — Tasks

> Owner: orchestrator. Source docs: [GDD](GDD.md) (AC = §13.3 acceptance criteria), [ARCHITECTURE](ARCHITECTURE.md), [ADRs](adr/), [DESIGN_SYSTEM](DESIGN_SYSTEM.md), [ASSETS_GUIDE](ASSETS_GUIDE.md), [BALANCING](BALANCING.md).
> Every task: owner agent does it → **Definition of Done** from `CLAUDE.md` (typecheck + lint + test green, `visual-check` if visual, `perf-audit` if heavy, `qa-perf` review clean, this file ticked) → one commit.
> Phase gates (⛳) = stop, show the user screenshots/renders + open questions, wait for approval.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · **owner** · ← depends on

## Phase 0 — Team ✅
- [x] Agents, skills, CLAUDE.md, settings, SessionStart hook, Blender 4.5 LTS installer
- [x] ⛳ Gate 0 approved

## Phase 1 — Design ✅
- [x] GDD + BALANCING — **game-designer**
- [x] ARCHITECTURE + ADR 0001–0008 — **systems-architect**
- [x] DESIGN_SYSTEM — **ui-design-system**
- [x] ASSETS_GUIDE (optimizer chain verified, socket rules) — **blender-technical-artist**
- [x] Consolidation: paths aligned (tokens JSON, asset scripts, codegen), skill `blender-asset-pipeline` updated, template uses root empty
- [x] ⛳ **Gate 1** approved (2026-10-18). Decisions: stack as ADR 0001–0007 · accent-text `#B23B0B` · pause always available (MVP) · failed catch shown in debrief only (MVP) · ≥1 anomaly per run OK · English UI, i18n-ready · reference HW = iGPU 1080p, Chrome/Edge first · **deploy on self-hosted Coolify** (`coolify.fs0ciety.org`, ADR 0008 rewritten; app domain `fuelx.fs0ciety.org`, later renamed to `fuel.fs0ciety.org`)

## Phase 2 — Scaffold
- [x] 2.1 `package.json` with pinned versions from ARCHITECTURE §1, Vite 2 entries (`index.html`, `design.html`), TS strict configs, path aliases (`@sim`, `@data`, `@bridge`, `@render`, `@ui`, `@tokens`, `@app`) — **systems-architect**
- [x] 2.2 ESLint (boundaries matrix §2, banned globals in `src/sim`), Stylelint (radius/shadow/gradient/literal color bans), Prettier — **systems-architect** ← 2.1
- [x] 2.3 Vitest projects (unit/sim/golden) + Playwright config pinned to `/opt/pw-browsers` Chromium, SwiftShader flags — **qa-perf** ← 2.1
- [x] 2.4 Token pipeline: `src/tokens/tokens.ts` from DESIGN_SYSTEM §2 → `generated/tokens.css` + `tokens.json` (sRGB + linear); `tokens --check` in lint — **ui-design-system** ← 2.1
- [x] 2.5 Empty module skeleton per ARCHITECTURE §12 with one boundary-violation test proving lint fails — **systems-architect** ← 2.2
- [x] 2.6 All npm scripts of the contract exist and pass on the empty app (`dev`, `build`, `preview`, `test`, `typecheck`, `lint`, `e2e`, `asset`, `assets`, `perf`, `tokens`); `docs/QA.md` created — **qa-perf** ← 2.1–2.5
- [x] ⛳ **Gate 2** approved — — green checks + blank paper canvas + `/design` page showing tokens (`docs/screens/phase2-*.png`)

## Phase 3 — Simulation core (headless, no 3D)
- [x] 3.1 Core: world, integer ticks @30 Hz, sfc32 RNG streams, FSM helper, event bus, command queue, canonical serialize — **simulation-engineer**
- [x] 3.2 Data: `src/data/*` from BALANCING (typed, every number with unit), MVP site layout & paths — **simulation-engineer** ← 3.1
- [x] 3.3 Countdown FSM: phases, polls (T-01:20:00 / T-00:10:00 / T-00:00:40), HOLD/RECYCLE/SCRUB, window, auto-hold at T-00:03:00 — AC 10–13 — **simulation-engineer** ← 3.1
- [x] 3.4 Logistics: farm tanks + boil-off, tanker orders (standard/rush), gate closure at T-00:40:00, propellant load + topping — AC 7–9, 15 — ← 3.2
- [x] 3.5 Prep: CR-77, SP-41 rollout on paths, stacking with TOWER-1 arms, wind limits — AC 4–6 — ← 3.2
- [x] 3.6 Flight: simplified ascent/MECO/boostback/landing profile, S-21 to SECO, catch probability model, catch/divert outcome — AC 16, 18–21 — ← 3.3
- [x] 3.7 Range & weather: 5 stations GO/MARGINAL/NO-GO, PICKET patrols, WX series, anomaly director + pool A1–A4 — AC 3, 10, 14 — ← 3.3
- [x] 3.8 Economy + debrief data, contract NRL-3 fulfilment — AC 21–22 — ← 3.6
- [x] 3.9 Scenario `mvp` + autopilot script; **golden telemetry/event log** test; equivalence (save/load, time scale) and 200-seed property tests — AC 1–3 — **simulation-engineer** + **qa-perf** ← 3.3–3.8
- [x] 3.10 Save/load + migrations scaffold + fixture; sim bench in `npm run perf` within budget (§13.3) — ← 3.9
- [x] ⛳ **Gate 3** approved (balancing pass on hold margin, auto catch policy, AC 3 no-input case runs alongside Phase 4) — golden log walkthrough (text timeline of a full launch), bench numbers

## Phase 4 — Asset pipeline (tower first)
- [x] 4.1 `blender/lib/`: materials_from_tokens, socket, parent_keep, truss, tanks, wheel_bogie, railing, export_glb, render_preview (ASSETS_GUIDE §10) — **blender-technical-artist** ← 2.4
- [x] 4.2 `scripts/assets/{build,contract,codegen}.ts`: Blender → verified gltf-transform chain → contract validation → typed wrapper → preview; `--verify` byte-identical rebuild — **blender-technical-artist** + **systems-architect** ← 4.1
- [x] 4.3 **TOWER** end to end (carriage, catch arms, QD arm, sockets, LODs) + preview render — pipeline proof — ← 4.2
- [x] 4.4 PAD/OLM, BOOSTER, SHIP + `_stack.png` socket-alignment check (`blender/lib/composite.py`) — ← 4.3
- [x] 4.5 TANK_V/H/SPHERE (instancing-ready), TANKER (LX/MX share one GLB), TRANSPORTER, VAN, WX_STATION + `_farm.png` composite (`blender/scenes/farm.py`); contract `instanceLinked` (shared meshes = one draw call); MeshBuilder winding fix (beam/cylinder/pole fan were inside-out) — ← 4.3
- [x] 4.4b PAD/BOOSTER/SHIP rebuilt after the 4.5 winding fix; `_stack.png` re-checked (all Δ 0.000 m); ship heat shield + flaps → `MAT_Clay` (matched the booster / reference) — **blender-technical-artist**
- [x] 4.6 BOAT_RANGE (PK-03/04, UNK-01), VESSEL_RECOVERY (RV-1), CRANE (CR-77), yard buildings HB-1 (bi-parting sliding doors) + TH-1; `BLDG_MEGABAY` deferred to BY-1 (not in the MVP small yard) — ← 4.3
- [x] 4.7 `_lineup.png` (+ `_lineup_small.png`) scale review render, all assets within 5 % of ASSETS_GUIDE §2; GLB payload 739 KB vs ≤ 4 MB; WX_STATION kept in class `building` — **qa-perf** ← 4.4–4.6
- [x] ⛳ **Gate 4** approved — Blender preview renders + lineup

## Phase 5 — Scene
- [x] 5.0 Sim follow-up from TOWER as-built (ASSETS_GUIDE): keep the tower carriage out of 92–106 m while the QD arm is engaged — **simulation-engineer** · done: `src/sim/systems/tower.ts` carriage / arms / QD state at data rates (BALANCING §14, flagged for review), interlock both ways, carriage = pin height (86 / 135 / 126 m), save schema 2 (ARCHITECTURE §7.9)
- [x] 5.0b Sim/data follow-up from PAD/BOOSTER/SHIP/TRANSPORTER as-built: one height convention + ascent attitude — **simulation-engineer** · done: entity `pos` = asset origin in world metres (`src/data/siteGeometry.ts` mirrors the sockets): stage on SP-41 +4.6 m, stack lift with task progress, booster on the mount 20 m, ship 91 m, liftoff from 20 m, catch at origin 60 m = pins on the carriage at 126 m; attitude program (`flight.tiltRad` → `rot`: vertical rise, prograde pitch-over, boostback flip, entry, upright landing; ship prograde to SECO); save schema 3 (ARCHITECTURE §6, §7.4; BALANCING §6 attitude flagged for game-designer review). Render must drop the ON_MOUNT / ON_CARGO lift
- [x] 5.1 R3F canvas (`frameloop="never"`, driven by app loop), lights, fog/haze from tokens, adaptive DPR — **three-graphics-engineer** ← 2.6
- [x] 5.2 GameLoop + SimHost + RenderSnapshot + RenderSync with interpolation; floating origin — ← 3.9, 5.1
- [x] 5.3 Point-cloud sea + ground (dithered, GPU-animated, ≤ 300 k points) — ← 5.1
- [x] 5.4 Entity views from generated wrappers (placeholders behind same API until GLB exists), animated nodes from sim state — ← 4.x, 5.2 · done: channels TOWER (carriage/arms/QD from sim 5.0), PAD clamps/BQD, BOOSTER gimbal + grid fins, SHIP gimbal + flaps, TRANSPORTER wheels/bogie steer/deck, TANKER steer/trailer/axles, CRANE slew/luff/cable/hook, boat/vessel radar, WX vane/anemometer (ARCHITECTURE §3 as built 5.4/5.5); LOD on projected height; InstancedMesh pools for tanks/vans + wheel/bogie/axle groups (home T-01:54 96 → 71 draw calls); no render-side lift (5.0b). Screens `docs/screens/phase5-anim-*.png`. **Derived render-side, the sim should expose later**: engine gimbal angles, grid-fin and flap deflections, pad clamp/BQD state, transporter speed/yaw rate/deck height and bogie steer, tanker steer/trailer angle, crane slew/luff/hook (or lift-phase keyframes) and the hung stage pose, ground-vehicle yaw rate limits (sim turns instantly at path vertices), wind direction (fixed 95° now), radar/anemometer are cosmetic
- [x] 5.5 Camera rig: follow/focus/frame/home, clamps, lerp, `snap` for screenshots — AC 25 — ← 5.2 · done: `CameraRig` follows `SOCKET_Focus` or the attached stack (booster + ship, transporter + cargo), presets home/frame/orbit, 700 ms eased re-target, damped input, pitch 8–85°, 40 m–30 km, never under ground, `snap` via `__fuelx.follow/camera`; e2e `tests/e2e/anim.e2e.ts`
- [x] 5.6 FX: exhaust, deluge/steam, foam/wake, recovery rings — ← 5.2 · done: `src/render/fx/*` + `FxSystem` — 3 stateless GPU draws (FX_Plume, FX_Steam, FX_Zones), 18.9 k sprite capacity, pixel-static under freezeVisuals (ARCHITECTURE §3 as built 5.6); new channels `pad.delugeS/hazardM`, boat `speedMPerS`, `vessel_recovery.zoneMode`; `__fuelx.catchDecision`, `stats().particles/fxPoints`; home preset reframed on pad + sea; fill π·0.3 → π·0.5 (apron/tanks too dark). Screens `docs/screens/phase5-fx-*.png`, `phase5-home.png` (older phase5-world/anim screens predate the fill change). **Follow-ups**: *sim* — the booster profile is piecewise-linear from T-0 (≈ 190 m/s off the mount, 600 m at T+3 s), so the plume never touches the pad/trench; an eased liftoff (first ~10 s) would let FX show plume impingement; a wind direction would replace the fixed 95° steam drift. *blender-technical-artist* — PAD apron slab shares `MAT_Clay` with the mount: a separate slot (e.g. `MAT_Concrete` → `padConcrete` token, contract + codegen + `materials/clay.ts`) would let it read as the concrete lot; `TANK_V` at Ø 6 × 28 m (to spec) reads as a pole from the strategic camera — designer to consider Ø 9–10 m. Pad hazard *hatch* and the maritime hazard area (AREA BRAVO polygon) outline are not drawn yet (rings only).
- [x] 5.7 Post: single EffectPass (SMAA + halftone/dither); `freezeVisuals` — ← 5.1
- [x] 5.8 `window.__fuelx` debug hooks (ARCHITECTURE §9) + first visual baselines — **qa-perf** ← 5.2
- [x] 5.9 `perf-audit` on the 3 reference scenes — **qa-perf** ← 5.3–5.7 · done: `tests/e2e/scenes.perf.ts` (opt-in `perf` project, `npm run perf -- --browser`) on the production build — terminal count / liftoff at LC-1, ascent following B-09, SP-41 rollout: main ≤ 47 / shadow ≤ 35 draw calls, ≤ 15 k triangles, point cloud 297.7 k (99 % of 300 k), ≤ 13.8 k FX sprites, ≤ 16 programs, all within §13.1 (`budget.json` `scene` rows added); `stats()` gains `mainDrawCalls`/`shadowDrawCalls`. Game initial JS **452.6 → 386.0 KB gz**: `postprocessing` (62.9 KB gz) + `post/pipeline` now a lazy chunk, `isReady()` waits for it. Flaky `scene.e2e` › debug hooks fixed by a serial `scene` Playwright project (two green full runs). Review fixes: pool instance uploads limited to live instances, dead `VitrineStage.tsx` removed. Gate screens re-taken (QA.md list). Numbers: QA.md "Phase 5 perf-audit". **Open (ranked)**: *M1* snapshot + anim writers run every sim tick (`src/app/sim-host/inline.ts:93`) ≈ 15 µs/tick in Node, 3–4× the sim, not covered by `sim-bench` (≈ 1 ms/frame at 100×, budget 4 ms) — add a host-tick row to the bench, then write only the last two ticks per batch (AnimWriter integrates per tick, so needs a dt-aware pass) — **systems-architect / three-graphics-engineer**; *L1* point cloud at 99 % of budget — no density increase without trading levels; *L2* `CameraRig` allocates per frame while following (`stackOf` array `CameraRig.tsx:133`, orbit object spreads `:222–234`) — scratch objects; *L3* `stats().simUsPerTick` is a mean of per-advance ratios (`inline.ts:102`), meaningless under the 100 µs clock clamp — use total µs / total steps; *L4* `Game.isHidden` reads the flags with a magic `+ 7` (`src/app/game.ts:54`) — use a named slot offset from `render/snapshot`.
- [x] 5.10 eased liftoff + wind direction — done · **simulation-engineer** (5.6 follow-up): LIFTOFF → MAX_Q eased from rest (a0 4.5 m/s², T/W ≈ 1.46; tower tip cleared T+7.3 s, ≈ 1 km at T+20 s; keyframes, MECO and catch unchanged), `world.weather.windFromRad` (meteorological "from", rad, seeded OU on rng `wind`), `engines.throttle` 0–1 on booster/ship; save schema 4 (fixture `schema-3.json`); BALANCING §6/§8 numbers flagged for game-designer review. Render to read `weather.windFromRad` (replace the fixed 95° steam drift) and `engines.throttle` (plume)
- [x] 5.11 pad concrete material + TANK_V proportions — done — **blender-technical-artist** · 5.6 follow-up: new shared slot `MAT_Concrete` (`world.padConcrete`, roughness 0.95; Blender `materials.py`, `contract.ts` MATERIALS, `materials/clay.ts` with a 0.15 same-token self-lift) on the PAD apron slab (PAD draw calls 6 → 7); `TANK_V` rebuilt Ø 9.5 × 12.96 m (crown; shell 8.59 m derived from the Ø 6 × 28 volume ≈ 721 m³), 844 / 190 tris, 2 draw calls. Screen `docs/screens/phase5-home-after-materials.png`
- [x] ⛳ **Gate 5** approved — screenshots: terminal count, ascent follow, catch

## Phase 6 — HUD
- [x] 6.0 DESIGN_SYSTEM addendum: **decision strip**, **debrief panel**, rate control states (requested by GDD §10) — **ui-design-system** + **game-designer** (GDD gaps listed in DESIGN_SYSTEM §13.2 for the designer)
- [x] 6.1 Projector (10 Hz + salient events) + Zustand stores + command API; unit-format tests — **systems-architect** ← 3.9 · done: `src/app/projection/*` + `src/bridge/{projection-types,stores,commands}.ts` (bridge types = source of truth, `src/ui/types.ts` re-exports), `__fuelx.state()` = real projection, placeholder subscriber; projector ≈ 0.45 ms/run (Node), React commits 8/s at 100× / 1/s at 1×, age ≤ 210 ms (ARCHITECTURE §8 as built). **Follow-ups**: 7.2 time rules (drop to 1× on decision/NO-GO, skip — the VM already projects `skip.target`, `blocking`); scenario UTC date to `src/data` (*game-designer*); projector cost could drop (events list re-share each run) if 6.3 shows it
- [x] 6.2 Primitives + `/design` gallery (all components, all states) — **ui-design-system** ← 2.4 · done: `src/ui/components/*` (19 primitives, CSS Modules, tokens only), fixtures `src/ui/fixtures`, gallery `src/ui/design/ComponentGallery.tsx`, unit `src/ui/components/components.test.ts`, e2e `tests/e2e/design.e2e.ts` (keyboard, modal, no radius/shadow/opacity, AA sweep); screens `docs/screens/phase6-design-*.png`
- [ ] 6.3 HUD frame grid; top bar, site switcher (other sites disabled), alerts, rate control — ← 6.1, 6.2
- [ ] 6.4 Flight card, inspector (booster/ship/vessel/transporter/tanker), tabbed panel (5 tabs) — ← 6.3
- [ ] 6.5 Countdown timeline (phases, playhead, hold, window markers), poll panel, decision strip — AC 11, 19, 23 — ← 6.3
- [ ] 6.6 In-world labels (DOM via RenderSync, declutter ≤ 64), altitude scale, compass tape, map controls — AC 24–25 — ← 5.5, 6.3
- [ ] 6.7 Events log/toasts, debrief panel — AC 22 — ← 6.4
- [x] 6.8 Sim follow-ups from HUD design (GDD §13.2.1, AC 29, 33) — **simulation-engineer** · done: `anomalies.A3.decisionTimeoutS` = 300 s; `DecisionRequired{LEAK}.deadlineTick` = min(onset + 300 s, window close) (`leak.deadlineTick`); unanswered → DEGRADED, `LeakResponded{by: AUTO}` + D3b AUTO decision-log entry; `LeakResponded.by` PLAYER | AUTO; `LeakResponse` one-shot (`ALREADY_RESPONDED`, `ALREADY_FIXING` removed); world schema 5 + migration 4 → 5 (fixture `tests/fixtures/saves/schema-4.json`); golden: 2 lines (deadline, `by=PLAYER`). Station statuses already GO / MARGINAL / NO_GO only (AC 28 sim side). App follow-ups: §6 rate drops/caps, D3 > D3b > D2 > D1 priority, §13.2.2 previews, debrief REPLAY / NEW SEED / EXPORT LOG / VIEW SITE (AC 23, 30–32)
- [ ] ⛳ Gate 6 — full HUD screenshots at the standard states + `/design`

## Phase 7 — Vertical slice
- [ ] 7.1 Wire all MVP decisions D1–D3b end to end from the HUD (no console) — AC 27 — all agents
- [ ] 7.2 Time rules: forced 1× windows, skip-to-milestone — AC 23
- [ ] 7.3 Background logistics always visible — AC 26
- [ ] 7.4 Playwright e2e: full run with autopilot + manual decision paths; AC checklist report — **qa-perf**
- [ ] 7.5 Playtest pass (3 seeds) → BALANCING tweaks, design risks §14 re-evaluated — **game-designer**
- [ ] ⛳ Gate 7 — playable MVP video/GIF + AC report

## Phase 8 — Polish & perf
- [ ] 8.1 Perf against full budget on production build; fixes
- [ ] 8.2 Accessibility & keyboard map audit (DESIGN_SYSTEM)
- [ ] 8.3 Autosave/IndexedDB + export/import
- [x] 8.4 Deploy on Coolify (ADR 0008): `Dockerfile` + `deploy/nginx.conf`, `docker build .` green, Coolify app `fuel-x` on `coolify.fs0ciety.org`, domain `https://fuel.fs0ciety.org` (since 2026-10-19 also `https://fuelx.fs0ciety.org`, showcase at `/`, game at `/play`, ADR 0009)
- [ ] ⛳ Gate 8 — release candidate

## Showcase site (public `/`, deploy `fuelx.fs0ciety.org`) — owner **web-showcase**
Spec: [`SHOWCASE.md`](SHOWCASE.md) · Stack: [ADR 0009](adr/0009-showcase-site.md) · Deploy: [`DEPLOY.md`](DEPLOY.md)
- [x] S.0 Audit of the PR #1 showcase, trend research, 3 directions → user picks **A "Launch dossier"**, single Coolify app, game at `/play`, English only
- [x] S.1 Docs: SHOWCASE.md, ADR 0009, `web-showcase` agent, `showcase-check` skill
- [x] S.2 Build: SSR prerender of `index.html`, `/play` rewrite (dev/preview/nginx), lazy 3D chunk, native scroll driver — **systems-architect**
- [x] S.3 Sections: top bar, hero + mini flight card, dossier sheets, four calls, hardware catalogue, sites, how it's built, CTA, colophon (logos in ink) — **ui-design-system** ← S.2
- [x] S.4 Stage: scroll-driven rollout → stack → liftoff → boostback → catch with the game GLBs, reduced-motion stills, no-WebGL still — **three-graphics-engineer** ← S.2
- [x] S.5 SEO/OG (1200×630 plate), robots/sitemap, JSON-LD; WebP plates from Blender previews ← S.3
- [x] S.6 Tests: `tests/e2e/showcase.e2e.ts` (structure, links, meta, reduced motion, phone), budgets rows — **qa-perf** ← S.3, S.4
- [x] S.7 `showcase-check` + `perf-audit` pass; `qa-perf` review ← S.6
- [x] ⛳ Gate S1 — screenshots (desktop, phone, story chapters) to the user; user approved PR #2 merge + deploy
- [x] S.8 Deploy: PR #2 merged; Coolify app `fuel-x` → default branch, domains `fuelx` + `fuel`, healthcheck `/healthz`; Cloudflare CNAME `fuelx`; live checks green (DEPLOY.md)
- [x] ⛳ Gate S2 — live URL checked: https://fuelx.fs0ciety.org/ (prerendered, 3D stage loads, `/play`, `/healthz`, GLB MIME/cache/gzip, security headers)
