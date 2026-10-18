# Fuel-X

A **live rocket launch site you can play like a strategy game**, in the browser. Every tower, booster, ship, tank farm, transporter and building is modeled and rendered in **Blender from Python scripts**, exported to glTF and run in **three.js**. A deterministic simulation drives the world; a control-room HUD in the *industrial brutalist — Swiss Industrial Print* style (paper, ink, one signal-orange accent) lets you direct it.

- Master brief: [`PROMPT.md`](PROMPT.md) — reference description, principles, phases.
- Design: [`docs/GDD.md`](docs/GDD.md) · Balancing: [`docs/BALANCING.md`](docs/BALANCING.md)
- Tech: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · Decisions: [`docs/adr/`](docs/adr/)
- UI: [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) · Assets: [`docs/ASSETS_GUIDE.md`](docs/ASSETS_GUIDE.md)
- Plan: [`docs/TASKS.md`](docs/TASKS.md) · QA: [`docs/QA.md`](docs/QA.md)

## Status
Phase 4 done (16 Blender assets + pipeline) and balancing pass 1 applied. Waiting for **Gate 4** approval before Phase 5 (scene). Live checklist: `docs/TASKS.md`.

Stack (ADR 0001–0008): Vite SPA · React 19 · TypeScript strict · three (WebGL2) via R3F `frameloop="never"` · plain data-oriented sim @30 Hz on main thread behind `SimHost` · 10 Hz projection → Zustand · CSS Modules + generated CSS vars · Vitest + Playwright · Blender 4.5 → gltf-transform (dedup/prune/weld/meshopt) → in-house codegen · Coolify (nginx image).

## Commands
The script names are a contract; the stack ADR decides what they run.

| Command | Does |
|---|---|
| `npm run dev` | dev server (exposes `window.__fuelx` debug hooks) |
| `npm run build` / `npm run preview` | production build / serve it |
| `npm run test` | unit + sim tests (incl. golden launch log) |
| `npm run typecheck` · `npm run lint` | static checks |
| `npm run e2e` | Playwright visual/e2e (Chromium preinstalled — never `playwright install`) |
| `npm run asset -- <name>` · `npm run assets` | Blender → GLB → optimize → typed wrapper → preview render |
| `npm run perf` | sim benchmark + perf audit helpers |
| `npx -y npm@11.6.2 install <pkg>@<exact>` | add a dependency (npm 10 resolver bug; `npm ci` is fine) |
| `scripts/install-blender.sh` | portable Blender 4.5 LTS into `~/.local/bin` (auto in cloud sessions) |

Blender headless: `blender -b --factory-startup -P blender/assets/<asset>.py -- --out … --preview …`

## Repo map
- `.claude/agents/` — sub-agents (see Workflow) · `.claude/skills/` — project skills
- `blender/lib/` shared bpy helpers · `blender/assets/` one script per asset
- `public/models/` generated GLB (never hand-edited) · `docs/assets/` Blender preview renders
- `src/app/` composition root (loop, SimHost, projector, bus, persistence, `window.__fuelx`) — only place wiring sim ↔ render ↔ ui
- `src/sim/` deterministic simulation (pure TS) · `src/data/` tunables & scenarios
- `src/bridge/` Zustand stores + command API · `src/render/` R3F scene · `src/ui/` HUD + `/design`
- `src/tokens/` `tokens.ts` → `generated/{tokens.css,tokens.json}` (CSS, three, Blender)
- `tests/` golden, sim, perf, fixtures, e2e · `docs/` design & tech docs · `scripts/` tooling (tokens, assets, perf)
*(Full layout & import matrix: ARCHITECTURE §2 and §12 — boundaries enforced by ESLint.)*

## Hard rules
1. **Sim is pure and deterministic**: `src/sim` never imports render/UI/three/React/DOM; no `Math.random()`, `Date.now()`, `performance.now()` — use the injected RNG/clock; fixed timestep; time scale = more steps, never bigger dt.
2. **SI units in the sim** (m, s, kg, m/s, K, Pa). Display units (km, km/h, %) only in the UI projection.
3. **No 60 Hz React**: render code mutates three objects in the frame loop; the HUD reads a throttled projection.
4. **Assets are code**: every GLB comes from a committed `blender/assets/*.py`; no binary asset without its script; Z-up → Y-up only in the exporter; node/socket names are an API (renaming = update callers in the same commit).
5. **Design tokens only**: no literal colors/sizes in components or materials; radius 0, no shadows, no gradients, no translucent panels; one accent (signal orange `#FF5A1F`, `#B23B0B` for small text). Load `industrial-brutalist-ui` before any UI work.
6. **Original names only** — nothing reused from the reference video's branding.
7. **Never** skip/disable a test or regenerate a golden without explaining the diff.

## Workflow
**Who does what** (delegate; run independent agents in parallel):

| Task | Agent | Skills |
|---|---|---|
| Mechanics, numbers, naming, scope | `game-designer` | — |
| Stack, boundaries, ADRs, perf budget | `systems-architect` | — |
| Game logic + tests | `simulation-engineer` | `sim-testing`, `add-entity` |
| 3D assets in Blender | `blender-technical-artist` | `blender-asset-pipeline` |
| Scene, camera, particles, perf | `three-graphics-engineer` | `visual-check`, `perf-audit`, `design-tokens` |
| HUD & tokens | `ui-design-system` | `industrial-brutalist-ui`, `design-tokens`, `visual-check` |
| Review after each task | `qa-perf` | `visual-check`, `perf-audit`, `sim-testing` |

**Phases & gates**: 0 team → 1 design docs → 2 scaffold → 3 sim core (headless golden log before any 3D) → 4 asset pipeline (tower end-to-end first) → 5 scene → 6 HUD → 7 vertical-slice gameplay → 8 polish/perf. **Stop at the end of each phase**: summary, screenshots/renders, open questions; wait for user approval.

**Definition of done (every task)**: typecheck + lint + test green · `visual-check` screenshot if visual · `perf-audit` if render/asset heavy · `qa-perf` review clean · `docs/TASKS.md` ticked · docs updated if a contract changed.

**Commits**: one task per commit, imperative subject (`sim: add propellant boil-off`, `asset: tower catch arms`, `ui: countdown timeline`), body explains why. Work on the designated branch; never force-push shared branches.
