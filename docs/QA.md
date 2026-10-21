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

## Simulation tests

| Suite | Guards |
|---|---|
| `src/sim/**/*.test.ts` | Unit + table-driven FSM tests per system (countdown, prep, logistics, propellant, flight, environment, range, anomalies, economy, scenario/autopilot) |
| `tests/golden/full-launch.test.ts` | Seed-42 full launch with the standard autopilot vs `tests/golden/__files__/full-launch.seed42.log` (one line per event, telemetry every 5 min / 5 s in flight, debrief summary). AC 1, 16, 19–22 |
| `tests/sim/equivalence.test.ts` | Save → load at T-01:50 and in boostback ≡ straight run; replay of the command log ≡ recorded event log + hash; uneven step batches ≡ step-by-step |
| `tests/sim/properties.test.ts` | 200 fast-check cases (6 snapshots × random seeds × random commands, 100 s each): no negative propellant, tanks within capacity, mass conserved before liftoff, no NaN, phases monotonic except RECYCLE |
| `scripts/sim/anomaly-sweep.ts` (manual) | AC 3: 200 full runs, policies `none` and `hands-off`; ≥ 1 anomaly in every run, distribution within ±10 points of the director weights; AC 3c hands-off divert share 15–25 %, none at p ≥ `autoCatchThreshold`. Results below |

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
| 3 Anomaly coverage (sweep) | PASS | `scripts/sim/anomaly-sweep.ts` (manual, 200 seeds × 2 policies) · `src/sim/systems/anomalies.test.ts`::director plan (AC 3) | Re-run 2026-10-21: hands-off 200/200, A1–A4 within ±3.3 pts, diverted 15.5 % (none at p ≥ 0.70), 11 failed catches, 7 scrubs; none 200/200 scrubbed with A1 fallback. Not in `npm run test` (6.5 min) |
| 4 Rollout CR-77 → SP-41 → OLM-1, time = path / speed ± 1 tick | PASS | `src/sim/systems/prep.test.ts`::rollout (AC 4) (2 tests) · `tests/e2e/hud-run.scene.e2e.ts` (START ROLLOUT from the Tasks tab) | Visible path: `tests/e2e/anim.e2e.ts` rollout screen |
| 5 Stack with TOWER-1 arms, STACKED, timeline, durations ± 1 tick | PASS | `src/sim/systems/prep.test.ts`::stack (AC 5) (4 tests) · `tests/e2e/hud-run.scene.e2e.ts` (STACK button) | |
| 6 Wind pauses / resumes stacking and transporter | PASS | `src/sim/systems/prep.test.ts`::wind limits (AC 6) (3 tests, forced series) | |
| 7 Delivery: charge, tanker type, lead time, offload rate, farm += delivered − boil-off | PASS | `src/sim/systems/logistics.test.ts`::OrderDelivery (AC 7) (3 tests) · `tests/e2e/hud-run.scene.e2e.ts` (4 orders from the Tasks tab) | |
| 8 No tanker in the hazard radius from T-00:40:00, GATE_WAIT | PASS | `src/sim/systems/logistics.test.ts`::road closure and GATE_WAIT (AC 8) (3 tests) | "visible" = label status `GATE WAIT` (projection), not asserted in a browser |
| 9 Farm boil-off, rate-independent | PASS | `src/sim/systems/propellant.test.ts`::farm boil-off (AC 9) (2 tests) · `tests/sim/equivalence.test.ts` (uneven step batches) | |
| 10 Five stations GO / MARGINAL / NO-GO + driving value | PASS | `src/sim/systems/range.test.ts` (WEATHER, PROPELLANT, VEHICLE, crew vans, station bookkeeping) · `src/ui/hud/decision/decision.test.ts`::poll panel (§6.24) · `tests/e2e/projection-scene.e2e.ts` (5 stations projected) | RANGE shows `—` as its value while clear (no intruder) |
| 11 Polls at T-01:20 / T-00:10 / T-00:00:40, no pass without GO / auto-GO | PASS | `src/sim/systems/countdown.test.ts`::polls (5 tests) · `src/sim/systems/range.test.ts`::a NO-GO in PropellantLoad auto-holds the count (AC 10–11) · all three full-run e2e (3 D2 entries) | |
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
| 25 Click row / label → select, orange, camera follows; auto-follow in flight | PARTIAL | `tests/e2e/hud-world.e2e.ts` (label click → selected, double-click follow) · `src/render/systems/CameraRig.test.ts` · `tests/e2e/hud-run.scene.e2e.ts` (follow = B-09 from liftoff) | Auto-follow in flight fixed (defect 1). Open: single click selects only (defect 2, AC vs DESIGN_SYSTEM §6.17 wording — *game-designer* call, 7.5) |
| 26 Background logistics always visible | PASS (wind-hold exception) | `tests/sim/ac26-background.test.ts` (seeds 42 / 1 / 99, standard + no-input) · `src/sim/systems/ambient.test.ts` · `src/sim/systems/range.test.ts`::PICKET patrols | Ambient SP-42 shuttle (7.3). Nothing moves only during transporter wind holds with no tanker on the road (seed 42: 281 s, seed 1: 1 157 s) — *game-designer* to confirm the exception (7.5) |
| 27 §10 keep/add widgets present, cut ones absent; every decision reachable from the HUD | PASS | `tests/e2e/hud-run.scene.e2e.ts` (both tests: D1 D2 D3B D3 from clicks) · `tests/e2e/autopilot-run.scene.e2e.ts` (inventory: breadcrumb, UTC, SIM readout, RANGE badge, alerts, role label, no avatar, flight card STATIONS GO, 5 tabs, timeline + window marks, strip, rate + SKIP, map controls, compass) | Search stub (§10 verdict FLAG, DESIGN_SYSTEM §6.3 "MVP stub") not built (defect 6); not a keep/add row |
| 28 One enabled count button per command; no station chip HOLD | PASS | `src/ui/hud/frame/frame.test.ts`::countdown header (§6.17, AC 28) · `src/ui/hud/decision/decision.test.ts`::open: station table, no count buttons (AC 28) · `src/sim/systems/range.test.ts`::live run: … only GO/MARGINAL/NO_GO values | Probe on `/play`: counting → `HOLD` (time slot) only; load-poll hold → `GO`, `SCRUB` (strip) only |
| 29 A3 unanswered → DEGRADED by AUTO; one-shot `ALREADY_RESPONDED` | PASS | `src/sim/systems/anomalies.test.ts`::deadline = onset + decisionTimeoutS; unanswered → DEGRADED by AUTO … (AC 29), one-shot … ALREADY_RESPONDED · `tests/sim/save.test.ts` | |
| 30 Strip priority D3 > D3b > D2 > D1, others queued | PASS | `src/ui/hud/decision/decision.test.ts`::queued chip … (AC 30) · `tests/projection/decision.test.ts`::D2 previews … (AC 30, 31), D3b previews … outranking D2 / D1 | |
| 31 Option previews per §13.2.2, EV on D3 only | PASS | `tests/projection/decision.test.ts` (D1, D2, D3, D3b fixtures) · `src/ui/hud/decision/decision.test.ts`::decision strip render | |
| 32 Debrief REPLAY / NEW SEED / EXPORT LOG / VIEW SITE | PASS | `src/app/session/session.test.ts` (3 tests) · `tests/e2e/hud-panels.e2e.ts`::debrief … four exit actions · `tests/e2e/autopilot-run.scene.e2e.ts` (VIEW SITE closes the sheet, paused, `RUN ENDED`) | REPLAY / NEW SEED / EXPORT LOG are exercised through the session controller, not clicked in a browser |
| 33 Decision log: every D1, D2 (incl. auto-GO / auto-scrub), D3, D3b, tagged | PASS | `src/sim/systems/economy.test.ts`::GO at a poll logs … auto polls are logged as AUTO, records accepted player commands only … · `src/sim/systems/flight.test.ts` (AUTO / FORCED commits) · full-run e2e (codes D1 ×4, D2 ×3, D3B, D3) | Director commands under `?autopilot=1` are tagged PLAYER (defect 4) |

**Summary** (updated after the 7.3 / defect fixes): 32 PASS (26 with the wind-hold exception) · 1 PARTIAL (25: click = select only) · 0 FAIL · 0 NOT COVERED. First pass was 30 PASS · 2 PARTIAL (24, 25) · 1 IN PROGRESS (26).

**Defects found** (most severe first; none fixed here — `src/ui`, `src/sim`, `src/app` untouched):

1. **FIXED (`app: camera follows the booster at liftoff`) — Medium — no auto-follow in flight (AC 25, knocks on AC 24).** With nothing selected, `view.followId` stays `null` through liftoff and ascent (probe, seed 42 autopilot, T+00:00:00 and T+00:01:40); nothing in `src/app` or `src/render` sets a follow on `PhaseChanged → Liftoff`. Effect: the camera stays on the home view while the booster leaves the screen, and the altitude scale (shown only for the followed entity) never appears unless the player follows B-09. Fix (app side, `Game` / projector): on liftoff, `view.follow(booster)` unless the player's selection is another entity; drop it on Debrief. Owner: *three-graphics-engineer* / *systems-architect*.
2. **DECIDED in 7.5 (GDD §14.1 call 1): AC 25 reworded to click = select, double-click / Enter / F = follow; one app change left — `followLaunch` must ignore a plain selection.** Was: **OPEN (game-designer, 7.5) — Low — click selects, does not follow (AC 25 wording).** List row and label single click = select (orange); follow = double-click / `F` / inspector (`tests/e2e/hud-world.e2e.ts` encodes this). Either the AC or the interaction changes — *game-designer* / *ui-design-system* call.
3. **FIXED (`ui: top-bar badges name their button`) — Low — top-bar badges have no content-derived accessible name.** `src/ui/components/Badge.tsx:38–53` puts the text in an `<output>`; Chromium does not name the `<button>` from it, so the RANGE badge is announced by its tooltip (`PROPELLANT · LOX 0.52 H RESERVE`) and the alert counter has no name at all. Fix: `aria-label` = `${label} ${value}${note}` on the button, tooltip as `aria-description`. Owner: *ui-design-system*.
4. **DECIDED in 7.5 (GDD §13.2.1, AC 33): new `DIRECTOR` tag; implementation open (systems-architect + simulation-engineer).** Was: **OPEN (game-designer, 7.5) — Low — director decisions logged as PLAYER.** `src/sim/systems/economy.ts:155` tags every accepted command PLAYER and the host feeds autopilot commands as ordinary inputs, so an `?autopilot=1` debrief shows the director's calls as the player's. AC 33 only knows PLAYER / AUTO / FORCED; *game-designer* to decide (a `DIRECTOR` tag, or AUTO).
5. **FIXED (`docs: GDD auto-catch threshold is 0.70`) — Low (doc) — GDD AC 19 says `autoCatchThreshold` = 0.65**; `src/data/catch.ts` has 0.70 since balancing pass 1 (BALANCING §13.5). Update the AC text. Owner: *game-designer*.
6. **Low — top-bar search stub not built** (GDD §10 verdict FLAG; DESIGN_SYSTEM §6.3 calls it an "MVP stub: filters the tabbed panel", and the DESIGN_SYSTEM top-bar (6.3) as-built note records it as not built). Owner: *ui-design-system*, or drop it from the MVP list.

**Test notes**: `__fuelx.step` advances the host directly, so the time rules (`TimeControl.afterTick`: drops, skip arrival) only see ticks run by the loop. The autopilot spec therefore checks drops and skips with the loop running and uses `step` only while paused. A SKIP to a poll stops on the T-clock mark, one tick before `PollOpened`, so from paused the D2 drop fires on the next loop tick, not during the skip.

## Known flaky areas

- ~~`tests/e2e/scene.e2e.ts` › "debug hooks: step, time scale, save/load round trip" timed out when the whole suite ran in parallel under SwiftShader~~ — **fixed in 5.9**: the game-scene specs (`scene`, `anim`, `fx`, `world`) run in the `scene` Playwright project with `workers: 1` (two software-GL scenes at once starved each other on 4 vCPU); smoke/showcase run beside them in `e2e`. Full suite 9.0 min (same as before); "debug hooks" 30.6 s → 17.7 s. Two consecutive full `npm run e2e` runs green (2026-10-19).
- Any new spec that boots `/play` with full visuals belongs in `SCENE_SPECS` (`playwright.config.ts`).
