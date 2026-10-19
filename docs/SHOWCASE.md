# Fuel-X — Showcase site

> Owner: `web-showcase` (+ `ui-design-system`, `three-graphics-engineer`). Stack: [ADR 0009](adr/0009-showcase-site.md).
> Deploy: [`DEPLOY.md`](DEPLOY.md). Verification: `.claude/skills/showcase-check`.
> Direction **A — "Launch dossier"** (user decision, 2026-10-19). English only.

The public front door at `https://fuelx.fs0ciety.org/`. The game itself lives at `/play` on the same origin.

---

## 1. Trend research (2026-10) and what we keep

| Trend observed | Evidence | Kept? | How it lands in Fuel-X |
|---|---|---|---|
| **Scroll-driven 3D narratives** dominate Awwwards SOTD winners in 2026 (immersive 3D ≈ 6 in 10 SOTD in Q1 per a trade blog; unverified against Awwwards data) | [Awwwards 3D WebGL scroll](https://www.awwwards.com/inspiration/3d-webgl-scroll-monogrid-com), [SOTD 2026 3D](https://svilenkovic.com/3d/sotd-2026-3d), [Digital Strategy Force](https://digitalstrategyforce.com/journal/why-are-immersive-experiences-dominating-the-2026-awwwards/) | **Yes — the spine** | Scroll = mission time. One pinned stage plays rollout → stack → liftoff → boostback → catch with the real game GLBs. |
| `prefers-reduced-motion` respected and Lighthouse mobile ≥ 90 treated as table stakes | same sources | **Yes** | Reduced motion → hard cuts between chapter keyframes, no scrub, no ticking clocks. Prerendered HTML, 3D deferred. |
| Smooth-scroll hijacking (Lenis / ScrollSmoother) | ubiquitous on award sites | **No** | Floaty inertia contradicts "mechanical, not bouncy" motion and hurts keyboard/AT scrolling. Native scroll; the *scene* is damped, not the page. |
| Brutalist / Swiss editorial typography, giant viewport-bleeding letterforms | DesignRush typography lists, the `industrial-brutalist-ui` skill | **Yes** (already our language) | Macro "FUEL-X", chapter stamps `§04`, T-clock; everything else monospace micro-type. |
| Live "product UI" fragments in marketing pages (real HUD pieces rather than screenshots) | common on 2025–26 SaaS/game launch pages | **Yes** | Mini flight card + phase timeline built from the same tokens and visual grammar as the game HUD. |
| Bento grids, glassmorphism, gradient meshes, cursor trails | generic 2024–26 trend | **No** | Banned by the design system (no translucency, no gradients, no gimmick motion). |
| Islands / zero-JS-by-default frameworks (Astro) | [pkgpulse](https://www.pkgpulse.com/guides/rsc-vs-astro-islands-2026), [Astro vs Next 2026](https://www.kunalganglani.com/blog/astro-vs-nextjs-2026.md) | **Idea yes, framework no** | Same effect inside our Vite build: prerendered static HTML + one lazily loaded 3D island (ADR 0009). |
| GSAP fully free (incl. ScrollTrigger) since the Webflow acquisition | [gsap on npm](https://npmjs.com/package/gsap) | **Yes** | ScrollTrigger pins the story and scrubs the stage; loaded with the 3D chunk, not in the critical path. |

## 2. Information architecture

One long page, nine blocks. Every block answers "why would I play this?" with the game's own vocabulary.

| # | Block | Content | Interaction |
|---|---|---|---|
| 0 | **Top bar** (sticky) | `FUEL-X` · `CALDER ORBITAL / VARNE COAST / BRACKWATER LC-1` · story T-clock · `[ OPEN THE PAD ]` | clock follows the story; CTA → `/play` |
| 1 | **Hero** | macro `FUEL-X`, one-line pitch, "You never fly the rocket.", mini flight card `[ LC-1 FLIGHT 7 ]` (T-minus ticking in real time, simulated telemetry) | CTA, "Scroll to count down" |
| 2 | **Launch dossier** (pinned) | six sheets `§01 CONTRACT … §06 TURN AROUND`, each a decision of the GDD; the 3D stage plays the matching phase; phase bar `ROLLOUT → … → SAFING` with playhead | scroll scrubs mission time; phase bar segments jump to a chapter |
| 3 | **Four calls per flight** | the four decision points with both costs (GDD §3.1) | tabs (keyboard arrows), the selected call prints its trade-off |
| 4 | **Hardware** | catalogue of the Blender-rendered entities (call-sign prefix, class, length, role) | hover/focus a plate → spec sheet; filter by family |
| 5 | **Varne Coast** | site selector: Brackwater LC-1 (active), Cobble Reach LC-2 (under construction, hatched), Flint Hollow TS-1, Kilnmoor Works BY-1 + schematic coast map | buttons switch the sheet and highlight the map marker |
| 6 | **How it's built** | "Assets are code": Blender script → GLB → three.js; deterministic sim; numbers (tri counts, 30 Hz sim) | none (static) |
| 7 | **CTA band** | hazard stripe, `OPEN THE PAD`, build status | → `/play` |
| 8 | **Colophon** | CM Interactive / Cardor Media marks in ink, "Developed by CM Interactive. A division of Cardor Media.", rev stamp | links: design system |

## 3. Story → scene keyframes

Story progress `p ∈ [0, 1]` over the pinned dossier. Mission time shown in the T-clock is derived from `p` (piecewise linear per chapter, values from GDD/BALANCING orders of magnitude). Camera moves are eased with `tokens.motion.ease.mech`; nothing overshoots.

| Chapter | p | T-clock | Scene | Camera |
|---|---|---|---|---|
| §01 Contract | 0.00–0.16 | T-06:00:00 | empty mount, tower, tank farm, sea points | wide establishing, slow lateral drift |
| §02 Prepare | 0.16–0.33 | T-05:15 → T-01:20 | SP-41 rolls B-09 onto OLM-1, carriage lifts S-21 and sets it on the booster | medium, three-quarter |
| §03 Count down | 0.33–0.50 | T-01:20 → T-00:00:03 | QD arm engaged, vent plume at the ship, stations go GO one by one | low, close on the stack |
| §04 Fly | 0.50–0.66 | T-0 → T+00:02:40 | liftoff: orange exhaust, stack climbs out of frame, hot-stage | tilts up, then follows |
| §05 Recover | 0.66–0.83 | T+00:06:00 → T+00:06:55 | B-09 descends with the landing burn, arms close on the catch pins | pinned on the catch point |
| §06 Turn around | 0.83–1.00 | T+00:07:30 → | booster held in the arms, pull-out to the wide shot | wide, high |

Reduced motion: the stage renders one still per chapter (no scrub interpolation), the clock prints the chapter's anchor time.

## 4. Visual & motion rules (delta to DESIGN_SYSTEM)

- Same tokens, same substrate, same single accent; orange only for thrust, selection, CTA and hazard bands.
- Responsive (the game targets ≥ 1280 px; the showcase must work from 360 px): the pinned stage becomes a sticky 16:9 strip above the sheets below 900 px.
- Motion: chapter sheets "stamp" in (80 ms snap + 200 ms mech ease, translate ≤ 8 px), never fade-only, never bounce. Numbers change in place (tabular figures).
- Grain: the global static noise overlay of the game.
- New components are listed in `DESIGN_SYSTEM.md §12` (showcase addendum).

## 5. Performance, accessibility, SEO

| Item | Target | How |
|---|---|---|
| LCP (mobile, 4G throttled) | < 2.5 s | prerendered HTML; LCP element = hero macro type (fonts preloaded); 3D lazy |
| CLS | < 0.05 | fixed aspect stage slot, font metrics via `font-display: swap` + preload |
| Initial JS (gzip) | ≤ 90 KB | React + hydration + page code only |
| Deferred 3D chunk (gzip) | ≤ 330 KB | three + R3F + gsap + stage code |
| GLB on the showcase | ≤ 350 KB | LOD1 of tower/pad/booster/ship + tanks + transporter |
| Images | ≤ 600 KB total | WebP plates 720 px from the Blender previews, lazy |
| Contrast | WCAG AA | token pairs from DESIGN_SYSTEM §2.2 only |
| Keyboard | full | skip link, visible focus, tabs/selector with arrow keys, no scroll trap |
| No WebGL | graceful | Blender still (`_stack`) in the stage slot |
| SEO | static | title/description, canonical, Open Graph + Twitter card (1200×630 plate), JSON-LD `VideoGame`, `robots.txt`, `sitemap.xml` |
