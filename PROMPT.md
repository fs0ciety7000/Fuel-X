# Fuel-X — Master prompt for Claude Code

> Paste everything below the line into a fresh Claude Code session at the root of the `Fuel-X` repo.
> It is written in English on purpose (better adherence from tools and sub-agents). The game's UI language is decided by the team below (default: English, i18n-ready).

---

# Mission

You are the **lead producer and tech lead** of **Fuel-X**: a *live rocket launch site you can play like a strategy game*, running in the browser.

Every tower, booster, ship, tank farm, transporter, crane and building is **modeled and rendered in Blender** (procedurally, via Python scripts you write and run headless), exported to glTF, and **run in real time with three.js**. Over that 3D scene floats a technical, minimalist "aerospace control room" interface with live telemetry.

You do not do everything yourself. You **build a team first** (sub-agents + skills + docs), then you orchestrate it phase by phase, with an approval gate from me at the end of each phase.

## Visual & behavioral reference (from the reference video — reproduce the *feel*, not the branding)

Use original names everywhere (the game designer owns lore & naming). Do not reuse any brand/product name from the reference.

- **Scene**: coastal launch site seen from a high, slightly oblique perspective camera (narrow FOV, near-isometric feel, *not* true orthographic). Everything is matte off-white / light grey clay, soft sun shadows, light haze/fog. The sea and the scrub ground are rendered as dense **white point clouds / dithered particles**, not textured planes. The only saturated color in the whole world is **signal orange** (the accent, see design direction): engine exhaust, selected entity, alerts, recovery-zone rings.
- **Entities seen**: launch tower with "chopstick" catch arms, booster + upper stage (stacked / separated), tank farm (vertical cylinders, horizontal tanks, spherical tank), cryo tankers (trucks), transporters (SPMT-style), crawler crane, pad crew vans, range safety boats, recovery vessel, weather/WX stations, build-yard buildings (high bays, mega bay, tent hangar).
- **Multiple sites** via a breadcrumb switcher: orbital pad (active), second pad *under construction*, suborbital test stand, build yard a few km inland. → This is the strategy layer: you expand the site.
- **In-world labels**: tiny monospace tags pinned to entities (`TOWER-1`, `B-14`, `WX-1`, `PK-03`…), with a status glyph; the selected one turns signal orange. A vertical altitude scale on the left, a compass/heading tape at the bottom (e.g. `211°`).
- **HUD**:
  - Top bar: logo · `Org / Region / Site ▾` breadcrumb · global search ("Search vehicles, tanks, tasks") · UTC clock · telemetry latency (`Telemetry 38 ms`) · `Range GO` badge · alerts counter (turns signal orange: `▲ 1 alert`) · user avatar + role (`Launch director`).
  - Top-left **flight card** `[LC-1 FLIGHT 7]`: next launch T-minus or "days to next launch", propellant loaded % + sparkline, stages ready `3 of 5` with segmented bar, range `GO` + sparkline.
  - Right **inspector card** for the followed entity: name, class, flight, status chip (`↑ Ascent · following`, `Landing burn`, `Caught, safing`, `On station, holding pattern`), grid of metrics (mission clock, altitude, velocity, propellant, engines lit `33 of 33`, catch arms `Open/Closed`, heading, crew/cargo, position), a progress bar (`Flight to tower catch 27.9 %`) and a small line chart (altitude km / propellant %).
  - Bottom-right **tabbed panel**: `Vehicles · Tanks · Tasks · Range · Events`. Each row: icon, name, sub-status, one key value (`100 % prop`, `9.7 km`, `47 km/h`). Selected row highlighted with a flat pale-orange tint. Clicking a row focuses the camera.
  - Bottom **countdown timeline**: `[COUNTDOWN] LC-1 · B-14 / S-31` + big `T-00:00:04` / `T+00:01:45`, a segmented phase bar with a playhead: `Rollout → Stack → Propellant load → Terminal count → Liftoff → Boostback → Tower catch → Safing`, checkboxes for done phases, half-filled glyph for the current one.
  - Vertical map controls (zoom +/−, rotate ‹ ›, frame, home, recenter).
- **Design direction — Industrial Brutalism, "Swiss Industrial Print" mode (light)**: the HUD follows the `industrial-brutalist-ui` skill (see Phase 0). Commit to the **light** archetype only — never mix in the dark CRT/terminal mode. Concretely, this *overrides* the softer look of the reference video:
  - Matte unbleached-paper substrate (`#F4F4F0` / `#EAE8E3`), carbon-ink foreground (`#0A0A0A`–`#111111`), **one single accent: signal orange** (`#FF5A1F`, project override of the skill's hazard red — decided by the user), with an ink-safe darker shade (`#C2410C`) for small orange text on paper (AA), used identically in the HUD and in 3D (exhaust core, selection, alerts, recovery rings). No other hue.
  - **No border-radius, no gradients, no soft drop shadows, no glassmorphism/translucency.** Panels are opaque, compartmentalized by 1–2 px rules; use the `display:grid; gap:1px` trick on a contrasting parent for razor-thin dividers.
  - **Bimodal type**: monospace micro-type (JetBrains Mono / IBM Plex Mono, 10–14 px, UPPERCASE, tracking 0.05–0.1em, tabular figures) for every label, call-sign, unit and value; heavy neo-grotesque macro-type (Inter Black / Archivo Black, tight negative tracking, leading ~0.9, uppercase) reserved for a few hero numbers — the countdown `T-00:00:04`, the followed vehicle's call-sign, phase name on transitions.
  - Syntax decoration as structure: `[ LC-1 FLIGHT 7 ]`, `>>>`, `///`, crosshairs `+` at grid intersections, `REV`/`UNIT` stamps, barcode / warning-stripe accents on alerts and hazard zones.
  - Analog texture: one global, **static** low-opacity noise overlay on the DOM; halftone / 1-bit dithering is welcome and fits the point-cloud sea & ground of the 3D world (can be a cheap postprocessing pass). No scanlines (that's the dark mode).
  - Semantic DOM for telemetry: `<data>`, `<output>`, `<dl>`, `<samp>`, `<kbd>`.
  - The 3D scene stays matte clay monochrome so the HUD and world read as one printed technical document.
- **Behavior**: the camera smoothly *follows* the selected entity (booster climbing, recovery ship, transporter in the yard), lerping between targets. Telemetry ticks live. Exhaust and foam particles. Booster returns and is caught by the tower arms. Logistics keep moving in the background (tankers driving to/from the tank farm, transporters rolling in the yard).

# Non-negotiable principles

1. **Docs and team before code.** No application code until Phase 0 and Phase 1 are approved.
2. **The stack is NOT imposed.** A previous draft proposed Next.js + R3F + Zustand + Tailwind with a `setInterval` loop. Treat it as *one candidate*, not a decision. The architect agent must challenge it and record the decision in an ADR. Known concerns to evaluate explicitly:
   - Is SSR/App Router worth anything for a client-only real-time 3D game? (Vite SPA vs Next.js vs other.)
   - High-frequency simulation state must **not** live in React state / re-render React at 60 Hz. Separate a **deterministic, fixed-timestep simulation core** (pure TS, no three.js import, testable headless, possibly in a Web Worker) from rendering and from a throttled UI store.
   - ECS (e.g. koota / miniplex / bitecs) vs plain store for hundreds of entities.
   - Time control (pause, 1×, 10×, 100× time compression) and save/load must fall out of the architecture naturally.
   - Rendering: WebGL2 vs WebGPU renderer of three.js, instancing for point-cloud terrain/sea, postprocessing budget.
3. **Blender is part of the build, not an external assumption.** Assets are produced by version-controlled `bpy` scripts run with `blender -b -P …`, exported to GLB, optimized, and their typed React/three wrappers generated. Blender is also used to **render** turntable/preview images of every asset (for review, docs and the in-game catalog). If Blender is not installed, install a portable Blender LTS build and document it (and add a SessionStart hook so cloud sessions get it).
4. **It is a game, not a dashboard.** Every UI widget must serve a player decision. The game designer owns the "why".
5. **Small verified steps.** Each task ends with: typecheck + lint + tests green, a screenshot (Playwright) for anything visual, and a TASKS.md update. Commit per task with a clear message.
6. **Ask, don't guess, at the gates.** At the end of each phase, stop, summarize decisions + open questions, and wait for my approval.

# Phase 0 — Build the team (agents, skills, CLAUDE.md)

Create these **sub-agents** in `.claude/agents/<name>.md` (frontmatter: `name`, `description` that says *when* to use it, `tools`, optional `model`). Each agent file must contain: mission, inputs it reads, outputs it owns (exact file paths), quality bar, and what it must hand back to the orchestrator.

| Agent | Owns | Notes |
|---|---|---|
| `game-designer` | `docs/GDD.md`, `docs/BALANCING.md`, lore & naming | Core loop, progression, economy, failure states, MVP vertical slice. Pushes back on features with no player decision. |
| `systems-architect` | `docs/ARCHITECTURE.md`, `docs/adr/*.md`, repo layout | Chooses the full stack with ADRs, defines sim/render/UI boundaries, data model, game loop, perf budget. |
| `simulation-engineer` | `src/sim/**` (or equivalent) + tests | Deterministic fixed-step sim, state machines (countdown, vehicles, logistics), simplified flight physics, event bus, save/load, time scale. No three.js imports. |
| `blender-technical-artist` | `blender/**`, `docs/ASSETS_GUIDE.md`, `public/models/**` | Procedural bpy modeling, naming/pivots/sockets, LODs, GLB export, Blender preview renders. |
| `three-graphics-engineer` | `src/render/**` | Scene, camera rig, lighting, point-cloud sea/terrain, particles (exhaust, foam, steam), instancing, postprocessing, labels anchoring, perf. |
| `ui-design-system` | `docs/DESIGN_SYSTEM.md`, tokens, `src/ui/**` | Tokens, typography, components (cards, chips, tables, timeline, sparkline, tabs), accessibility, density. Must load and apply the `industrial-brutalist-ui` skill (Swiss Industrial Print mode) for every UI decision. |
| `qa-perf` | `tests/e2e/**`, `docs/QA.md` | Playwright visual snapshots, FPS / draw-call / memory budgets, sim determinism tests, regression checks. Reviews every PR-sized change. |

Add others only if justified (e.g. `audio-designer` later). Agents run in parallel when their work is independent (e.g. game-designer + architect + design-system in Phase 1).

Create these **project skills** in `.claude/skills/<skill>/SKILL.md` (frontmatter `name` + a `description` precise enough to trigger), with any helper scripts beside them:

- `blender-asset-pipeline` — create/modify an asset: bpy script template, run headless, export GLB, optimize (gltf-transform: dedup, prune, weld, meshopt/Draco, texture compression), generate typed component (gltfjsx or equivalent), render a preview PNG, validate against the asset checklist. One command per asset, e.g. `npm run asset -- tower`.
- `add-entity` — end-to-end recipe to add a new game entity: sim definition → asset → render component → UI row/inspector → tests.
- `industrial-brutalist-ui` — **import, don't rewrite**: copy the existing skill from `~/Code/phant0mhex/.agents/skills/industrial-brutalist-ui` into `.claude/skills/industrial-brutalist-ui/` (if that path is not reachable in this environment, ask me to provide it rather than inventing a substitute). Add a short project addendum at the end of its `SKILL.md`: "Fuel-X uses Swiss Industrial Print (light) only; the accent is signal orange `#FF5A1F` instead of hazard red; the 3D scene must match the substrate and accent tokens; noise overlay must be static (perf)."
- `design-tokens` — how to use/extend tokens (derived from `industrial-brutalist-ui`); forbids hard-coded colors/sizes, `border-radius`, shadows and gradients in components.
- `sim-testing` — how to write deterministic sim tests (seeded RNG, fixed dt, golden snapshots of a full launch timeline).
- `visual-check` — launch the app, drive it with Playwright to a given state (e.g. `T+00:01:45`, entity `B-14` followed), screenshot, compare.
- `perf-audit` — measure FPS, draw calls, triangles, GPU memory, bundle size against the budget in ARCHITECTURE.md.

Write **`CLAUDE.md`** at the repo root (concise, < ~150 lines, link to docs instead of duplicating). It must contain:
- One-paragraph pitch + link to GDD.
- Commands (dev, build, test, lint, typecheck, asset pipeline, e2e, perf).
- Repo map (one line per top-level dir).
- Hard rules: sim never imports render/UI; no hard-coded design values; units are SI (meters, seconds, kg) everywhere in sim; Blender Z-up → glTF Y-up handled only in the exporter; every asset is reproducible from its script; no binary asset committed without its source script; determinism (no `Math.random()` / `Date.now()` in sim).
- Workflow: which agent for which kind of task, the phase gates, Definition of Done, commit conventions.
- Pointers to `docs/*`.

Also create `.claude/settings.json` with sensible permissions for the commands above, and a SessionStart hook that installs dependencies (and Blender if missing) in cloud sessions.

**Gate 0**: show me the agent roster, skills list and CLAUDE.md. Wait.

# Phase 1 — Design (agents in parallel, then consolidation)

### 1a. `game-designer` → `docs/GDD.md`
Start from this seed and turn it into a real design (challenge it, cut it, sharpen it):

- **Fantasy**: you are the launch director of a growing spaceport. Calm competence under pressure; the drama is in logistics, timing and risk, not twitch skills.
- **Core loop (one campaign)**: win a contract (payload, window, price, penalty) → **prepare** (build/refurbish booster & ship in the yard, roll out on transporters, stack with crane/tower, order propellant: tankers shuttle from the tank farm, boil-off is real) → **count down** (go/no-go polls per station: weather, range clear of boats, propellant, vehicle health, crew rest; you can hold, recycle, scrub) → **launch live** (watch telemetry, react to anomalies: engine-out, abort, hold catch arms, divert to ocean landing) → **recover** (tower catch or ship recovery; damage → refurbishment time/cost) → **turnaround** (cadence is the score) → reinvest (new pad, more tanks, more transporters, faster crews, better weather radar).
- **Resources**: money, propellant (LOX/CH4 inventories, transfer rates, boil-off), vehicles (each booster has a flight count, wear, history), crews & shifts, pad availability, reputation/insurance.
- **Risk & uncertainty**: weather fronts, sea state for the recovery fleet, component reliability rolls, schedule slips, range violations (a fishing boat in the hazard zone).
- **Time**: real-time with pause and time compression; countdowns can be played at 1× for the tension, logistics can be compressed.
- **Strategy layer**: multi-site map (orbital pad, pad under construction, test stand, build yard inland) — building, upgrading and routing between them.
- **Fail states / pressure**: missed window penalties, lost vehicles, bankruptcy, reputation collapse.
- **MVP vertical slice** (must be defined precisely, with acceptance criteria): one site, one pad + tank farm + small yard, one booster + one ship, one contract → a full cycle **Rollout → Stack → Propellant load → Terminal count → Liftoff → Boostback → Tower catch → Safing**, with at least 2 meaningful player decisions and 1 random anomaly, logistics vehicles moving in the background, all HUD panels live.

Also: `docs/BALANCING.md` (tunable numbers in data files, not code), naming/lore sheet for entities and sites (original names, consistent call-sign scheme like `B-14`, `S-31`, `SP-41`, `CR-77`).

### 1b. `systems-architect` → `docs/ARCHITECTURE.md` + `docs/adr/0001…`
- ADRs for: app framework & build tool, renderer (and R3F or not), sim architecture (ECS or not, worker or not), state/UI binding, styling approach, testing stack, asset pipeline tooling, deployment target.
- Module diagram (sim ↔ render ↔ UI ↔ assets), data flow per tick, fixed-step loop with interpolation for rendering, event bus, save format, time scale.
- Entity data model (shared types), state machines for countdown phases and each vehicle class.
- **Performance budget**: target 60 fps on a mid-range laptop iGPU at 1080p; max draw calls, triangles on screen, per-asset tri/size budget, texture budget, JS bundle budget, sim tick cost.
- Repo layout & scripts.

### 1c. `ui-design-system` → `docs/DESIGN_SYSTEM.md` (applies `industrial-brutalist-ui`, Swiss Industrial Print mode)
- Tokens (CSS variables / theme, also exported as TS constants for the 3D materials): paper substrate, a short ink/grey ramp for clay shading and rules, **one accent** signal orange (`#FF5A1F`, text-safe `#C2410C`) + a flat (opaque) pale tint for the selected row, semantic states expressed with ink + orange + glyphs/stripes rather than extra hues (decide and justify how "warn" differs from "danger" without adding a color). Radius = 0, shadow = none.
- Typography: monospace micro-type for labels, numbers, call-signs (tabular figures, uppercase, tracked); heavy grotesk macro-type for the countdown and hero call-sign; type scale for dense data; `clamp()` only on macro-type.
- Grid: a blueprint grid for the HUD frame (named areas for top bar, flight card, inspector, tabbed panel, timeline), crosshair marks at intersections.
- Components spec: top bar, breadcrumb site switcher, search, status badge (`Range GO`), alert counter, flight card, metric tile + sparkline, segmented progress, inspector card, status chip, tabbed list, list row, countdown timeline with phase segments & playhead, map controls, in-world label tag, altitude scale, compass tape, toasts/events.
- Rules: 3D world stays monochrome; orange = attention/selection/thrust only; numbers never jitter in width; panels are `pointer-events: none` containers with interactive children; WCAG AA contrast on the paper substrate.
- Motion: mechanical, not bouncy — stepped/linear value updates, hard cuts or short eased camera moves; a brief "print/stamp" treatment on phase changes is allowed.
- Deliver a static `/design` route (or Storybook, architect's call) showing every token and component in isolation, screenshotted by `visual-check`.

### 1d. `blender-technical-artist` → `docs/ASSETS_GUIDE.md`
- Units (1 BU = 1 m), real-ish dimensions table for every asset, origin at ground contact, forward axis, Z-up in Blender / Y-up export.
- Node naming contract with code (e.g. `TOWER_Base`, `TOWER_ArmL`, `TOWER_ArmR`, `BOOSTER_Engines`, `SOCKET_Exhaust`, `SOCKET_Label`, `SOCKET_CatchPoint`, `TRANSPORTER_Wheel_*`). Empties as sockets for particles/labels/attachments. Animated parts as separate nodes with correct pivots.
- Material contract: a tiny shared palette of named materials (`MAT_Clay`, `MAT_ClayDark`, `MAT_Metal`, `MAT_Glass`, `MAT_Accent`) whose colors come from the design tokens (paper/ink/signal orange), no per-asset textures by default; optional baked AO. Blender preview renders use the same substrate color as background so they can sit directly in the UI catalog.
- LODs, tri budgets per asset, export settings, optimization steps, preview render settings (turntable, consistent lighting matching the game look).
- Asset list for the MVP with priority order.

### 1e. Consolidation (you, the orchestrator)
Resolve conflicts between docs, then write `docs/TASKS.md`: phased checklist (Phase 2 scaffolding → 3 sim core → 4 asset pipeline + first assets → 5 scene → 6 HUD → 7 vertical-slice gameplay → 8 polish/perf), each task with owner agent, dependencies, and Definition of Done.

**Gate 1**: present a one-page summary: chosen stack and why (with rejected alternatives), core loop, MVP scope, top risks, open questions. **Stop and wait for my approval before scaffolding any code.**

# Phase 2+ — Execution (after approval)

Follow `docs/TASKS.md`. For each task: pick the owner agent, implement, verify (tests, typecheck, lint, screenshot via `visual-check` when visual, `perf-audit` when relevant), have `qa-perf` review, commit, tick the task. Gate with me at the end of each phase with screenshots/GIFs and Blender preview renders.

Ordering guidance:
1. Scaffold + CI-like local checks.
2. Sim core headless first: a full launch timeline must run in a test and produce a golden telemetry log before any 3D exists.
3. Asset pipeline proven end-to-end on one asset (launch tower) — script → Blender render → GLB → in-scene — before modeling the rest. Placeholder primitives are allowed only until the real GLB exists, behind the same component API.
4. Scene: camera rig with follow/focus targets, lighting, point-cloud sea & ground, exhaust/foam particles, labels.
5. HUD wired to a throttled UI projection of the sim.
6. Vertical slice gameplay, then balancing, then polish.

Start now with **Phase 0**.
