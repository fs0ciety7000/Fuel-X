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
| `tests/e2e/smoke.e2e.ts` | Game + design entries boot without page errors on the paper substrate |

## Simulation tests

| Suite | Guards |
|---|---|
| `src/sim/**/*.test.ts` | Unit + table-driven FSM tests per system (countdown, prep, logistics, propellant, flight, environment, range, anomalies, economy, scenario/autopilot) |
| `tests/golden/full-launch.test.ts` | Seed-42 full launch with the standard autopilot vs `tests/golden/__files__/full-launch.seed42.log` (one line per event, telemetry every 5 min / 5 s in flight, debrief summary). AC 1, 16, 19–22 |
| `tests/sim/equivalence.test.ts` | Save → load at T-01:50 and in boostback ≡ straight run; replay of the command log ≡ recorded event log + hash; uneven step batches ≡ step-by-step |
| `tests/sim/properties.test.ts` | 200 fast-check cases (6 snapshots × random seeds × random commands, 100 s each): no negative propellant, tanks within capacity, mass conserved before liftoff, no NaN, phases monotonic except RECYCLE |
| `scripts/sim/anomaly-sweep.ts` (manual) | AC 3: 200 full runs, policies `none` and `hands-off`; ≥ 1 anomaly in every run, distribution within ±10 points of the director weights. Results below |

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

### AC 3 anomaly sweep (2026-10-18, `npx tsx scripts/sim/anomaly-sweep.ts 200`, 195 s on 4 cores)

| Policy | Runs with ≥ 1 anomaly | Anomalies / run | A1 | A2 | A3 | A4 | Outcomes |
|---|---|---|---|---|---|---|---|
| `hands-off` (standard prep + orders + GO, no anomaly/catch decisions) | **200 / 200** | 1.37 | 33.6 % (+3.6) | 22.3 % (−2.7) | 20.4 % (+0.4) | 23.7 % (−1.3) | 105 caught, 82 diverted (auto policy p < 0.90), 1 catch failed, 12 scrubbed |
| `none` (no input at all) | **200 / 200** | 1.00 | 100 % | — | — | — | 200 scrubbed (count frozen at the load poll; director fallback 30 min before window close, only A1 eligible) |

Weights 30 / 25 / 20 / 25 %; tolerance ±10 points (hands-off policy, where every anomaly is reachable).

## Known flaky areas

None yet.
