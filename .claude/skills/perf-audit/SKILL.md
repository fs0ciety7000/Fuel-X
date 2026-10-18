---
name: perf-audit
description: Measure Fuel-X runtime and build performance — fps / frame time, draw calls, triangles, geometries/textures in GPU memory, sim tick cost, GLB sizes, JS bundle size — against the budget in docs/ARCHITECTURE.md. Use after render/asset changes, when adding many instances, before each phase gate, or when something feels slow.
---

# Performance audit

Budget source of truth: the **Performance budget** section of `docs/ARCHITECTURE.md`. Report numbers, not impressions.

## Measure
1. **Production build**: `npm run build && npm run preview`. Dev builds lie.
2. **Reference scenes** (reach them deterministically via the dev/debug hooks, see `visual-check`): terminal count at LC-1 (worst case: everything on screen + exhaust), ascent following booster, build yard with logistics.
3. **Renderer stats** via the debug hook (from three's `renderer.info`): draw calls, triangles, geometries, textures, programs. Sample over ~5 s.
4. **Frame time**: in Playwright, collect `requestAnimationFrame` deltas over 10 s → median, p95, p99. Note that headless/software GL is slower than a real iGPU: compare against the previous run on the same machine, and flag absolute numbers as indicative.
5. **Sim cost**: benchmark N ticks of the vertical slice headless (`npm run perf` → sim bench) → µs/tick and max entities at budget.
6. **Assets**: size and triangle count of every GLB in `public/models/` vs per-asset budget.
7. **Bundle**: JS/CSS sizes (gzip) from the build output vs budget; flag the largest new dependency.

## Report
A table: metric · budget · measured · Δ vs last audit · status. Update the "latest numbers" section of `docs/QA.md`. For each overrun: the likely cause and a concrete fix (instancing, LOD, merge geometry, fewer shadow casters, cheaper particles, lazy-load a site, code-split a panel).
