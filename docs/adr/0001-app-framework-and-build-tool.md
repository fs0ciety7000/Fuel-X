# ADR 0001 — App framework & build tool: Vite SPA + React + TypeScript

- **Status**: Accepted (Gate 1); amended in Phase 2 (boundary enforcement, see below)
- **Date**: 2026-10-18
- **Owner**: systems-architect
- **Related**: ADR 0002 (renderer), ADR 0004 (UI binding), ADR 0008 (deployment), `docs/ARCHITECTURE.md` §Repo layout, §Scripts

## Context
Fuel-X is a **client-only, real-time 3D game**: no accounts, no server data, no SEO surface, no
per-request rendering. All state lives in a deterministic simulation in the browser; saves live
in the browser (IndexedDB / exported file). The target is desktop browsers served from static
hosting. The draft stack proposed **Next.js App Router**. The HUD is a dense control-room UI
(many small components, tabs, lists) that benefits from a component model; the 3D scene must
not be driven by component re-renders.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| **Next.js 16 (App Router)** | Popular, routing, image/font helpers | SSR/RSC are dead weight for a canvas game: every 3D/HUD module must be `"use client"`; `window`/WebGL access needs dynamic imports with `ssr:false`; server runtime or `output: export` constraints; heavier dev server and build; App Router caching/streaming semantics irrelevant; harder to reason about bundle splits for workers. |
| **Vite 8 SPA + React 19** | Instant dev server + HMR, first-class Web Worker / `?url` / multi-page support, plain static `dist/`, shares config with Vitest, Rolldown production builds | No built-in routing (we need ~2 pages only) |
| Vite + Svelte / Solid | Fine-grained reactivity, smaller runtime | R3F ecosystem is React-only (ADR 0002); team agents & skills assume React/TSX; less reuse of three.js community examples |
| No UI framework (vanilla TS + lit-html) | Smallest bundle | HUD has ~20 component types with tabs/lists/selection; we would re-invent a component model |

## Decision
**Vite SPA + React 19 + TypeScript (strict)**. No meta-framework, no SSR, no router library.

- Two HTML entries (Vite multi-page): `index.html` (game) and `design.html` (the `/design`
  token & component gallery required by DESIGN_SYSTEM; built and served like the game so
  `visual-check` can screenshot it from `preview`). No Storybook (second build system, ~MBs of deps).
- TypeScript **6.0.3**, not 7.x: typescript-eslint 8.x supports `typescript <6.1`; the native TS 7
  compiler is revisited when the lint stack supports it.
- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`.
  Path aliases: `@sim/*`, `@render/*`, `@ui/*`, `@bridge/*`, `@app/*`, `@data/*`, `@tokens/*`.
- **Module boundaries enforced by lint** (eslint-plugin-boundaries + `no-restricted-imports` /
  `no-restricted-properties`), see ARCHITECTURE.md §Boundary rules. `src/sim` additionally bans
  `Math.random`, `Date.now`, `performance.now`, `setTimeout`, `window`, `document`.
- Prettier formats; ESLint lints; no other code style tooling.

## Consequences
- Positive: zero server; `dist/` deploys anywhere (ADR 0008); fastest feedback loop; Vitest reuses
  Vite config; workers are a one-line import if the sim moves off-thread (ADR 0003).
- Negative: we own two tiny pieces Next would give (multi-page entries, `<head>` tags). Accepted.
- Follow-ups: Phase 2 scaffold creates `vite.config.ts`, `tsconfig.json` (+ `tsconfig.node.json`
  for `scripts/`), `eslint.config.js`, `.prettierrc`. Revisit if a server ever becomes necessary
  (multiplayer, cloud saves) — that would be a separate service, not a framework switch.

## Dependencies introduced
| Package | Exact version | One-line justification |
|---|---|---|
| `vite` | 8.3.1 | Dev server, HMR, multi-page + worker bundling, static build |
| `@vitejs/plugin-react` | 6.1.1 | JSX transform + React Fast Refresh for Vite 8 |
| `react`, `react-dom` | 19.3.0 | HUD component model; required by R3F 9 (peer `>=19 <19.4`) |
| `@types/react`, `@types/react-dom` | 19.3.0 | Types |
| `typescript` | 6.0.3 | Type system; highest version supported by typescript-eslint 8 |
| `@types/node` | 22.20.4 | Types for `scripts/` (Node 22 runtime) |
| `eslint` | 10.11.0 | Linting |
| `@eslint/js` | 10.0.1 | Base recommended rules |
| `typescript-eslint` | 8.70.1 | TS-aware lint rules |
| `eslint-plugin-react-hooks` | 7.1.1 | Hooks correctness (stale closures in frame loops are a classic R3F bug) |
| `prettier` | 3.9.9 | Formatting |
| `tsx` | 4.23.15 | Runs TS build scripts (`scripts/**`) under Node without a compile step |

## Amendment (Phase 2)
`eslint-plugin-boundaries` 7.x does not resolve TS path aliases without an extra import resolver, so
aliased imports (`@sim/*`) would silently pass. The boundary matrix is enforced instead with
typescript-eslint's `no-restricted-imports` (patterns match aliases **and** relative paths, and
`allowTypeImports` expresses "type-only from sim"), plus `no-restricted-properties` /
`no-restricted-globals` for sim purity. `tests/scaffold/boundaries.test.ts` proves the rules fire.
One dependency fewer. Fonts are self-hosted through `@fontsource/jetbrains-mono` and
`@fontsource/inter-tight` 5.3.0 (Latin subsets bundled by Vite) instead of hand-copied WOFF2.
