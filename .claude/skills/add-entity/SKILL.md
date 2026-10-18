---
name: add-entity
description: End-to-end recipe to add a new game entity to Fuel-X (a vehicle, structure, boat, building or prop) — design entry, sim definition and state machine, data/balancing, Blender asset, render component, HUD row/inspector, label, tests. Use whenever the user asks for "a new X" in the world.
---

# Add an entity

An entity exists in five layers. Do them in this order; each layer has an owner agent. Don't skip a layer — a placeholder is fine, a gap is not.

| # | Layer | Owner agent | Output |
|---|---|---|---|
| 1 | Design | `game-designer` | GDD entity-catalog entry: role, player decisions it enables, states, call-sign scheme, key telemetry |
| 2 | Sim | `simulation-engineer` | Entity type + component data, state machine (states + transitions + emitted events), tunables in data files, unit tests |
| 3 | Asset | `blender-technical-artist` | `blender/assets/<asset>.py` → GLB + preview render (skill `blender-asset-pipeline`), ASSETS_GUIDE.md row |
| 4 | Render | `three-graphics-engineer` | View component bound to sim id: transforms interpolated, animated nodes driven by state, sockets for label/particles |
| 5 | UI | `ui-design-system` | Icon/glyph, Vehicles/Tanks/Tasks row (name, sub-status, key value), inspector metrics, in-world label tag |

## Checklist
- [ ] GDD entry answers "what decision does this entity create?"
- [ ] Sim: SI units, deterministic, every transition emits an event; golden log updated if the vertical slice changes
- [ ] Numbers in `docs/BALANCING.md` + data file, none inline
- [ ] Node/socket names in code match the GLB (grep)
- [ ] HUD shows the entity with UI-projection data only (throttled), units converted in the projection
- [ ] Selecting the row or the label focuses the camera on it
- [ ] `qa-perf` review: tests, `visual-check` screenshot, `perf-audit` if many instances
- [ ] `docs/TASKS.md` ticked
