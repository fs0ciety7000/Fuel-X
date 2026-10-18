# ADR 0004 — State → UI binding: 10 Hz throttled projection in Zustand stores

- **Status**: Proposed (Gate 1)
- **Date**: 2026-10-18
- **Owner**: systems-architect (consulted: ui-design-system)
- **Related**: ADR 0003, `docs/ARCHITECTURE.md` §UI projection contract

## Context
The HUD shows live telemetry (clock, altitude, velocity, propellant %, sparklines), lists of
~50–300 rows, an inspector, a countdown timeline and alerts. The sim ticks at 30 Hz × time scale
(up to 3 000 ticks/s). React must never re-render at 60 Hz or per tick; values must not jitter in
width; units are converted for display (km, km/h, %) outside the sim.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| **Projection function + Zustand vanilla stores, selectors with shallow equality** | ~1 KB; `useSyncExternalStore`-based (tearing-safe); usable outside React (`getState()` in render loop, debug hooks); R3F already depends on it | Must write the projector deliberately (that is the point) |
| React state/context fed by the loop | No dep | Context re-renders whole subtrees; easy 60 Hz accident |
| Valtio / MobX (proxies) | Fine-grained | Mutable proxies invite writing sim state from UI; tracking magic hides render causes |
| Jotai | Atomic | Per-entity atoms for 300 rows = churn; less natural outside React |
| Redux Toolkit | Devtools | Ceremony; immutable updates of large trees each projection |

## Decision
- A pure **projector** `projectUi(world, prevProjection, view): UiProjection` in `src/app/projection/` converts sim state (SI) into display-ready, *formatted* data (numbers rounded/fixed-width, units converted, glyph ids, sparkline ring buffers). It reuses unchanged sub-objects from `prevProjection` (structural sharing) so selectors bail out cheaply.
- **Rate**: run at **10 Hz wall-clock** (every 100 ms) while running, plus immediately (next frame) when a *salient* event is drained (phase change, alert, selection, spawn/despawn, site switch, time-scale change). Paused ⇒ one projection on pause, then on events only. Sparklines sample **sim time** at 1 sample / sim-second (so they compress with time scale), 120 samples each.
- **Stores** (Zustand 5, created with `createStore` in `src/bridge/`, consumed via `useStore(store, selector, shallow)`):
  - `projectionStore` — written only by the app at ≤ 10 Hz; read-only for UI.
  - `viewStore` — UI intents and view state: `selectedId`, `followId`, `siteId`, `cameraIntent`, `activeTab`, `timeScale` request. Written by UI and debug hooks; read by render via `getState()` in the frame loop (no subscription) and by the app.
  - Player actions go through `commands.send(cmd)` (a bridge function), never by mutating any store into the sim.
- Values that need per-frame smoothness in the DOM (in-world label positions, altitude scale needle, compass heading) are **render-owned**, written imperatively to DOM `style.transform`/`textContent` by `RenderSync`, not React.
- Mission clock text: updated by the 10 Hz projection (tenths precision max).

## Consequences
- Positive: a hard ceiling of ~10 React commits/s regardless of time scale; UI testable by feeding fixture projections; the projection doubles as the `__fuelx.state()` assert surface for e2e.
- Negative: UI shows data up to 100 ms stale — acceptable for a control-room HUD.
- Guard: `perf-audit` checks React Profiler commit rate ≤ 12/s in the reference scenes.

## Dependencies introduced
| Package | Exact version | One-line justification |
|---|---|---|
| `zustand` | 5.0.15 | Tiny external store with selector subscriptions, usable outside React; already an R3F dependency |
