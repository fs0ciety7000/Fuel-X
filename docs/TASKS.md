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
- [x] ⛳ **Gate 1** approved (2026-10-18). Decisions: stack as ADR 0001–0007 · accent-text `#B23B0B` · pause always available (MVP) · failed catch shown in debrief only (MVP) · ≥1 anomaly per run OK · English UI, i18n-ready · reference HW = iGPU 1080p, Chrome/Edge first · **deploy on self-hosted Coolify** (`coolify.fs0ciety.org`, ADR 0008 rewritten; app domain `fuelx.fs0ciety.org`)

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
- [ ] 3.10 Save/load + migrations scaffold + fixture; sim bench in `npm run perf` within budget (§13.3) — ← 3.9
- [ ] ⛳ Gate 3 — golden log walkthrough (text timeline of a full launch), bench numbers

## Phase 4 — Asset pipeline (tower first)
- [ ] 4.1 `blender/lib/`: materials_from_tokens, socket, parent_keep, truss, tanks, wheel_bogie, railing, export_glb, render_preview (ASSETS_GUIDE §10) — **blender-technical-artist** ← 2.4
- [ ] 4.2 `scripts/assets/{build,contract,codegen}.ts`: Blender → verified gltf-transform chain → contract validation → typed wrapper → preview; `--verify` byte-identical rebuild — **blender-technical-artist** + **systems-architect** ← 4.1
- [ ] 4.3 **TOWER** end to end (carriage, catch arms, QD arm, sockets, LODs) + preview render — pipeline proof — ← 4.2
- [ ] 4.4 PAD/OLM, BOOSTER, SHIP — ← 4.3
- [ ] 4.5 TANK_V/H/SPHERE (instancing-ready), TANKER (LX/MX), TRANSPORTER, VAN, WX_STATION — ← 4.3
- [ ] 4.6 BOAT_RANGE, VESSEL_RECOVERY, CRANE, yard buildings (HB, TH) — ← 4.3
- [ ] 4.7 `_lineup.png` scale review render; GLB payload vs budget (≤ 4 MB) — **qa-perf** ← 4.4–4.6
- [ ] ⛳ Gate 4 — Blender preview renders + lineup

## Phase 5 — Scene
- [ ] 5.1 R3F canvas (`frameloop="never"`, driven by app loop), lights, fog/haze from tokens, adaptive DPR — **three-graphics-engineer** ← 2.6
- [ ] 5.2 GameLoop + SimHost + RenderSnapshot + RenderSync with interpolation; floating origin — ← 3.9, 5.1
- [ ] 5.3 Point-cloud sea + ground (dithered, GPU-animated, ≤ 300 k points) — ← 5.1
- [ ] 5.4 Entity views from generated wrappers (placeholders behind same API until GLB exists), animated nodes from sim state — ← 4.x, 5.2
- [ ] 5.5 Camera rig: follow/focus/frame/home, clamps, lerp, `snap` for screenshots — AC 25 — ← 5.2
- [ ] 5.6 FX: exhaust, deluge/steam, foam/wake, recovery rings — ← 5.2
- [ ] 5.7 Post: single EffectPass (SMAA + halftone/dither); `freezeVisuals` — ← 5.1
- [ ] 5.8 `window.__fuelx` debug hooks (ARCHITECTURE §9) + first visual baselines — **qa-perf** ← 5.2
- [ ] 5.9 `perf-audit` on the 3 reference scenes — **qa-perf** ← 5.3–5.7
- [ ] ⛳ Gate 5 — screenshots: terminal count, ascent follow, catch

## Phase 6 — HUD
- [ ] 6.0 DESIGN_SYSTEM addendum: **decision strip**, **debrief panel**, rate control states (requested by GDD §10) — **ui-design-system** + **game-designer**
- [ ] 6.1 Projector (10 Hz + salient events) + Zustand stores + command API; unit-format tests — **systems-architect** ← 3.9
- [ ] 6.2 Primitives + `/design` gallery (all components, all states) — **ui-design-system** ← 2.4
- [ ] 6.3 HUD frame grid; top bar, site switcher (other sites disabled), alerts, rate control — ← 6.1, 6.2
- [ ] 6.4 Flight card, inspector (booster/ship/vessel/transporter/tanker), tabbed panel (5 tabs) — ← 6.3
- [ ] 6.5 Countdown timeline (phases, playhead, hold, window markers), poll panel, decision strip — AC 11, 19, 23 — ← 6.3
- [ ] 6.6 In-world labels (DOM via RenderSync, declutter ≤ 64), altitude scale, compass tape, map controls — AC 24–25 — ← 5.5, 6.3
- [ ] 6.7 Events log/toasts, debrief panel — AC 22 — ← 6.4
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
- [ ] 8.4 Deploy on Coolify (ADR 0008): `Dockerfile` + `deploy/nginx.conf`, `docker build .` green, Coolify app wired to the repo + README
- [ ] ⛳ Gate 8 — release candidate
