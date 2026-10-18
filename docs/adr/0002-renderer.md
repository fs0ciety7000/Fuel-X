# ADR 0002 — Renderer: three.js WebGLRenderer (WebGL2) via React Three Fiber, imperative frame sync

- **Status**: Proposed (Gate 1)
- **Date**: 2026-10-18
- **Owner**: systems-architect (consulted: three-graphics-engineer)
- **Related**: ADR 0003 (sim), ADR 0007 (assets), `docs/ARCHITECTURE.md` §Render sync, §Performance budget

## Context
Needs: a coastal site with ~300 visible entities (many repeated: tanks, tankers, props), dense
point-cloud sea and ground (~250 k points), exhaust/foam/steam particles, one sun with shadows,
haze, a cheap halftone/dither post pass, DOM labels anchored to sockets, a following camera.
Target: 60 fps on a mid-range laptop iGPU at 1080p; headless Chromium (SwiftShader) must render
it deterministically for visual tests. The HUD is React (ADR 0001).

Two independent questions: **(a) WebGL2 vs WebGPU backend**, **(b) R3F vs vanilla three**.

## Options considered — (a) backend
| Option | Pros | Cons |
|---|---|---|
| **`WebGLRenderer` (WebGL2)** | Universally available on desktop incl. Linux iGPUs; mature; `pmndrs/postprocessing` supports it; SwiftShader in headless Chromium is reliable → stable screenshots; every three example applies | No compute shaders (particles on CPU or via vertex-shader tricks) |
| `WebGPURenderer` (+ TSL, WebGL2 fallback backend) | Compute particles, modern API, future-proof | Shaders must be written in TSL; `pmndrs/postprocessing` does not support it; WebGPU still patchy on Linux Chrome and in headless/SwiftShader → flaky visual tests; fallback backend ≠ identical output; less battle-tested on iGPU drivers |

## Options considered — (b) integration
| Option | Pros | Cons |
|---|---|---|
| **R3F 9** | Entity views mount/unmount declaratively when the entity list changes; shares React context with HUD (selection, site); Suspense for GLB loading; drei loaders; agents/skills assume it | Easy to misuse (props driven by 60 Hz state → re-renders); one more abstraction over the loop |
| Vanilla three + own scene graph manager | Total control of the loop, zero reconciler cost | We re-implement lifecycle/mount/dispose, resource caching, HMR-friendly scene editing, and a bridge to React HUD anyway |

## Decision
**three.js `WebGLRenderer` (WebGL2) driven by React Three Fiber 9**, with strict rules that make
R3F a *mount/unmount + resource lifecycle* layer only — never a per-frame data path:

1. `<Canvas frameloop="never">`: the app's `GameLoop` (ADR 0003) calls `advance(now)` once per
   `requestAnimationFrame` after stepping the sim, so sim → render ordering is explicit.
2. React components under `src/render/views` re-render **only** when the *entity index*
   (ids + kinds + asset/LOD, changes on spawn/despawn/site switch) changes. They never receive
   positions, telemetry or FSM state as props.
3. One **`RenderSync`** system (`useFrame` at a fixed priority, in `src/render/systems/`) reads the
   interpolated `RenderSnapshot` (typed arrays) and writes `Object3D` matrices, `InstancedMesh`
   instance matrices and animation channels (arm angles, throttle) through an id → handle
   registry. Other `useFrame` users are limited to `src/render/systems/` (lint rule).
4. Repeated meshes use `InstancedMesh` (one per asset × LOD); static site structures are merged at
   load into a `BatchedMesh`/merged geometry per material. Sea and ground are `THREE.Points` with
   a custom `ShaderMaterial` (static buffers, waves in the vertex shader) — 1 draw call each.
5. Post-processing via `postprocessing` (merged `EffectPass`: SMAA + halftone/dither + optional
   fog tint) — at most 2 full-screen passes. No SSAO at runtime (AO may be baked in Blender).
6. Custom shaders live only in `src/render/materials/` (GLSL `ShaderMaterial` / `onBeforeCompile`)
   so a later TSL port is contained.
7. drei usage is whitelisted: `useGLTF` (+ meshopt decoder), `useTexture` if ever needed,
   `PerformanceMonitor`. **Banned**: `<Html>` (one React root per label, re-renders),
   `<Environment>` with remote HDRs, `<Text>` (troika, heavy) — labels are a pooled DOM overlay
   positioned imperatively by `RenderSync`.
8. DPR clamped to `[1, 1.5]`; adaptive DPR drop to 1 when `PerformanceMonitor` reports decline.

**WebGPU revisit trigger**: Phase 8, or earlier if (a) particles become CPU-bound beyond budget,
and (b) WebGPU is available in our headless CI Chromium and `postprocessing` (or three's own
pipeline) covers our passes.

## Consequences
- Positive: predictable perf on iGPUs; deterministic SwiftShader screenshots; HUD and scene share
  selection state via the bridge stores without prop drilling.
- Negative: CPU-side particle updates (bounded by the budget: ≤ 20 k live sprites); discipline
  needed to keep React off the hot path — enforced by lint + `qa-perf` review + React Profiler check
  in `perf-audit` (0 scene commits per second while nothing spawns).
- Follow-ups: `three-graphics-engineer` owns `RenderSync`, registry, instancing helpers, label pool.

## Dependencies introduced
| Package | Exact version | One-line justification |
|---|---|---|
| `three` | 0.186.1 | The renderer |
| `@types/three` | 0.186.0 | Types |
| `@react-three/fiber` | 9.8.1 | Declarative mount/dispose of scene objects inside the React tree |
| `@react-three/drei` | 10.7.8 | `useGLTF` with meshopt + caching/preload, `PerformanceMonitor` (whitelisted subset only) |
| `postprocessing` | 6.39.5 | Merges effects into one full-screen pass (cheaper than three's `EffectComposer` chain); peer `three <0.187` |
