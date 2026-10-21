# Fuel-X — QA

> Owner: `qa-perf`. Budgets: [ARCHITECTURE §13](ARCHITECTURE.md) (machine copy `scripts/perf/budget.json`). Test stack: [ADR 0006](adr/0006-testing-stack.md).

## Run everything

```bash
npm ci                 # install (npm 10 is fine for ci)
npm run typecheck      # tsc (app + node/scripts configs)
npm run lint           # eslint (boundaries) + stylelint (brutalist bans) + prettier --check + tokens --check
npm run test           # vitest: unit, sim, golden, equivalence, property, scaffold
npm run build          # tokens → vite build (index + design entries)
npm run e2e            # playwright: builds + previews on :4173, Chromium r1194 from /opt/pw-browsers
npm run perf           # sim timing harness + static budgets (bundle needs a prior build)
npm run perf -- --browser   # + Playwright `perf` project: reference scenes + leak runs (≈ 10 min, SwiftShader)
npm run assets         # Blender pipeline (Phase 4)
```

Adding/upgrading a dependency: use `npx -y npm@11.6.2 install <pkg>@<exact>` — npm 10.9 crashes resolving Vitest's optional Playwright peer (`Cannot read properties of null (reading 'edgesOut')`). `npm ci` from the lockfile is unaffected.

Never run `playwright install`; Playwright stays at 1.56.1 until the preinstalled browser changes.

## What each check guarantees

| Check | Guards |
|---|---|
| `tests/scaffold/boundaries.test.ts` | The ESLint boundary matrix actually fires (sim purity, banned clocks/RNG, type-only sim imports, ui ↛ render) |
| `tests/scaffold/tokens.test.ts` | AA contrast of every allowed text/background pair, single accent family, radius 0 / no shadow |
| `tokens --check` (lint) | Generated `tokens.css` / `tokens.json` match `src/tokens/tokens.ts` |
| Stylelint | No hex/named/rgb colors, gradients, shadows, filters, opacity (except noise overlay), radius ≠ 0, non-token font-size/spacing |
| `tests/e2e/smoke.e2e.ts` | Showcase, game (`/play`) and design entries boot without page errors on the paper substrate |
| `tests/e2e/showcase.e2e.ts` | Showcase: prerendered HTML + SEO/OG/JSON-LD + font preloads, hydration without console errors, 3 CTAs → `/play`, story driver (T-clock, phase bar, active sheet), keyboard tabs/filters/sites, `/play` + `/play.html`, phone (no horizontal overflow), reduced motion (frozen clock) |
| `src/render/systems/showcase/pose.test.ts` · `src/data/showcase.test.ts` | Stage choreography (stack heights, arms on pins, thrust windows, catch pose, mechanism ranges, no NaN) and story timeline (chapters, monotonic clock, phases contiguous) |
| `scripts/perf/budgets.ts` showcase rows | ADR 0009: initial JS ≤ 90 KB gz, 3D chunk ≤ 300 KB gz, showcase GLB ≤ 350 KB, images ≤ 600 KB |
| `tests/e2e/scenes.perf.ts` (opt-in `perf` project) | ARCHITECTURE §13.1 counts at the 4 reference scenes: main / shadow draw calls, triangles, point cloud, FX sprites, programs |
| `tests/e2e/leaks.perf.ts` (opt-in `perf` project, 8.1, ≈ 7.5 min) | Four full runs to Debrief (seed 42, seed 42 again, new seed 7, seed 42): live WebGL buffers / textures / VAOs / programs, renderer.info geometries / textures, DOM nodes and JS heap after GC do not grow from run to run |

## Simulation tests

| Suite | Guards |
|---|---|
| `src/sim/**/*.test.ts` | Unit + table-driven FSM tests per system (countdown, prep, logistics, propellant, flight, environment, range, anomalies, economy, scenario/autopilot) |
| `tests/golden/full-launch.test.ts` | Seed-42 full launch with the standard autopilot vs `tests/golden/__files__/full-launch.seed42.log` (one line per event, telemetry every 5 min / 5 s in flight, debrief summary). AC 1, 16, 19–22 |
| `tests/sim/equivalence.test.ts` | Save → load at T-01:50 and in boostback ≡ straight run; replay of the command log ≡ recorded event log + hash; uneven step batches ≡ step-by-step |
| `tests/sim/properties.test.ts` | 200 fast-check cases (6 snapshots × random seeds × random commands, 100 s each): no negative propellant, tanks within capacity, mass conserved before liftoff, no NaN, phases monotonic except RECYCLE |
| `scripts/sim/anomaly-sweep.ts` (manual) | AC 3: 200 full runs, policies `none` and `hands-off`; ≥ 1 anomaly in every run, distribution within ±10 points of the director weights; AC 3c hands-off divert share 10–25 % (re-targeted 7.5b), none at p ≥ `autoCatchThreshold`, none without an engine-out, failed catches ≤ 8 %. Results below |

**Save fixtures**: `tests/fixtures/saves/schema-<n>.json` are frozen (prettier-ignored canonical JSON). On a `WORLD_SCHEMA` bump: keep the old fixture, add `migrations[n]` in `src/sim/save/migrations.ts`, then `npx tsx scripts/sim/make-save-fixture.ts` writes the new schema's fixture (it refuses to overwrite).

**Golden update**: `npx vitest run tests/golden -u`, read the diff, explain in the commit which rule or number changed it (never regenerate to silence a red test).

## Visual baselines

Phase 2 reference screenshots (manual, not baselines yet): `docs/screens/phase2-game.png`, `docs/screens/phase2-design.png`. Baselines (`*.visual.ts`) start in Phase 5 once `window.__fuelx` exists; mask the noise overlay and clocks. Full-page screenshots show the fixed noise overlay only on the first viewport — expected.

### Gate 5 screenshots (2026-10-19, `FUELX_SCREENS=1 npm run e2e`, production build, SwiftShader 1920×1080, frozen visuals)

| State | File | Spec |
|---|---|---|
| Terminal count, home (LC-1, T-00:00:04) | `docs/screens/phase5-terminal-count@T-00-00-04.png` · `phase5-home.png` (FX home framing) | `scene.e2e` · `fx.e2e` |
| Ascent following B-09 (T+00:01:45) | `docs/screens/phase5-ascent-follow-B09@T+00-01-45.png` · `phase5-fx-ascent-follow-B09@T+00-01-45.png` | `scene.e2e` · `fx.e2e` |
| Tower catch (T+00:06:55) | `docs/screens/phase5-anim-catch@T+00-06-55.png` | `anim.e2e` |
| Liftoff FX (T+00:00:03) | `docs/screens/phase5-fx-liftoff@T+00-00-03.png` | `fx.e2e` |
| Recovery rings (divert, RV-1, T+00:06:45) | `docs/screens/phase5-fx-recovery-rings.png` | `fx.e2e` |

Also current: `phase5-pad-close@T-00-00-04.png`, `phase5-anim-{rollout-SP41-B09,crane-CR77,tower-qd,boostback-follow-B09}@….png`, `phase5-world-{home,sea}@T-00-00-04.png`, `phase5-fx-landing-burn.png`. Liftoff still shows the stack ≈ 600 m up at T+3 s (sim piecewise-linear profile, TASKS 5.6 follow-up), so no plume impingement on the pad yet.

## Latest numbers

| Date | Metric | Budget | Measured |
|---|---|---|---|
| 2026-10-18 (Phase 2, empty app) | Initial JS gzip | 450 KB | 66.7 KB |
| | CSS gzip | 25 KB | 2.7 KB |
| | Fonts (WOFF2) | 150 KB | 85.1 KB |
| | GLB payload | 4 MB | 0 |
| 2026-10-18 (Phase 3.10, `npm run perf`, Node 22, container 4 vCPU) | Sim tick, MVP world (full seed-42 run, 750 455 ticks) mean / p95 | 50 / 150 µs | 2.94 / 4.72 µs |
| | Sim per frame at 100× (50 steps) p95 | 4 ms | 0.22 ms |
| | Sim tick, stress world (2 000 entities, from T-01:10:00) mean (p95) | 400 µs | 76.3 µs (151 µs) |
| | MVP save at Debrief (raw canonical JSON, no command log) | 200 KB | 16.7 KB |
| | Golden full-launch test runtime (Vitest, uninstrumented) | 5 s | ≈ 3.7 s |

### AC 3 anomaly sweep (2026-10-21, after 7.5b, `npx tsx scripts/sim/anomaly-sweep.ts 200`, 320 s on 4 cores)

`autoCatchThreshold` 0.65 (BALANCING §15 P3), fronts ≤ 60 min (P1), deadband 0.05 (P4), final poll always asks.

| Policy | Runs with ≥ 1 anomaly | Anomalies / run | A1 | A2 | A3 | A4 | Outcomes |
|---|---|---|---|---|---|---|---|
| `hands-off` | **200 / 200** | 1.38 | 33.5 % (+3.5) | 22.2 % (−2.8) | 20.0 % (0.0) | 24.4 % (−0.6) | 156 caught, 27 diverted (26 auto at p < 0.65, 1 forced), 11 catch failed, 6 scrubbed |
| `none` | **200 / 200** | 1.00 | 100 % | — | — | — | 200 scrubbed (director fallback A1 in 127) |

AC 3c (hands-off, 194 flights): diverted **13.9 %** (target 10–25 %), none at commit-time p ≥ 0.65, none without an
engine-out; failed catches **5.7 %** (target ≤ 8 %); scrubs 6 (≤ 7). Outcome sweep (seeds 0–199, standard / frugal /
hedger) and the other §15.3 targets: BALANCING §15.5.

### AC 3 anomaly sweep (2026-10-18, balancing pass 1, `npx tsx scripts/sim/anomaly-sweep.ts 200`, 233 s on 4 cores)

| Policy | Runs with ≥ 1 anomaly | Anomalies / run | A1 | A2 | A3 | A4 | Outcomes |
|---|---|---|---|---|---|---|---|
| `hands-off` (standard prep + orders + GO, no anomaly/catch decisions) | **200 / 200** | 1.38 | 33.3 % (+3.3) | 22.1 % (−2.9) | 20.3 % (+0.3) | 24.3 % (−0.7) | 152 caught, 30 diverted (29 auto at p < 0.70, 1 forced), 11 catch failed, 7 scrubbed |
| `none` (no input at all) | **200 / 200** | 1.00 | 100 % | — | — | — | 200 scrubbed (count frozen at the load poll; director fallback 30 min before window close, only A1 eligible) |

Weights 30 / 25 / 20 / 25 %; tolerance ±10 points (hands-off policy, where every anomaly is reachable).
AC 3c (hands-off, 193 flights): diverted **15.5 %** (target 15–25 %), none diverted at commit-time p ≥ `autoCatchThreshold`
(0.70); failed catches 5.7 % (target 3–7 %); scrubs 7 (target ≤ 12). The sweep script fails on any AC 3a/3c miss.
Before pass 1: 105 caught, 82 diverted (p < 0.90), 1 failed, 12 scrubbed.

### Showcase (2026-10-19, `npx tsx scripts/perf/budgets.ts` after `npm run build`)

| Metric | Budget | Measured |
|---|---|---|
| Showcase initial JS gzip (index.html graph: React + page) | 90 KB | 77.6 KB |
| Showcase 3D chunk gzip (three + R3F + stage, lazy) | 300 KB | 264.7 KB |
| Showcase GLB (9 LOD0 files) | 350 KB | 278.8 KB |
| Showcase images (plates + OG + marks) | 600 KB | 340.5 KB |
| Prerendered markup | — | 29 KB |
| Game initial JS gzip (play.html graph; the row now follows the entry graph instead of every chunk) | 450 KB | 443.6 KB |

After merging the 5.3–5.7 render commits (2026-10-19): game initial JS gzip (play.html graph) **452.5 KB vs 450 — OVER by 2.5 KB**, from the new FX/post code, not the showcase (showcase rows unchanged).
**Fixed in 5.9**: per-module attribution (sourcemap build) showed `postprocessing` at **62.9 KB gz** of the play chunk (ARCHITECTURE estimated 25; SMAA's lookup images are inlined). `post/pipeline` is now a dynamic import from `RenderPass` (frames before it lands are drawn raw; `isReady()` waits for `shared.postReady`, so `__fuelx.ready()` screenshots always include post): initial JS **452.6 → 386.0 KB gz**, lazy `pipeline` chunk 69.1 KB gz, showcase initial 77.8 → 78.0 KB (shared preload helper).

### Phase 5 perf-audit (5.9, 2026-10-19, production build `/play.html?debug=1`, full visuals, SwiftShader 1920×1080, 4 vCPU)

`npm run perf -- --browser` = sim bench + static budgets + `tests/e2e/scenes.perf.ts` (opt-in `perf` project; writes `test-results/perf-scenes.json`; counts asserted against `scripts/perf/budget.json` `scene`). Counts on a frozen frame after `freezeVisuals(true)` + 4 frames; frame times = rAF deltas over 10 s live at 1×.

| Metric (budget) | Terminal count LC-1, home, T-00:00:04 | Liftoff LC-1, home, T+00:00:03 | Ascent follow B-09, T+00:01:45 | Rollout follow SP-41 + B-09, T-05:15:00 |
|---|---|---|---|---|
| Draw calls main pass (≤ 200) | 47 | 32 | 25 | 28 |
| Draw calls shadow pass, last refresh (≤ 60) | 35 | 35 | 16 | 18 |
| Triangles (≤ 800 k) | 12.8 k | 9.3 k | 10.7 k | 14.9 k |
| Point cloud = points − fxPoints (≤ 300 k) | 297.7 k | 297.7 k | 297.7 k | 297.7 k |
| FX sprites live (≤ 20 k) / FX point vertices | 1 250 / 9 800 | 13 834 / 18 672 | 8 034 / 18 672 | 1 250 / 9 800 |
| Shader programs (≤ 30) | 15 | 16 | 16 | 16 |
| Textures / geometries | 13 / 48 | 13 / 49 | 13 / 60 | 13 / 72 |
| Frame median / p95, ms (16.7 / 20 on the reference iGPU) — SwiftShader, indicative | 1 317 / 1 750 | 1 233 / 1 800 | 1 317 / 2 117 | 1 250 / 2 067 |
| Sim + snapshot write, 900-tick batch in the page, µs/tick | 65 | 30 | 28 | 46 |
| React commits / s live (≤ 12, 0 when nothing spawns) | 0 | 0 | 0 | 0 |

- First Playwright perf baseline: no earlier frame-time numbers to diff against (Δ = —). SwiftShader frame times are CPU raster, ~1 fps at 1080p with post + 300 k points; compare run to run only.
- Point cloud sits at **99 % of its budget** (297.7 k of 300 k): any density increase must come out of another level.
- The loop's own `stats().simUsPerTick` is not usable under SwiftShader (mean of per-advance ratios at `performance.now()`'s 100 µs clamp while raster threads take every core: 200–2 200 µs mean); use the batched number above and the Node bench.
- **Host tick ≠ sim tick**: Node, seed 42, 60 000 ticks: `jump` (sim only, one snapshot write) 4.6–7.0 µs/tick vs `advance` (snapshot + anim writers every tick) 20–23 µs/tick, so the writers cost ≈ 15 µs/tick, 3–4× the sim, and `sim-bench` leaves them out. At 100× (50 steps) that is ≈ 1 ms/frame in Node (budget 4 ms p95); see review finding M1.

| Static / Node (`npm run perf`, 2026-10-19 5.9) | Budget | Measured | Δ vs last |
|---|---|---|---|
| Game initial JS gzip (play.html graph) | 450 KB | **386.2 KB** | −66.4 (post pipeline lazy, 69.1 KB chunk) |
| CSS gzip (all) | 25 KB | 7.2 KB | +4.5 since Phase 2 (showcase) |
| Fonts | 150 KB | 85.1 KB | 0 |
| GLB payload (all of `public/models`) | 4 MB | 739.2 KB | first measure with assets |
| Showcase initial JS / 3D chunk / GLB / images | 90 / 300 / 350 / 600 KB | 78.0 / 264.8 / 278.8 / 340.5 KB | +0.2 / 0 / 0 / 0 |
| Sim tick MVP mean / p95 (Node bench) | 50 / 150 µs | 4.87 / 8.27 µs | +1.9 / +3.6 (5.0/5.0b tower + attitude; container noise) |
| Sim per frame at 100× p95 | 4 ms | 0.40 ms | +0.18 (sim only, see host-tick note) |
| Stress tick mean (p95), 2 000 entities | 400 µs | 138.3 (254.2) µs | +62 |
| MVP save | 200 KB | 16.9 KB | +0.2 |

### Phase 8 perf audit (8.1, 2026-10-21)

Production builds. Static rows: committed `HEAD` (`14048ee`) built in a clean worktree, so the in-flight 8.2 / 8.3
edits in the shared tree do not count; `npm run perf` on Node 22, 4 vCPU, load average 3–4 from two other agents.
Browser rows: `scenes.perf.ts` / `leaks.perf.ts` on the shared tree's build (it included early, uncommitted 8.2 HUD
edits, none in `src/render` or `src/sim`), `/play.html?debug=1`, full visuals, SwiftShader 1920×1080.
**SwiftShader caveat**: WebGL is rasterised on the CPU (≈ 1–6 fps here), so frame times, GPU time and fps say
nothing about the reference iGPU and are not used for a verdict; the audit relies on counts (draw calls, triangles,
points, programs, live GL objects) and CPU timings. Δ = vs the Phase 5 audit (5.9) above.

| Metric | Budget | Measured | Δ vs 5.9 | Status |
|---|---|---|---|---|
| Game initial JS gzip (play.html graph) | 450 KB | **441.9 KB** (play 85.8 · react-dom 66.7 · three/R3F/render 259.2 · HudRoot 27.7 · tokens + preload 2.6); 446.6 KB with the uncommitted 8.2 / 8.3 work in the tree | +55.7 (HUD, Phase 6–7) | ok — 98 %, see F2 |
| CSS gzip (all entries) | 25 KB | 19.0 KB (HudRoot 10.7) | +11.8 | ok |
| Fonts (WOFF2) | 150 KB | 85.1 KB | 0 | ok |
| `/design` entry | separate chunk | `design-*.js` 17.8 KB gz, not in play.html | — | ok |
| GLB payload (`public/models`, 38 files) | 4 MB | 742.7 KB | +3.5 | ok |
| Per-asset LOD0 vs §13.2 class caps | tris / KB / draws | largest: tower 4 084 tris · 68.6 KB · 9 draws (hero ≤ 40 k / 500 KB / 10); booster 6 952 · 59.9 KB · 8 (≤ 20 k / 250 KB / 10); crane 3 666 · 58.2 KB · 7; all 16 contracts pass (`tests/assets/contract.test.ts`) | — | ok |
| Showcase initial JS / 3D chunk / GLB / images (ADR 0009) | 90 / 300 / 350 / 600 KB | 78.0 / 265.1 / 279.9 / 340.5 KB | 0 / +0.3 / +1.1 / 0 | ok |
| Showcase LCP / CLS (ADR 0009) | < 2.5 s / < 0.05 | not measured (no Lighthouse in the container) | — | — |
| Sim tick, MVP mean / p95 (Node bench, 750 455 ticks) | 50 / 150 µs | 5.01 / 8.10 µs | +0.14 / −0.17 | ok |
| Sim per frame at 100× (50 steps) p95 | 4 ms | 0.35 ms (sim only) | −0.05 | ok |
| Sim tick, stress (2 000 entities) mean (p95) | 400 µs | 110.3 (205.6) µs | −28 | ok |
| Host tick in the page (sim + snapshot / anim writers, 900-tick batch) | — (feeds the 4 ms row) | 22–56 µs/tick → 1.1–2.8 ms per 50-step frame at 100× | −9 at T-4 s | ok, see F3 |
| MVP save at Debrief | 200 KB | 17.1 KB | +0.2 | ok |
| Golden full-launch test runtime | 5 s | ~~5.8–6.0 s~~ → **3.8–3.9 s** after `1fb5887` (3 runs: 3 926 / 3 928 / 3 806 ms, 5.1–5.2 µs/tick in Vitest; same-machine A/B before: 5 519 / 5 877 / 5 920 ms) | +0.2 vs 3.7 s (Phase 3) | ok (F1 fixed) |
| Projector per run (Node, `tests/projection/perf.test.ts`) median / mean / p95 | 1 ms median | T-4 s 352 / 429 / 705 µs · T+1:45 273 / 375 / 586 µs | −0.01 mean | ok |
| Projector per run, browser (SwiftShader, 100 µs clock) | — | 0.91–1.34 ms mean, p95 1.9–5 ms | ≈ 0 | indicative |
| React commits / s (both roots) | ≤ 12 | lowfx: 1× 0–4, 100× 3–7 · full visuals: 1× 0–4, 100× 0–2 (frame-bound: one commit per frame at most under SwiftShader) | — | ok |
| Time to `__fuelx.ready()` (cold page, local preview, full visuals) | ≤ 3 s | 2.1 s (SwiftShader) | first measure | ok (indicative) |
| Frame median / p95 (reference iGPU 16.7 / 20 ms) | — | SwiftShader 483–1 133 / 1 683–2 567 ms | — | not meaningful here |
| DOM labels positioned per frame | ≤ 64 | ≤ 29 by construction (at most one label per entity, 29 entities) | — | ok |
| GPU memory textures + RTs | ≤ 96 MB | not measurable via renderer.info; 13 three textures / 17 live GL textures, no asset textures (shadow map 2048², post targets at 1080p) | — | not measured |
| Particles CPU update | ≤ 1 ms | not instrumented separately | — | — |

Reference scenes (`tests/e2e/scenes.perf.ts`, counts on a frozen frame, budget §13.1; all assertions pass):

| Metric (budget) | Terminal count T-00:00:04 | Liftoff T+00:00:03 | Ascent follow B-09 T+00:01:45 | Rollout SP-41 T-05:15:00 |
|---|---|---|---|---|
| Draw calls main (≤ 200) | 48 (+1) | 49 (+17, likely the eased liftoff: the stack is still at the pad in the home frame) | 25 (0) | 28 (0) |
| Draw calls shadow, last refresh (≤ 60) | 36 (+1) | 36 (+1) | 16 (0) | 18 (0) |
| Triangles (≤ 800 k) | 13.0 k | 13.0 k | 10.7 k | 15.1 k |
| Point cloud = points − fxPoints (≤ 300 k) | 297.7 k | 297.7 k | 297.7 k | 297.7 k |
| FX sprites live (≤ 20 k) | 1 250 | 13 834 | 8 034 | 1 250 |
| Shader programs (≤ 30) | 15 | 16 | 16 | 16 |
| Textures / geometries | 13 / 49 | 13 / 50 | 13 / 61 | 13 / 74 |
| Host tick, µs/tick | 56 | 38 | 22 | 31 |
| React commits / s live at 1× | 1 | 1 | 2 | 1 |

**Leaks over full runs** (`tests/e2e/leaks.perf.ts`, `?debug=1&seed=42`, full visuals; each run = `seed()` → paused
`step(9000)` batches with a drawn frame between them → Debrief; counts after 3 frames and two forced GCs):

| Checkpoint | Tick | Entities | Geometries / textures / programs (renderer.info) | Live GL buffers / textures / VAOs / programs | JS heap MB | DOM nodes | Listeners |
|---|---|---|---|---|---|---|---|
| Run 1 seed 42, tick 0 (cold page) | 2 | 29 | 37 / 13 / 14 | 121 / 17 / 66 / 14 | 14.1 | 1 253 | 261 |
| Run 1 Debrief (CAUGHT) | 756 002 | 28 | 84 / 13 / 16 | 272 / 17 / 149 / 16 | 16.6 | 1 644 | 256 |
| Run 2 seed 42, tick 0 | 0 | 29 | 84 / 13 / 16 | 272 / 17 / 149 / 16 | 16.5 | 1 209 | 262 |
| Run 2 Debrief (CAUGHT) | 756 000 | 28 | 84 / 13 / 16 | 272 / 17 / 149 / 16 | 16.8 | 1 644 | 256 |
| Run 3 **new seed 7**, tick 0 | 0 | 29 | 84 / 13 / 16 | 272 / 17 / 149 / 16 | 16.8 | 1 209 | 262 |
| Run 3 Debrief (SCRUBBED) | 864 000 | 29 | 84 / 13 / 16 | 272 / 17 / 149 / 16 | 17.4 | 1 619 | 256 |
| Run 4 seed 42, tick 0 | 0 | 29 | 84 / 13 / 16 | 272 / 17 / 149 / 16 | 17.2 | 1 209 | 262 |
| Run 4 Debrief (CAUGHT) | 756 000 | 28 | 84 / 13 / 16 | 272 / 17 / 149 / 16 | 17.5 | 1 652 | 257 |

- GPU side: **no leak**. Geometries and GL objects grow only during the first run (LODs / FX uploaded on first
  draw) and stay flat from then on, across a replay and a new seed. Views are keyed by entity id and the MVP ids are
  the same every run, so a new run reuses the mounted views (no unmount / remount churn).
- DOM: tick 0 is 1 209 nodes every time; Debrief adds ≈ 410–440 (the debrief sheet), released on the next run.
- JS heap: +0.1–0.35 MB per run, shrinking each run (8 × `seed()` + headless `jumpTo('Debrief')`: 16.34, 16.82,
  16.67, 17.00, 16.82, 17.12, 16.94, 17.20 MB, alternating seeds 42 / 7) — consistent with JIT / inline caches
  settling, not a per-run retained structure; the spec allows 2 MB. Watch item F4.

**Findings (ranked)**

1. **F1 — Medium — golden full-launch test 5.8–6.0 s > 5 s budget** — **fixed in `1fb5887`** (simulation-engineer):
   3.8–3.9 s (3 926 / 3 928 / 3 806 ms vs 5 519 / 5 877 / 5 920 ms before, A/B on the same machine), garbage 2.3 → 1.0
   KB/tick; module-level aliases for `@data` / `DT_S` (Vitest `export *` getters), FSM trigger index, in-place mover
   poses, cached `countdownIds`, no per-tick arrays / closures. Golden, projection and save/replay tests unchanged. Original finding (`tests/golden/full-launch.test.ts`). Cause: the
   sim tick grew 2.94 → 5.0 µs/tick in the Node bench since Phase 3 (tower, attitude, weather, ambient logistics, HUD
   decisions), and Vitest + the golden callback add ≈ 2.8 µs/tick. CPU profile of a headless run is flat (top self:
   GC 5.5 %, `step` 5.4 %, `src/data` getters 3.7 %, propellant 3.6 %, environment 2.5 %), so per-tick allocation
   (GC) is the first lead. Per-tick cost is still 10× under the 50 µs budget, so players are unaffected; the 5 s
   budget protects the test loop. Owner: **simulation-engineer** (cut per-tick allocations, cache `src/data` lookups
   in hot systems) or **systems-architect** (re-budget). Not fixed here: the work is in `src/sim`.
2. **F2 — Medium — initial JS 441.9 / 450 KB (98 %)**; 8.3 (autosave, `3a3f90e`) landed during the audit: **446.6 KB**
   at `2b6e87f` (99 %), so the next feature overruns. Candidates: load the save / load sheet and IndexedDB code (`src/app/persistence`,
   `src/ui/hud/persistence`) and the debrief sheet through dynamic imports (needed at Debrief / on `Ctrl+S` only);
   keep `@axe-core/playwright` a devDependency (it is). Owner: **systems-architect** with the 8.3 owner.
3. **F3 — Low — 5.9 M1 still open**: the snapshot + anim writers run every tick (`src/app/sim-host/inline.ts:135`),
   host tick 22–56 µs/tick in the page vs 5 µs of sim, so 100× costs 1.1–2.8 ms of the 4 ms per-frame sim budget at
   terminal count. Owner: **systems-architect / three-graphics-engineer** (write only the last two ticks of a batch).
4. **F4 — Low — JS heap +0.1–0.35 MB per new run, decaying** (table above). Re-check after 8.3 autosave lands; take
   a heap-snapshot diff if it stops decaying. Owner: **qa-perf**.
5. **F5 — Low — 5.9 L3 still open**: `stats().simUsPerTick` is a mean of per-advance ratios (`inline.ts:148`),
   200–300 µs here under SwiftShader; use Σ ms / Σ steps. Owner: **systems-architect**.
6. **F6 — Low (latent)** — `InstancedParts` (`src/render/views/instanced-parts.ts`) creates an `InstancedMesh` per
   transporter / tanker view and `Pool.lod` (`src/render/views/pools.ts`) keys by entity id; neither is released on
   unmount. Harmless today (ids are stable, the leak spec shows flat GL buffers), but a future spawn / despawn flow
   (more tankers, other sites) would leak one instance-matrix buffer per view. Owner: **three-graphics-engineer**
   (`im.dispose()` in the view's cleanup, `lod.delete(id)` when a handle leaves).
7. **L1 (5.9) unchanged** — point cloud at 297.7 k of 300 k (99 %).

## Phase 8 accessibility & keyboard audit (8.2)

2026-10-21, **ui-design-system**, production build (`npm run build && npm run preview`), Chromium 1194 / SwiftShader,
`/play.html?debug=1&lowfx=1` seed 42 and `/design.html`, at **1920×1080** and **1280×720**. Reference: DESIGN_SYSTEM §8
(keyboard map, focus order, live regions, contrast, reduced motion, landmarks / names).

**Method.** axe-core 4.14 through `@axe-core/playwright` (added as an exact-pinned dev dependency: ~90 WCAG rules —
names, roles, required ARIA parents/children, label-in-name, landmarks, contrast — that a hand-rolled check would not
match; dev-only, nothing in the bundle), tags `wcag2a wcag2aa wcag21a wcag21aa best-practice`; a Tab walk from the top
of the page recording the HUD region and the computed focus ring of every stop; each key of the §8 map pressed in the
game and its effect read back through `window.__fuelx` (view / time / log) or the DOM; `reducedMotion: 'reduce'` and
`contrast: 'more'` emulation; the SP-42 wind hold (seed 42, autopilot, `T−02:19:27`, status
`AMBIENT · WIND HOLD · GUST 15.0 M/S`) followed at 1280×720 with overflow checks on its tag, row and inspector.

**Repeatable as:** `tests/e2e/a11y-design.e2e.ts` (e2e project) and `tests/e2e/a11y-play.scene.e2e.ts` (scene project),
plus `src/ui/hud/a11y.test.ts` (focus order, search filter, Esc chain, map keys, names). Screens:
`docs/screens/phase8-a11y-keys-d1-focused@1920.png`, `docs/screens/phase8-a11y-wind-hold-SP42@1280.png`.

| Area | Before (audit) | After |
|---|---|---|
| axe `/play` 1920 / 1280 | 2 / 1 violations (label-in-name ×2, no `h1`) | **0 / 0** (also on the debrief modal) |
| axe `/design` 1920 / 1280 | 5 rule families, 50 nodes | **0 / 0** (`landmark-unique` off: the gallery repeats specimens by design) |
| Tab order | skip link → top → flight → poll → **ctrl → time → tabs** → labels | skip link → top → toasts → flight → poll → inspector → tabs → strip → time → ctrl → labels (§8) |
| Focus ring | — | 2 px ink square ring on every stop (both pages; search field via its form) |
| Skip link | first stop, lands on `#hud-panels` | unchanged, now e2e-checked |
| Live regions | polite + assertive present | unchanged; polite written on rate keys (checked) |
| Reduced motion | global 0 ms rule | verified: no element of the HUD root with a non-zero transition / animation |
| `prefers-contrast: more` | **not built** | token remap (ink-3 → ink-2, ink-5 → ink) |
| Keyboard map | `/` `Esc` `H` dead; `?` `A` not built | all of `Space , . N Shift+H H F G O B Alt+1…5 + − Q E Z C Esc / Enter` act (e2e); `?` `A` documented post-MVP |

**Keys verified in game** (`a11y-play.scene.e2e.ts`): `Space` pause/resume (+ polite `RATE …`) · `.` / `,` rate up /
down · `N` starts the skip, `N` again cancels · `Alt+1…5` the five tabs · `/` focuses search, typing filters
(`SP-4` → 2 rows, `2 OF n ITEMS`; `NO MATCH`), `Esc` clears, `Esc` leaves · row `Space` selects without moving the camera,
`F` on the row follows, global `F` unfollows, `Z` frames (follows) the selection, `H` home (follow dropped, selection
kept), `Esc` deselects · `+ − Q E` each send one camera nudge; `C` re-frames the followed entity after a zoom nudge
(rendered frame changes) · `Enter` on a world label tag follows it · `O` collapses / expands D1, `G` focuses the strip
(and expands D1) · `Shift+H` sends HOLD (`HoldStarted` logged; the demo autopilot may release it) · on the debrief modal
`Esc` = VIEW SITE (the global chain does not run under a dialog), `B` reopens.

**Findings** (most severe first):

1. **FIXED — Medium — Tab order did not follow §8.** The right column (inspector + tabs) was appended after the
   countdown and map controls in the DOM. `FOCUS_ORDER` (`src/ui/hud/frame/slots.ts`) now drives the frame's DOM order.
2. **FIXED — Medium — world label tags hid status and severity from screen readers** (`SP-42, transporter`): the
   projected `ariaLabel` (`…, AMBIENT · WIND HOLD · GUST 15.0 M/S, WARNING`) was ignored (`WorldLabels.tagDescription`).
3. **FIXED — Medium — dead keys:** plain `H` (home view) was unbound (reserved since 6.6), `Esc` never deselected or
   cleared anything, `/` had no search to focus. `H` in `MapControls` (Shift+H stays the hold), `Esc` chain in
   `frame/keys.ts` (`escapeStep`), tooltip `Esc` now consumes the key so one press = one step.
4. **FIXED — Medium — 1280×720 overflow with the long ambient status:** the full-width status chip widened the inspector
   grid and clipped the whole card body on the right (chip text cut at `GUST 15.0 M/S`, metric column cut); the list
   row ellipsized `… WIND HO…` so the gust value was lost; the tab strip overflowed and clipped `EVENTS` + badge.
   Chip wraps, inspector track `minmax(0, 1fr)`, warn/danger row sub-lines wrap, tabs print `VEH TNK TSK RNG EVT`
   in compact (§3.3). The label tag itself only prints the call-sign (no overflow).
5. **FIXED — Medium (coordinator, from 8.3) — modal dialogs opened top-left:** the global reset strips the UA's auto
   margins; the shared `Dialog` now centres itself (SCRUB / DIVERT confirms, persistence sheets); persistence's local
   `.modal` centring removed. Debrief centring checked in the reduced-motion test.
6. **FIXED — Low — label-in-name (WCAG 2.5.3):** site switcher (`aria-label` "Site LC-1 BRACKWATER, switch site" vs
   visible "LC-1BRACKWATER") and SKIP (`aria-label` vs visible milestone). Names now come from the visible text plus an
   sr-only verb; `<kbd>` hints are `aria-hidden` + `aria-keyshortcuts` (names read `HOLD`, not `HOLD⇧H`); disabled
   reasons are descriptions only. Existing name-based selectors (`/^Skip to …$/`, `B-09,` prefixes) still match.
7. **FIXED — Low — no `h1` on `/play`:** sr-only `FUEL-X · LAUNCH CONTROL`.
8. **FIXED — Low — invalid ARIA:** empty lists rendered an empty `listbox` (now a named `group`); the `/design` states
   matrix had column headers without a `row`; a disabled panel title was ink-4 on paper (3.06:1) → ink-3 (5.91:1).
9. **FIXED — Low — `prefers-contrast: more` (§8) was not implemented.** Token remap in `src/ui/global/base.css`; the
   baked hatch SVG does not follow (acceptable: decorative).
10. **FIXED — Low — top-bar search stub never built** (was defect 6 of the 7.4 report). Built as specified (§6.3 as
    built): filters every tab's rows by call-sign / text, `/` focuses, `Esc` clears.
11. **FIXED — Low (coordinator, from 8.3) — SAVE · LOAD sheet had no visible entry point.** `SAVE · LOAD` button in the
    top bar → `persistence.openMenu()` (the §6.6 user-chip popover is not built).
12. **OPEN — Low — rate keys read the 10 Hz projection:** two `Space` / `,` / `.` presses inside ~100 ms toggle from the
    same stale `timeScale` (Space-Space resumes twice). A human double-tap rarely beats 100 ms; fix = keep the last
    requested rate UI-side until the projection echoes it. Owner: ui-design-system (post-MVP).
13. **OPEN — Low (visual) — compact truncations that keep their accessible names:** flight card vehicles sub-line
    (`B-09 / S-21 · …`), poll header (`[ GO / NO-GO PO…`), and non-current timeline phase codes at both sizes
    (`TERMIN…`, `TE…`): the 5 % segment floor is narrower than the short codes. Readable in full via names / tooltips;
    a shorter code set or a two-row label would fix it.
14. **OPEN (post-MVP, documented) —** `?` shortcut sheet and `A` / `Shift+A` alert keys are not built (DESIGN_SYSTEM §8
    marks them; `/design` prints the generated keyboard map meanwhile).

**Results:** `npm run typecheck` green · `npm run lint` green on every file of this task (the only Prettier warnings
are `src/sim/*` files another agent had open) · `npx vitest run src/ui` 8 files / 128 tests · e2e (production build,
under the shared browser lock): `a11y-design` 5/5, `a11y-play.scene` 3/3, plus the specs touched by the changes —
`design`, `hud-panels`, `persistence`, `smoke`, `hud-world`, `autopilot-run.scene`, `hud-run.scene` — 28/28 green.

## MVP acceptance report (7.4)

2026-10-21, branch `ccr-f2aa8ac4-ssubfl` (after `696f296`). Every row was checked against a test that ran green on this
date: `npm run typecheck`, `npm run lint`, `npm run test` (56 files, 672 tests), `npx tsx scripts/sim/anomaly-sweep.ts 200`
(393 s; same numbers as the AC 3 table above) and the three full-run browser specs below (production build, SwiftShader,
`lowfx`). Where no automated test covers a clause, the note gives the manual probe used (a throwaway Playwright spec
against `/play?seed=42`, deleted afterwards).

**Full-run e2e** (serial `scene` project; ≈ 40 s each on 4 vCPU):

| Spec › test | Path | Ends |
|---|---|---|
| `tests/e2e/autopilot-run.scene.e2e.ts` › ?autopilot=1 plays seed 42 to CATCH under the HUD time controls and the time rules | `/play.html?seed=42&autopilot=1`: the director answers D1, D2 ×3, D3b, D3. Time via the HUD only where the frame rate allows: pause / 1× / 10× / 100× radios, SKIP button (load poll, Debrief), `N`; `__fuelx.step` (paused) for the long stretches. Asserts the §10 widget inventory at boot, 100× runs / pause stops, SKIP stops at its mark, D2 drop to 1× from 10× then raise again, forced 1× from T-00:03:00 (100× requested, effective 1×, ticks/wall s ≤ 1×, SKIP / `N` refused), cap until Safing + 30 s then 100×, requested rate never raised by the game, RUN ENDED at Debrief, VIEW SITE, no page errors | CAUGHT |
| `tests/e2e/hud-run.scene.e2e.ts` › every MVP decision is reachable from the HUD, run ends CAUGHT | Player in control (7.1): Tasks tab + decision strip clicks only | CAUGHT |
| `tests/e2e/hud-run.scene.e2e.ts` › DIVERT on the D3 strip ends DIVERTED | Same run, DIVERT on the D3 strip (+ `DIVERT?` confirm dialog) | DIVERTED, B-09 LOST, ledger BOOSTER LOST + CONTRACT PRICE |

**Status per AC** (GDD §13.3). PASS = every clause covered by a green automated test; PARTIAL = covered but part of
the behaviour is missing (defect below); IN PROGRESS = owned by an open task.

| AC | Status | Covered by | Notes |
|---|---|---|---|
| 1 Same seed + inputs → same event log | PASS | `tests/sim/equivalence.test.ts`::replay: seed + command log reproduces the event log and the world hash (AC 1) · `src/sim/systems/countdown.test.ts`::is deterministic: same inputs → same event log and world hash · `tests/golden/full-launch.test.ts` | Save/load and uneven batching equivalences too |
| 2 Documented start state, all values from `src/data` | PASS | `src/sim/scenarios/scenarios.test.ts`::scenario mvp start state (GDD §13.1, AC 2) · `src/sim/systems/anomalies.test.ts`::natural: rolls only inside T-02:00:00 → T-0 (changing the data rate changes the outcome, AC 2) | "No tunables in systems code" is review-only (ESLint has no rule for it) |
| 3 Anomaly coverage (sweep) | PASS | `scripts/sim/anomaly-sweep.ts` (manual, 200 seeds × 2 policies) · `src/sim/systems/anomalies.test.ts`::director plan (AC 3) | Re-run 2026-10-21 after 7.5b (threshold 0.65): hands-off 200/200, A1–A4 within ±3.5 pts, diverted 13.9 % (none at p ≥ 0.65, none without an engine-out), failed 5.7 %, 6 scrubs; none 200/200 scrubbed with A1 fallback. Not in `npm run test` (5.5 min) |
| 4 Rollout CR-77 → SP-41 → OLM-1, time = path / speed ± 1 tick | PASS | `src/sim/systems/prep.test.ts`::rollout (AC 4) (2 tests) · `tests/e2e/hud-run.scene.e2e.ts` (START ROLLOUT from the Tasks tab) | Visible path: `tests/e2e/anim.e2e.ts` rollout screen |
| 5 Stack with TOWER-1 arms, STACKED, timeline, durations ± 1 tick | PASS | `src/sim/systems/prep.test.ts`::stack (AC 5) (4 tests) · `tests/e2e/hud-run.scene.e2e.ts` (STACK button) | |
| 6 Wind pauses / resumes stacking and transporter | PASS | `src/sim/systems/prep.test.ts`::wind limits (AC 6) (3 tests, forced series) | |
| 7 Delivery: charge, tanker type, lead time, offload rate, farm += delivered − boil-off | PASS | `src/sim/systems/logistics.test.ts`::OrderDelivery (AC 7) (3 tests) · `tests/e2e/hud-run.scene.e2e.ts` (4 orders from the Tasks tab) | |
| 8 No tanker in the hazard radius from T-00:40:00, GATE_WAIT | PASS | `src/sim/systems/logistics.test.ts`::road closure and GATE_WAIT (AC 8) (3 tests) | "visible" = label status `GATE WAIT` (projection), not asserted in a browser |
| 9 Farm boil-off, rate-independent | PASS | `src/sim/systems/propellant.test.ts`::farm boil-off (AC 9) (2 tests) · `tests/sim/equivalence.test.ts` (uneven step batches) | |
| 10 Five stations GO / MARGINAL / NO-GO + driving value | PASS | `src/sim/systems/range.test.ts` (WEATHER, PROPELLANT, VEHICLE, crew vans, station bookkeeping) · `src/ui/hud/decision/decision.test.ts`::poll panel (§6.24) · `tests/e2e/projection-scene.e2e.ts` (5 stations projected) | RANGE shows `—` as its value while clear (no intruder) |
| 11 Polls at T-01:20 / T-00:10 / T-00:00:40, no pass without GO / auto-GO (load / terminal only; final always asks, 7.5b) | PASS | `src/sim/systems/countdown.test.ts`::polls (6 tests, incl. all green: load and terminal polls auto-GO, the final poll always asks) · `src/sim/systems/range.test.ts`::a NO-GO in PropellantLoad auto-holds the count (AC 10–11) · all three full-run e2e (3 D2 entries) | |
| 12 HOLD / RECYCLE / SCRUB semantics | PASS | `src/sim/systems/countdown.test.ts`::HOLD, RECYCLE, SCRUB · `src/sim/systems/propellant.test.ts`::topping … during a hold too, scrub detank (AC 12) · `src/sim/systems/range.test.ts`::… the shift clock runs during holds | |
| 13 Window closes during a hold → auto-scrub + penalty | PASS | `src/sim/systems/countdown.test.ts`::closing during a hold auto-scrubs with the window-missed penalty · `src/sim/systems/economy.test.ts` (Hold:PLAYER, Scrub:AUTO) | |
| 14 GO on MARGINAL applies the risk multiplier (seeded rates) | PASS | `src/sim/systems/anomalies.test.ts`::seeded rates: GO on a MARGINAL station doubles the engine-out rate (AC 14) | |
| 15 Load rates, topping, auto-hold at T-00:03:00 | PASS | `src/sim/systems/propellant.test.ts`::propellant load + topping (AC 15), auto-hold at T-00:03:00 (AC 15) · `src/sim/systems/countdown.test.ts`::auto-hold at T-00:03:00 (AC 15) | |
| 16 Nominal profile: MECO T+155 ± 2 s, catch T+415 ± 5 s | PASS | `tests/golden/full-launch.test.ts`::flies the nominal profile within the AC 16 tolerances · `src/sim/systems/flight.test.ts`::nominal flight, no input (AC 16, 19–21) | |
| 17 Inspector values = projection, ≤ 250 ms old | PASS | `tests/e2e/projection-scene.e2e.ts`::state(), readout, commits ≤ 12/s, freshness · `tests/projection/projector.test.ts` (AC 17 freshness) · `src/sim/systems/flight.test.ts`::flight telemetry (AC 17 inputs) | |
| 18 A4: engines lit `32 of 33`, σ up, margin down, p updates | PASS | `src/sim/systems/flight.test.ts`::in ascent: 32 of 33 lit … σ up, landing margin down; in boostback: 12 of 13 … · `src/sim/systems/anomalies.test.ts`::director boostback engine-out: 12 of 13, catch p drops · `src/ui/hud/panels.test.ts` (`ENGINE OUT · 32 OF 33`) · `tests/projection/decision.test.ts`::D3 catch | Display chain covered by unit / projection tests only; no browser run with an A4 seed |
| 19 Catch strip timing, GO FOR CATCH / DIVERT, auto policy | PASS | `src/sim/systems/flight.test.ts`::asks for the catch decision at boostback start …, auto policy without input (AC 19) · `tests/e2e/hud-run.scene.e2e.ts` (CATCH and DIVERT from the strip) · `tests/e2e/autopilot-run.scene.e2e.ts` | AC text says `autoCatchThreshold` = 0.65; data is **0.70** since balancing pass 1 (BALANCING §13.5) — GDD wording stale (defect 5) |
| 20 One seeded roll; caught / failed (TOWER-1 DAMAGED) / divert (offshore, lost) | PASS | `src/sim/systems/flight.test.ts`::is one roll on the seeded catch stream …, a failed catch loses the booster and damages TOWER-1, DIVERT flies to the offshore point and loses the booster · `tests/e2e/hud-run.scene.e2e.ts`::DIVERT on the D3 strip ends DIVERTED · `tests/e2e/fx.e2e.ts` (recovery rings) | |
| 21 SECO + contract fulfilled even when diverted / lost | PASS | `src/sim/systems/economy.test.ts`::DIVERT: booster lost (replacement), contract still fulfilled (AC 21) · golden log · `tests/e2e/hud-run.scene.e2e.ts`::DIVERT … (ledger CONTRACT PRICE) | |
| 22 Safing duration, debrief contents | PASS | `src/sim/systems/countdown.test.ts`::reaches Debrief exactly the safing duration after entering Safing · `src/sim/systems/economy.test.ts`::nominal flight, caught (AC 21–22) · `src/ui/hud/panels.test.ts`::debrief · `tests/e2e/hud-panels.e2e.ts`::debrief … per outcome · full-run e2e | |
| 23 Time rates, caps, one-shot drops, never auto-raised | PASS | `src/app/time/rules.test.ts` (incl. time rules through the loop (AC 23 scripted)) · `src/app/loop.test.ts` · `src/ui/hud/frame/frame.test.ts`::rate control logic (§6.25) · `tests/e2e/autopilot-run.scene.e2e.ts` | Browser run covers PAUSE / 1× / 10× / 100× / SKIP, the T-00:03:00 → Safing + 30 s cap and the D2 drop; NO-GO and GO_POSSIBLE drops are unit-level only |
| 24 All HUD panels live off the projection | PASS | `tests/e2e/projection-scene.e2e.ts` · `tests/e2e/hud-world.e2e.ts` · `src/ui/hud/panels.test.ts` · `src/ui/hud/timeline/timeline.test.ts` · `tests/e2e/autopilot-run.scene.e2e.ts` (inventory) | Altitude scale now shows in flight: the booster is auto-followed from liftoff (defect 1 fixed) |
| 25 Click / Space selects (camera still); double-click / Enter / F follows; auto-follow from liftoff unless following something else | PASS | `tests/e2e/hud-world.e2e.ts` (label click → selected, double-click → follow) · `src/render/systems/CameraRig.test.ts` · `tests/e2e/hud-run.scene.e2e.ts` (follow = B-09 from liftoff) | AC reworded in 7.5 (GDD §14.1 call 1); `followLaunch` ignores a plain selection (`app: liftoff follow ignores a plain selection`) |
| 26 Background logistics always visible | PASS (wind-hold exception) | `tests/sim/ac26-background.test.ts` (seeds 42 / 1 / 99, standard + no-input) · `src/sim/systems/ambient.test.ts` · `src/sim/systems/range.test.ts`::PICKET patrols · `tests/projection/wind-hold.test.ts` (held transporter reads `WIND HOLD · GUST … M/S` on label, row and inspector) | Ambient SP-42 shuttle (7.3). Nothing moves only during transporter wind holds with no tanker on the road (seed 42: 281 s, seed 1: 1 157 s); exception accepted (7.5), cause shown with the gust value (7.5b) |
| 27 §10 keep/add widgets present, cut ones absent; every decision reachable from the HUD | PASS | `tests/e2e/hud-run.scene.e2e.ts` (both tests: D1 D2 D3B D3 from clicks) · `tests/e2e/autopilot-run.scene.e2e.ts` (inventory: breadcrumb, UTC, SIM readout, RANGE badge, alerts, role label, no avatar, flight card STATIONS GO, 5 tabs, timeline + window marks, strip, rate + SKIP, map controls, compass) | Search stub (§10 verdict FLAG, DESIGN_SYSTEM §6.3 "MVP stub") not built (defect 6); not a keep/add row |
| 28 One enabled count button per command; no station chip HOLD | PASS | `src/ui/hud/frame/frame.test.ts`::countdown header (§6.17, AC 28) · `src/ui/hud/decision/decision.test.ts`::open: station table, no count buttons (AC 28) · `src/sim/systems/range.test.ts`::live run: … only GO/MARGINAL/NO_GO values | Probe on `/play`: counting → `HOLD` (time slot) only; load-poll hold → `GO`, `SCRUB` (strip) only |
| 29 A3 unanswered → DEGRADED by AUTO; one-shot `ALREADY_RESPONDED` | PASS | `src/sim/systems/anomalies.test.ts`::deadline = onset + decisionTimeoutS; unanswered → DEGRADED by AUTO … (AC 29), one-shot … ALREADY_RESPONDED · `tests/sim/save.test.ts` | |
| 30 Strip priority D3 > D3b > D2 > D1, others queued | PASS | `src/ui/hud/decision/decision.test.ts`::queued chip … (AC 30) · `tests/projection/decision.test.ts`::D2 previews … (AC 30, 31), D3b previews … outranking D2 / D1 | |
| 31 Option previews per §13.2.2, EV on D3 only | PASS | `tests/projection/decision.test.ts` (D1, D2, D3, D3b fixtures) · `src/ui/hud/decision/decision.test.ts`::decision strip render | |
| 32 Debrief REPLAY / NEW SEED / EXPORT LOG / VIEW SITE | PASS | `src/app/session/session.test.ts` (3 tests) · `tests/e2e/hud-panels.e2e.ts`::debrief … four exit actions · `tests/e2e/autopilot-run.scene.e2e.ts` (VIEW SITE closes the sheet, paused, `RUN ENDED`) | REPLAY / NEW SEED / EXPORT LOG are exercised through the session controller, not clicked in a browser |
| 33 Decision log: every D1, D2 (incl. auto-GO / auto-scrub), D3, D3b, tagged | PASS | `src/sim/systems/economy.test.ts`::GO at a poll logs … auto polls are logged as AUTO, records accepted player commands only … · `src/sim/systems/flight.test.ts` (AUTO / FORCED commits) · full-run e2e (codes D1 ×4, D2 ×3, D3B, D3) · `src/app/sim-host/inline.test.ts`::autopilot commands carry source DIRECTOR · `tests/e2e/autopilot-run.scene.e2e.ts` (no PLAYER entry, D1 ×4 DIRECTOR) · golden log (DIRECTOR lines) | `DIRECTOR` tag done (7.5b, defect 4) |

**Summary** (updated after 7.5 / 7.5b): 33 PASS (26 with the wind-hold exception, AC 25 as reworded in 7.5) · 0 PARTIAL · 0 FAIL · 0 NOT COVERED. After 7.3 it was 32 PASS · 1 PARTIAL (25). First pass was 30 PASS · 2 PARTIAL (24, 25) · 1 IN PROGRESS (26).

**Defects found** (most severe first; none fixed here — `src/ui`, `src/sim`, `src/app` untouched):

1. **FIXED (`app: camera follows the booster at liftoff`) — Medium — no auto-follow in flight (AC 25, knocks on AC 24).** With nothing selected, `view.followId` stays `null` through liftoff and ascent (probe, seed 42 autopilot, T+00:00:00 and T+00:01:40); nothing in `src/app` or `src/render` sets a follow on `PhaseChanged → Liftoff`. Effect: the camera stays on the home view while the booster leaves the screen, and the altitude scale (shown only for the followed entity) never appears unless the player follows B-09. Fix (app side, `Game` / projector): on liftoff, `view.follow(booster)` unless the player's selection is another entity; drop it on Debrief. Owner: *three-graphics-engineer* / *systems-architect*.
2. **DECIDED in 7.5 (GDD §14.1 call 1): AC 25 reworded to click = select, double-click / Enter / F = follow; one app change left — `followLaunch` must ignore a plain selection.** Was: **OPEN (game-designer, 7.5) — Low — click selects, does not follow (AC 25 wording).** List row and label single click = select (orange); follow = double-click / `F` / inspector (`tests/e2e/hud-world.e2e.ts` encodes this). Either the AC or the interaction changes — *game-designer* / *ui-design-system* call.
3. **FIXED (`ui: top-bar badges name their button`) — Low — top-bar badges have no content-derived accessible name.** `src/ui/components/Badge.tsx:38–53` puts the text in an `<output>`; Chromium does not name the `<button>` from it, so the RANGE badge is announced by its tooltip (`PROPELLANT · LOX 0.52 H RESERVE`) and the alert counter has no name at all. Fix: `aria-label` = `${label} ${value}${note}` on the button, tooltip as `aria-description`. Owner: *ui-design-system*.
4. **FIXED (`sim: DIRECTOR decision-log tag for scripted director commands (AC 33)`, 7.5b).** Decided in 7.5 (GDD §13.2.1, AC 33): new `DIRECTOR` tag. Was: **OPEN (game-designer, 7.5) — Low — director decisions logged as PLAYER.** `src/sim/systems/economy.ts:155` tags every accepted command PLAYER and the host feeds autopilot commands as ordinary inputs, so an `?autopilot=1` debrief shows the director's calls as the player's. AC 33 only knows PLAYER / AUTO / FORCED; *game-designer* to decide (a `DIRECTOR` tag, or AUTO).
5. **FIXED (`docs: GDD auto-catch threshold is 0.70`) — Low (doc) — GDD AC 19 says `autoCatchThreshold` = 0.65**; `src/data/catch.ts` has 0.70 since balancing pass 1 (BALANCING §13.5). Update the AC text. Owner: *game-designer*.
6. **FIXED in 8.2 (see "Phase 8 accessibility & keyboard audit") — Low — top-bar search stub not built** (GDD §10 verdict FLAG; DESIGN_SYSTEM §6.3 calls it an "MVP stub: filters the tabbed panel", and the DESIGN_SYSTEM top-bar (6.3) as-built note records it as not built). Owner: *ui-design-system*, or drop it from the MVP list.

**Test notes**: `__fuelx.step` advances the host directly, so the time rules (`TimeControl.afterTick`: drops, skip arrival) only see ticks run by the loop. The autopilot spec therefore checks drops and skips with the loop running and uses `step` only while paused. A SKIP to a poll stops on the T-clock mark, one tick before `PollOpened`, so from paused the D2 drop fires on the next loop tick, not during the skip.

## Known flaky areas

- ~~`tests/e2e/scene.e2e.ts` › "debug hooks: step, time scale, save/load round trip" timed out when the whole suite ran in parallel under SwiftShader~~ — **fixed in 5.9**: the game-scene specs (`scene`, `anim`, `fx`, `world`) run in the `scene` Playwright project with `workers: 1` (two software-GL scenes at once starved each other on 4 vCPU); smoke/showcase run beside them in `e2e`. Full suite 9.0 min (same as before); "debug hooks" 30.6 s → 17.7 s. Two consecutive full `npm run e2e` runs green (2026-10-19).
- Any new spec that boots `/play` with full visuals belongs in `SCENE_SPECS` (`playwright.config.ts`).
