---
name: sim-testing
description: How to write and maintain deterministic tests for the Fuel-X simulation — seeded RNG, injected clock, fixed dt, state-machine transition tests, the golden full-launch telemetry log, replay/save-load equivalence. Use when adding or changing any sim logic or when a sim test fails.
---

# Simulation testing

The sim is deterministic: same seed + same inputs + same tick count ⇒ byte-identical state and event log. Tests lean on that.

## Test kinds
1. **Unit** — one system/function, tiny hand-built state. Fast, many.
2. **State machine** — for each vehicle class and the countdown: every allowed transition fires on its condition, every disallowed one doesn't, every transition emits its event. Table-driven.
3. **Golden log** — runs the MVP vertical slice (Rollout → Stack → Propellant load → Terminal count → Liftoff → Boostback → Tower catch → Safing) from a fixed seed with scripted player inputs, and snapshots a compact log (tick, phase, events, key telemetry sampled every N ticks). Lives with the tests, committed.
4. **Replay / save-load** — run K ticks, save, load, run M more ⇒ equals running K+M straight.
5. **Time scale** — running at 100× for T sim-seconds equals 1× for T sim-seconds (same number of fixed steps).
6. **Property / fuzz** (optional) — random seeds: invariants hold (propellant never negative, mass conserved in transfers, no NaN, phases monotonic unless recycle).

## Rules
- Never use `Math.random()`, `Date.now()`, `performance.now()` in sim code or sim tests — use the injected seeded RNG and clock.
- Build test state with factories (`makeBooster({ ...overrides })`), not giant literals.
- Assert in SI units; unit conversions are tested in the UI projection, not here.
- Golden updates are intentional: when the golden changes, explain *why* in the commit message (which rule/number changed). Never regenerate a golden just to make a red test pass without understanding the diff.
- Floating point: compare with explicit tolerances in unit tests; the golden log rounds values to a fixed precision before snapshotting.

## Running
`npm run test` (all), `npm run test -- <pattern>` (subset). Update goldens with the runner's update flag, then review the diff before committing.
