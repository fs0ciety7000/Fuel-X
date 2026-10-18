# ADR 0003 — Simulation: plain data-oriented TS world, fixed 30 Hz step, main thread behind a worker-ready host

- **Status**: Accepted (Gate 1)
- **Date**: 2026-10-18
- **Owner**: systems-architect (consulted: simulation-engineer)
- **Related**: ADR 0002, ADR 0004, `docs/ARCHITECTURE.md` §Loop, §Data model, §State machines, §Save format

## Context
The sim must be pure TS (no three/DOM/React), deterministic (seeded RNG, injected clock, fixed dt),
headless-testable (golden full-launch log), support pause/1×/10×/100× time compression where
**time scale = more steps, never bigger dt**, and make save/load trivial. Entity count: MVP ≈ 150–300,
late game (multi-site) ≤ 2 000. Entities are heterogeneous (booster with FSM + flight dynamics,
tank with inventories + boil-off, tanker with a route) and carry strings (call-signs, states).
The draft used a `setInterval` loop — rejected outright: it drifts, is clamped in background tabs,
and is not coupled to rendering.

## Options considered — data model
| Option | Pros | Cons |
|---|---|---|
| **Plain TS objects in typed per-kind tables + ordered system functions** | Trivially JSON-serializable (save = the world); deterministic iteration (insertion-ordered arrays); readable diffs in golden tests; no dependency; types are just interfaces | We write ~150 lines of entity-table plumbing; no automatic query caching (irrelevant at ≤ 2 000 entities) |
| koota 0.6.6 (pmndrs ECS) | Nice React bindings, traits, queries | Pre-1.0 API churn; trait storage is not a plain serializable snapshot; React-binding temptation pulls sim into UI |
| bitecs 0.4 | SoA typed arrays, very fast | Numeric-only components; strings/FSMs/routes awkward; speed unneeded at our counts |
| miniplex 2.0 | Simple object ECS | Little added value over plain tables; low release activity |

## Options considered — thread
| Option | Pros | Cons |
|---|---|---|
| **Main thread behind an async-shaped `SimHost` interface** | Simplest debugging (`window.__fuelx` sync access), no transfer cost, one code path in tests and app | Sim time competes with render at 100× |
| Dedicated Web Worker from day 1 | Sim never blocks a frame | Snapshot transfer every frame, async debug hooks, harder stepping/inspection, two-thread bugs before we know we need it |

## Decision
1. **World** = plain serializable data: `{ tick, seed, rng: RngState, sites, entities: EntityTable, contracts, economy, countdowns, pendingEvents }` (types in ARCHITECTURE.md §Data model). Systems are pure functions `(world, ctx) => void` run in a **fixed, explicit order** each tick. No classes with hidden state in the world, no closures stored in the world.
2. **Fixed timestep `DT = 1/30 s`**, integer `tick` counter; sim time = `tick × DT` (never accumulated floats). Semi-implicit Euler for flight dynamics.
3. **RNG**: in-house `sfc32` (128-bit state, serializable), **one named stream per system** (`rng.stream('weather')`) derived from the seed, so adding a system never shifts another system's rolls.
4. **State machines**: in-house, table-driven `defineFsm()` (≈100 lines): states, guarded transitions, `onEnter` effects that only mutate data + emit events; FSM state stored as `{ state, enteredTick }` in the entity. **XState rejected**: actors/timers are not plain serializable data, runtime + bundle cost, and timers must be tick-based anyway.
5. **Inputs** are `Command`s (discriminated union) queued by the UI with no tick; the host stamps them with the next tick and they are applied at the start of that tick. The command log + seed fully reproduces a game (replays, golden tests, bug reports).
6. **Outputs**: (a) `SimEvent`s (discriminated union) appended during the tick and drained by the host; (b) a `RenderSnapshot` written at end of tick into preallocated typed arrays (transform prev/curr, animation channels); (c) the world itself, read by the UI projector at ≤ 10 Hz.
7. **Thread**: run on the **main thread** inside `InlineSimHost`, which implements the `SimHost` interface (`send(cmd)`, `advance(steps)`, `snapshot()`, `drainEvents()`, `save()`, `load()`). All cross-boundary payloads are structured-clone/transfer-safe so a `WorkerSimHost` is a drop-in. **Move to a worker when** `perf-audit` measures sim > 4 ms per frame (p95) at 100× in the reference scene, or the GDD raises late-game entity counts beyond 2 000.
8. **Time scale** ∈ {0, 1, 10, 100} (GDD may restrict per phase; the host applies rules such as "drop to 1× on `LiftoffCommitted`"). Per-frame step cap: 200 steps **and** 4 ms sim wall time; if hit, the backlog is dropped and `effectiveTimeScale` is reported to the HUD (never a bigger dt).
9. **Floating point**: identical results are guaranteed on the same JS engine (V8 in Node tests and Chromium). Cross-engine bit-exactness is **not** required: saves store state, not replays, so a Firefox save loads fine; replays/goldens are V8-only.

## Consequences
- Positive: save/load = `JSON.stringify(world)` + version header; golden tests are readable text; time compression is just a loop count; worker migration is mechanical.
- Negative: we own the entity table + FSM helper (small, tested). 100× on the main thread costs up to ~2.5 ms/frame at budget (50 µs/tick × ~50 steps).
- Follow-ups: `simulation-engineer` implements `src/sim/core/{world,rng,fsm,events,commands,step,serialize}.ts` first, with tests, before any system.

## Dependencies introduced
None (by design).
