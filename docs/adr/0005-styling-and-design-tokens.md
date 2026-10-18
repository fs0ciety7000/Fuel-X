# ADR 0005 — Styling: CSS Modules + generated CSS custom properties, Stylelint-enforced brutalist rules

- **Status**: Accepted (Gate 1)
- **Date**: 2026-10-18
- **Owner**: systems-architect (consulted: ui-design-system)
- **Related**: `docs/DESIGN_SYSTEM.md` (token values, authoritative), skills `design-tokens`, `industrial-brutalist-ui`; `docs/ARCHITECTURE.md` §Token pipeline

## Context
The HUD follows Industrial Brutalism / Swiss Industrial Print (light): radius 0, no shadows, no
gradients, no translucency, one accent, monospace tabular data, `grid; gap:1px` rules. The same
token values must reach **CSS**, **TS render code** (three materials, fog, background, particles)
and **Blender** (shared `MAT_*` materials). Enforcement must be mechanical, not review-based.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| **CSS Modules + CSS variables generated from one TS token file** | Zero runtime; Vite-native; plain CSS is the best language for grids/`gap:1px`/`font-variant-numeric`; Stylelint can ban properties/values exactly; tokens are role-named vars | Class names not type-checked (acceptable; `.module.css` typings optional) |
| Tailwind 4 (draft) | Fast authoring | Utility vocabulary *invites* `rounded-*`, `shadow-*`, `bg-gradient-*`, `/50` opacity — must be disabled in theme and policed via class-string linting (weaker than property linting); long class strings for dense compartments; a second token source (`@theme`) to keep in sync with TS/Blender |
| vanilla-extract | Type-safe tokens in TS, zero runtime | Extra build plugin; styles in TS objects are clumsier for grid-heavy layout; enforcement of banned properties still needs custom lint |
| CSS-in-JS runtime (styled-components/emotion) | Co-location | Runtime cost on a perf-budgeted page; SSR-oriented ecosystem we don't need |

## Decision
- **Source of truth**: `src/tokens/tokens.ts` — a typed `as const` object following DESIGN_SYSTEM naming (`tokens.<group>.<role>`, camelCase, role-named: color, ink ramp, space, type, rule, motion, `world.*` 3D tokens, `radius: 0`). Values come from DESIGN_SYSTEM.md. It lives in a top-level `src/tokens/` (not `src/ui/`) because render code and Blender consume it too and render must not import UI.
- **Generator** `scripts/tokens/build.ts` (run by `npm run tokens`, and as part of `dev`/`build`/`lint --check`) emits, committed to git:
  - `src/tokens/generated/tokens.css` — `:root { --fx-color-paper: #F4F4F0; … }` (CSS names `--fx-<group>-<role>` per DESIGN_SYSTEM; sRGB hex).
  - `src/tokens/generated/tokens.json` — the same values with, for colors, both `srgb` hex and **`linear` float triplets**, consumed by `blender/lib/materials.py` and available to scripts.
  - Render code imports `@tokens/tokens` directly (TS), converting with three's `Color.setStyle()` (sRGB → linear handled by `ColorManagement`).
  - `lint` runs the generator in `--check` mode and fails if generated files are stale.
- **Components**: one `Component.module.css` beside each `Component.tsx`. Global CSS limited to `tokens.css`, a reset, `@font-face`, and the static noise overlay.
- **Stylelint rules** (config in repo, applied to `src/**/*.css` except `src/tokens/generated/`):
  `color-no-hex`, `color-named: never`, `function-disallowed-list: [rgb, rgba, hsl, hsla, hwb, lab, lch, oklab, oklch, color-mix, linear-gradient, radial-gradient, conic-gradient, repeating-linear-gradient]`,
  `property-disallowed-list: [box-shadow, text-shadow, backdrop-filter, filter, opacity]`,
  `declaration-property-value-allowed-list: { border-radius: ["0"], /^font-size$/: ["/^var\\(--fx-/"], /^(margin|padding|gap)/: ["/var\\(--fx-/", "0"] }` (`opacity` is allowed only in the noise-overlay file via a scoped override). Colors therefore can only arrive through `var(--fx-*)`.
- **Fonts**: self-hosted subsetted WOFF2 in `public/fonts/` (families chosen in DESIGN_SYSTEM.md; licenses OFL). No Google Fonts CDN: offline-capable, deterministic screenshots.
- No icon library: glyphs are a small inline SVG sprite / Unicode set defined by DESIGN_SYSTEM.

## Consequences
- Positive: banned styles fail `npm run lint`; one token edit propagates to HUD, scene and next Blender build; no runtime styling cost.
- Negative: ~60-line generator to own; designers write plain CSS (desired).
- Follow-ups: ui-design-system fills `tokens.ts`; blender-technical-artist reads `tokens.json` in `blender/lib/materials.py`; the `design-tokens` review grep stays as a second net.

## Dependencies introduced
| Package | Exact version | One-line justification |
|---|---|---|
| `stylelint` | 17.15.0 | Mechanically bans radius/shadows/gradients/literal colors in component CSS (built-in rules only, no shared config) |
