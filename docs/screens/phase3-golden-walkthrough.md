# Phase 3 — golden run walkthrough (seed 42)

Human-readable timeline of the headless golden run, extracted from
[`tests/golden/__files__/full-launch.seed42.log`](../../tests/golden/__files__/full-launch.seed42.log)
(scenario `mvp`, seed 42, `STANDARD_AUTOPILOT`). The sim runs at 30 Hz. Times are the T-clock. The T-clock
stops during holds, so sim time runs 20 min ahead of it after the leak fix.

The autopilot plays a simple launch director: it starts the rollout, orders 3 LOX and 1 CH4 standard trucks,
gives GO whenever a hold can be released, answers a GSE leak with HOLD_FIX, and makes the catch call after
boostback ends (CATCH if p is above the 0.535 break-even). Everything else is the simulation: weather, stations,
anomalies, flight, and the catch roll.

| T-clock | What happens |
|---|---|
| **T-06:00:00** | Scenario start (Standby). Player: **StartRollout** and **4 standard deliveries** (LX-01..03, MX-01; gate ETA T-02:00:00; 4 × 6 000 cr haulage). PROPELLANT station opens **MARGINAL** (`FARM_RESERVE_LOX`: the farm covers ~31 min of holds at the start and ~57 min once the 4 deliveries have offloaded, still under the 60-min GO line; see BALANCING §13.1). CR-77 starts lifting B-09 onto SP-41. |
| T-05:30:00 | B-09 is on SP-41, and SP-41 drives the 1 800 m to OLM-1 at 1 m/s. |
| **T-05:00:00** | SP-41 reaches the pad. Phase **Rollout → Stack**. Player: **Stack**. The TOWER-1 arms close and take B-09. SP-41 returns for S-21. |
| T-03:30:00 | B-09 is **STACKED**, and the arms take S-21 next. |
| T-03:19:14 → T-03:17:45 | **Wind pause**: a gust above 13 m/s puts TOWER-1 in `WIND_HOLD` for 1.5 min. Stacking resumes once the gust is 0.5 m/s under the limit. |
| T-03:34 … T-02:10 | WEATHER drifts between GO and MARGINAL (upper wind near 51 m/s, later ground wind). Ground wind briefly reads **NO-GO** around T-02:16. This is pre-load, so there is no auto-hold. |
| **T-02:28:31** | S-21 is **STACKED** on B-09. That is 52 min of slack before the load poll. |
| T-02:05:50 → T-01:32:00 | The 4 tankers come in, offload at 15 kg/s, and leave (+60 t LOX, +16 t CH4; 17 000 cr of propellant). |
| T-01:30:00 | Crew vans CV-01..03 leave the pad, 30 s apart, and park at the safe area by T-01:23:31. |
| **T-01:20:00** | **Load poll**. PROPELLANT is still MARGINAL, so there is no auto-GO and `DecisionRequired POLL` is raised. Player: **GO** (logged `POLL LOAD, MARGINAL PROPELLANT`). Phase → **PropellantLoad**. |
| T-01:15:00 | Booster and ship start loading (LOX/CH4, 4 lines). |
| **T-01:04:19** | **Anomaly A3 — GSE leak** on the OLM-1 quick-disconnect (director). The load rate drops to ×0.5, VEHICLE goes MARGINAL, and `DecisionRequired LEAK` is raised. Player: **HOLD_FIX**, which puts a `LEAK_FIX` hold on the count and pauses the load for 20 min (topping still drains the farm). |
| (T-01:04:19, +20 min sim) | Leak fixed: VEHICLE → GO, full rate, and the hold auto-releases. |
| T-00:40:00 | Road closure (milestone). |
| T-00:30:49 / T-00:29:57 | S-21 and B-09 are **LOADED**. Topping replaces boil-off from here on. |
| **T-00:10:00** | **Terminal poll**. Player: **GO** (PROPELLANT MARGINAL). Phase → **TerminalCount**. |
| T-00:03:00 | Forced-1× milestone. |
| **T-00:00:40** | **Final poll**. Player: **GO**. |
| **T+00:00:00** | **Liftoff** (sim tick 684 003, 20 min later than with no holds). 33 of 33 engines lit. About 120 t LOX is left in the farm. |
| T+00:01:02 | Max-Q at 12 km, 450 m/s. |
| **T+00:02:35** | **MECO** at 68 km, 1 550 m/s (nominal: T+155 s, AC 16). |
| T+00:02:40 | Hot staging. S-21 separates and lights 6 engines. Phase → **Boostback**. |
| T+00:02:45 | Boostback start: 13 engines, and **`DecisionRequired CATCH`** is raised (deadline: landing burn at T+06:20). |
| **T+00:03:35** | Boostback end. Player: **CatchDecision CATCH** (p = 0.997 > 0.535). TOWER-1 goes to `CATCH_READY`. Phase → **TowerCatch**. |
| T+00:04:10 | Booster apogee at 95 km. |
| T+00:06:20 | Landing burn (3 engines). TOWER-1 goes to `CATCHING`. |
| **T+00:06:55** | **Caught**: one seeded roll, 0.209 < p 0.997. The arms close, B-09 goes to `CAUGHT_SAFING`, and refurbishment is charged (−1.5 M). Phase → **Safing**. |
| **T+00:08:35** | **S-21 SECO** at 150 km, 7 300 m/s. **NRL-3 fulfilled** (+62 M cr, +8 reputation) and the ship is expended (−20 M). S-21 leaves the scene. |
| **T+00:36:55** | Safing done (30 min), so **Debrief**. Ops cost for the 6 h 57 min attempt (−0.29 M). |

## Debrief numbers

| Item | Value |
|---|---|
| Outcome | **CAUGHT**, contract **FULFILLED** |
| Money | 30.000 M → 70.169 M cr (**+40.17 M**): price +62 M, ship −20 M, refurb −1.5 M, ops −0.29 M, haulage −24 k, propellant −17 k |
| Reputation | 50 → **58** (+8) |
| B-09 | wear 0.220 → **0.280**, flights 4 → **5**, 0 engines out |
| Holds | 1 200 s (the 20-min leak fix; each poll GO costs 1 tick) |
| Turnaround | 72 h (nominal refurbishment) |
| Anomalies | A3 (director) |
| Decision log | 11 entries, all PLAYER, each with its T-clock: rollout, 4 orders, stack, 3 poll GOs, leak response, catch call |

Runtime: 750 455 ticks in ~3.7 s (≈ 5 µs/tick in Vitest, golden budget 5 s). The log has 370 lines (48 KB).
