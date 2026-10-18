# ADR 0006 — Testing: Vitest (unit, sim, golden, property, bench) + Playwright (e2e, visual, perf scenes)

- **Status**: Proposed (Gate 1)
- **Date**: 2026-10-18
- **Owner**: systems-architect (consulted: qa-perf, simulation-engineer)
- **Related**: skills `sim-testing`, `visual-check`, `perf-audit`; `docs/QA.md`; `docs/ARCHITECTURE.md` §Debug hooks

## Context
Required test kinds: unit; table-driven FSM tests; a **golden full-launch telemetry log**;
save/load and time-scale equivalence; optional property tests; screenshot baselines of the
HUD + scene at deterministic states; frame-time/draw-call audits on production builds; sim
benchmarks. Chromium is preinstalled at `/opt/pw-browsers` (**revision 1194**) and must never be
downloaded (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`).

## Options considered
| Option | Pros | Cons |
|---|---|---|
| **Vitest** | Shares Vite config/aliases; fast; `toMatchFileSnapshot` for goldens; built-in `bench` | — |
| Jest | Familiar | Separate transform config for TS/ESM/Vite aliases; slower |
| **Playwright** (`@playwright/test`) | Screenshot comparison with masks, traces, multi-viewport, WebGL in headless via SwiftShader | Browser revision is tied to the package version |
| Cypress | DX | Weaker WebGL/screenshot story, heavier |
| Storybook + Chromatic | Component visuals | SaaS, second build; our `/design` page covers it |

## Decision
- **Vitest 5.0.1**, environment `node` by default (sim, projection, tokens, asset scripts). UI component tests are rare and use `happy-dom` only if a real need appears (not installed now).
  - `src/**/*.test.ts` colocated unit/FSM tests.
  - `tests/golden/full-launch.test.ts` → `tests/golden/__files__/full-launch.seed42.log` via `toMatchFileSnapshot` (text, values rounded to fixed precision, one line per sampled tick/event).
  - `tests/sim/` equivalence suites: save/load (K+M ≡ K→save→load→M, compared by canonical JSON hash), time scale (100× ≡ 1× same ticks), replay (seed + command log ≡ recorded world hash).
  - Property tests with **fast-check 4.10.2** (invariants: no negative propellant, mass conserved in transfers, no NaN, phase monotonicity except recycle).
  - `tests/perf/sim.bench.ts` run by `npm run perf` (`vitest bench --run`): µs/tick for the MVP scenario and a 2 000-entity stress world.
  - Coverage via `@vitest/coverage-v8` 5.0.1, threshold enforced on `src/sim/**` only (≥ 90 % lines).
- **Playwright `@playwright/test` 1.56.1** — pinned to the version whose Chromium revision (1194) is preinstalled; upgrading Playwright requires upgrading the preinstalled browser in the same change. Projects:
  - `e2e` — smoke flows (boot, select row → camera follows, pause/time scale, save/load round trip).
  - `visual` — `toHaveScreenshot` at 1920×1080 and 1280×720 against `vite preview`, states reached via `window.__fuelx` (seed, jumpTo, follow, site, pause, `freezeVisuals`), masks for the noise overlay and wall clock; `maxDiffPixelRatio: 0.002`. Chromium launched with `--use-angle=swiftshader --enable-unsafe-swiftshader` for bit-stable GL.
  - `perf` — production build, reference scenes, samples `__fuelx.stats()` + rAF deltas, writes `test-results/perf.json` (indicative numbers in headless; trend-compared).
- No Jest, no Cypress, no Storybook.

## Consequences
- Positive: one runner config family; sim tests run in < 10 s headless; visual tests reach exact states with no sleeps.
- Negative: Playwright stays a year behind latest until the environment's browser is refreshed (tracked as an open question).
- Follow-ups: qa-perf writes `playwright.config.ts` and `docs/QA.md`; golden update procedure per `sim-testing` skill.

## Dependencies introduced
| Package | Exact version | One-line justification |
|---|---|---|
| `vitest` | 5.0.1 | Unit/sim/golden/bench runner sharing Vite config (peer `vite ^8`) |
| `@vitest/coverage-v8` | 5.0.1 | Coverage gate on the sim |
| `fast-check` | 4.10.2 | Property-based invariant tests for the sim |
| `@playwright/test` | 1.56.1 | E2E + screenshot baselines + perf scenes; matches preinstalled Chromium r1194 |
