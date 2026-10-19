# ADR 0009 — Showcase site: prerendered Vite page + lazy R3F island driven by native scroll

- **Status**: Accepted (user validation of direction A and of the single-app deploy, 2026-10-19)
- **Date**: 2026-10-19
- **Owner**: systems-architect (+ web-showcase, three-graphics-engineer, ui-design-system)
- **Related**: ADR 0001 (Vite SPA), 0002 (three/R3F), 0005 (tokens), 0008 (deploy), `docs/SHOWCASE.md`

## Context
The public page at `/` must sell the game: a scroll-driven 3D launch sequence using the real game GLBs, live-looking
HUD fragments, a catalogue, a site selector, a CTA to the game at `/play`. It must be fast (LCP < 2.5 s on mobile),
indexable (OG/SEO), accessible (AA, keyboard, reduced motion) and responsive down to phones. The first showcase
(PR #1) rendered everything client-side: empty HTML until ~340 KB gzip of JS ran, no SEO text, no OG image.
The game shares the tokens, fonts, GLB wrappers and the `useAsset` loader; one Docker image serves both (ADR 0008).

## Options considered
| Option | Pros | Cons |
|---|---|---|
| **Vite MPA (current build) + build-time prerender of the showcase + lazy R3F island** | One build, one token pipeline, same aliases/ESLint boundaries/GLB wrappers; HTML is real at first byte; 3D only costs after first paint | We maintain a ~40-line prerender script (SSR build + inject) |
| Astro 7 + React islands | Zero-JS default, built-in islands and image pipeline | Second build system and config; tokens/aliases/codegen/ESLint duplicated; three/R3F weight is identical anyway |
| Next.js static export | SSG and image tooling | Heavy framework for one page, App Router irrelevant, diverges from ADR 0001 |
| Plain hand-written HTML + vanilla three | Smallest JS | Loses the shared React/R3F code (`useAsset`, clay materials), duplicate HUD markup |
| Scroll: GSAP 3.15 ScrollTrigger | Robust pin/scrub, now free incl. commercial use | ~45 KB gzip for what CSS `position: sticky` (pin) + a 30-line rAF progress driver (scrub) already do; the stage damps its own camera. Rejected at implementation (first proposal to the user) |
| Scroll: **CSS sticky + native progress driver** | 0 KB, no scroll hijack, works before the 3D chunk loads (clock, phase bar) | We own ~30 lines |
| Scroll: Motion 14 | Lighter, React-friendly | Versions < 2 weeks old at decision time; weaker pinning/scrub story for driving a canvas |
| Scroll: CSS `animation-timeline` only | 0 KB | Cannot drive a WebGL camera; support gaps |
| Smooth scroll: Lenis | "Award site" feel | Floaty inertia contradicts mechanical motion; accessibility cost. Rejected |

## Decision
Keep the Vite multi-page build. The showcase is **prerendered at build time and hydrated**; the 3D stage is **one
lazily imported chunk**. Pinning is CSS `position: sticky`; story progress comes from a native, rAF-batched passive
scroll listener (`src/app/showcase/story.ts`) that also drives the T-clock and phase bar before the 3D arrives.

- Entries: `index.html` → `src/showcase.tsx` (hydrate) and `src/showcase.server.tsx` (SSR render) — both render
  `src/app/showcase/Showcase.tsx`. `npm run build` = tokens → `vite build` → `vite build --ssr src/showcase.server.tsx`
  into `build/ssr/` → `tsx scripts/showcase/prerender.ts` injects the markup into `dist/index.html`.
- Layering (ESLint matrix unchanged): DOM sections in `src/ui/showcase/**` (no three), the stage in
  `src/render/systems/showcase/**` (may `useFrame`), composition + scroll driver in `src/app/showcase/**`.
  Story progress travels as a mutable ref (`{ p }`), never React state at frame rate (CLAUDE.md rule 3).
- The stage reuses `useAsset` (meshopt GLB + token clay materials) and the generated wrappers' node names; no drei.
- The deferred chunk is requested once the hydrated page is idle (`requestIdleCallback`, ≤ 1.5 s); the canvas stops
  drawing (`frameloop="never"`) while scrolled out of view, and a chunk/GLB/WebGL failure is caught in `src/app/showcase`.
  If WebGL is missing or the chunk fails, the slot shows a Blender still.
- Native scrolling only. `prefers-reduced-motion: reduce` → no scrub, chapter stills, clocks frozen.
- The game moves to the clean URL **`/play`** (`play.html` still served); dev/preview rewrite it with a Vite plugin,
  nginx with `location = /play`.

### Performance budget (showcase)
| Metric | Budget |
|---|---|
| LCP (Lighthouse mobile) | < 2.5 s |
| CLS | < 0.05 |
| Initial JS, gzip | ≤ 90 KB |
| Deferred 3D chunk, gzip | ≤ 300 KB |
| GLB transferred | ≤ 350 KB |
| Images (WebP plates + OG) | ≤ 600 KB |
| Frame time on the reference iGPU | ≤ 16.7 ms median while scrubbing |

## Consequences
- Positive: real HTML for SEO/LCP; the heavy part is opt-in; one build, one image, one domain.
- Negative: a hydration contract (server and first client render must match: client-only bits gate on a
  `useHydrated()` snapshot); an extra SSR build step (~1 s).
- Follow-ups: Lighthouse run in `showcase-check`; revisit Astro only if the site grows into many content pages.

## Dependencies introduced
None.
