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

## Known flaky areas

- `tests/e2e/scene.e2e.ts` › "debug hooks: step, time scale, save/load round trip" can time out when the whole e2e suite runs in parallel under SwiftShader (~1 fps); it passes alone (~1.7 min).


None yet.
