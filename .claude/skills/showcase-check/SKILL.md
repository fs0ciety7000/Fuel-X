---
name: showcase-check
description: Verify the Fuel-X showcase site (index.html at /) — production build, prerendered HTML present, screenshots of every block at desktop and phone widths and with reduced motion, story keyframes, links to /play, SEO/OG tags, bundle and GLB budgets from ADR 0009. Use after any change to the showcase (src/ui/showcase, src/app/showcase, src/render/systems/showcase, index.html, deploy config) and before deploying.
---

# Showcase check

## Run
1. `npm run build` (includes the SSR prerender). Check `dist/index.html` contains the hero text (`grep -c "You never fly the rocket" dist/index.html` ≥ 1) — the page must not be an empty `#root`.
2. `npm run preview` in the background (port 4173), then `npx tsx scripts/showcase/shots.ts` → screenshots in
   `test-results/showcase/`: `desktop-<block>.png` (1440×900), `phone-<block>.png` (390×844), story chapters
   `story-01..06.png`, `reduced-motion.png`. Chromium is preinstalled (never `playwright install`); SwiftShader is slow:
   judge composition, not fps.
3. **Look at every screenshot** (Read tool). Check: paper substrate, one orange, no radius/shadow/gradient, macro type
   only on hero/stamps/clock, no clipped text at 390 px, stage framing per `docs/SHOWCASE.md §3`, logos in ink.
4. `npm run e2e -- showcase` — structure, links (`/play`), meta/OG, reduced motion, no page errors.
5. Budgets: `npx tsx scripts/perf/budgets.ts` (showcase rows) — initial JS ≤ 90 KB gz, deferred 3D ≤ 300 KB gz,
   showcase GLB ≤ 350 KB, images ≤ 600 KB.
6. Optional Lighthouse (if `npx lighthouse` reachable): mobile perf ≥ 90, a11y ≥ 95, SEO 100.

## Report
Table: check · result · note; list the screenshots you looked at; any budget overrun with its cause.
