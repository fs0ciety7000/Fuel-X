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

## Visual baselines

Phase 2 reference screenshots (manual, not baselines yet): `docs/screens/phase2-game.png`, `docs/screens/phase2-design.png`. Baselines (`*.visual.ts`) start in Phase 5 once `window.__fuelx` exists; mask the noise overlay and clocks. Full-page screenshots show the fixed noise overlay only on the first viewport — expected.

## Latest numbers

| Date | Metric | Budget | Measured |
|---|---|---|---|
| 2026-10-18 (Phase 2, empty app) | Initial JS gzip | 450 KB | 66.7 KB |
| | CSS gzip | 25 KB | 2.7 KB |
| | Fonts (WOFF2) | 150 KB | 85.1 KB |
| | GLB payload | 4 MB | 0 |

## Known flaky areas

None yet.
