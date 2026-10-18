# Fuel-X — Balancing (MVP)

> Owner: `game-designer` · REV A · Companion to [`GDD.md`](GDD.md).
> **Every number below lives in a data file under `src/data/`** (suggested file in each section header). Systems read them, they never hard-code them. All sim values are SI: m, s, kg, kg/s, m/s. Display units (t, km, km/h, %, min) are conversions done in the UI projection. "Range" = what designers may tune to without breaking the design. Times written `T-hh:mm:ss` are offsets from planned liftoff, stored as signed seconds.
> Vehicle numbers are **plausible orders of magnitude for a large, fully reusable methalox two-stage rocket**, deliberately rounded. Not a replica of any real vehicle.

## 1. Vehicles: `src/data/vehicles.ts`

| Key | Unit | Default | Range | Rationale |
|---|---|---|---|---|
| booster.height | m | 71 | 65–75 | super-heavy class first stage |
| booster.diameter | m | 9 | 9 | shared with ship |
| booster.dryMass | kg | 250 000 | 200k–300k | stainless structure + 33 engines |
| booster.propMass | kg | 3 400 000 | 3.2M–3.7M | public figures for this class are ~3 400 t [S1] |
| booster.engines | count | 33 | — | `engines lit 33 of 33` widget |
| booster.boostbackEngines | count | 13 | — | |
| booster.landingEngines | count | 3 | — | |
| ship.height | m | 52 | 50–55 | |
| ship.dryMass | kg | 120 000 | 100k–150k | |
| ship.propMass | kg | 1 500 000 | 1.2M–1.6M | [S1] |
| ship.engines | count | 6 | — | |
| propellant.mixtureRatioOF | – | 3.6 | 3.5–3.8 | methalox O/F by mass |
| → booster LOX / CH4 | kg | 2 660 000 / 740 000 | derived | propMass × OF/(1+OF) |
| → ship LOX / CH4 | kg | 1 174 000 / 326 000 | derived | |
| → **total per flight** | kg | **3 834 000 LOX / 1 066 000 CH4** | derived | ≈ 4 900 t |
| B-09 start flightCount | count | 4 | 0–20 | flight-proven, has history |
| B-09 start wear | 0–1 | 0.22 | 0–0.6 | gives wear a visible effect without dominating |
| wear.perNominalFlight | 0–1 | 0.06 | 0.03–0.1 | ~10 flights before refurb matters |
| wear.engineOut | 0–1 | 0.10 | 0.05–0.2 | |
| wear.highWindCatch (tower wind > 11 m/s, = `sigmaWindRefMPerS`, §13) | 0–1 | 0.04 | 0–0.1 | |
| wear.reliabilityFactor | – | 1 + 2·wear | — | multiplies all booster failure probabilities |
| vehicleHealth.goThreshold | 0–1 | 0.80 | 0.7–0.9 | VEHICLE station |

## 2. Tank farm and propellant: `src/data/propellant.ts`

| Key | Unit | Default | Range | Rationale |
|---|---|---|---|---|
| farm.LOX tanks | count × kg | 3 × 1 800 000 | — | 5 400 t total; matches a reported LOX farm of this class [S2] |
| farm.CH4 tanks | count × kg | 2 × 750 000 | — | 1 500 t, covers one load + margin |
| farm.LN2 tank (sphere) | kg | 600 000 | — | ambient in MVP (static level) |
| farm.heelFraction | – | 0.03 | 0.02–0.05 | unusable bottom fraction per tank |
| farm.boilOff.LOX | 1/s | 2.3e-8 (0.20 %/day) | 1e-8–5e-8 | vacuum-jacketed storage typically 0.1–0.3 %/day |
| farm.boilOff.CH4 | 1/s | 1.2e-8 (0.10 %/day) | 0.5e-8–3e-8 | warmer cryogen, lower loss |
| MVP start farm LOX | kg | 4 190 000 (§13) | 4.17M–4.25M | **reserve at T-0 after a nominal no-hold load ≈ 71 t = ~31 min of hold** (load + boil-off during load + topping to T-0 all counted). Main D1 lever; LOX binds first |
| MVP start farm CH4 | kg | 1 155 000 (§13) | 1.15M–1.17M | reserve ≈ 21 t = ~49 min of hold. Binds second: an LOX-only order hits a CH4 wall in a long hold |
| load.booster.LOX | kg/s | 1 000 | 700–1 400 | → 44 min; a full load of this class takes ~40–50 min [S3] |
| load.booster.CH4 | kg/s | 280 | 200–400 | 44 min |
| load.ship.LOX | kg/s | 450 | 300–600 | 43 min |
| load.ship.CH4 | kg/s | 125 | 90–170 | 43 min |
| load.degradedFactor (A3 leak) | – | 0.5 | 0.3–0.7 | |
| vehicle.boilOff.LOX (loaded) | 1/s | 1.0e-5 (0.06 %/min) | 0.5e-5–2e-5 | warm-up of densified prop, replaced by topping. ≈ 138 t/h |
| vehicle.boilOff.CH4 (loaded) | 1/s | 6.7e-6 (0.04 %/min) | 3e-6–1.2e-5 | ≈ 26 t/h. **Holds cost ~164 t/h of farm** |
| topping | – | = boil-off, from the farm | — | |
| scrub.detankLossFraction | – | 0.15 | 0.05–0.3 | loss on detank. A scrub without new deliveries blocks a same-day recycle |
| propellant station MARGINAL | s of topping | < 3 600 | 1 800–5 400 | "less than one hold-hour left" |
| propellant station NO-GO | kg | usable < topping need to T-0 | — | |

## 3. Logistics: `src/data/logistics.ts`

| Key | Unit | Default | Range | Rationale |
|---|---|---|---|---|
| tanker.LOX.capacity (RIME `LX`) | kg | 20 000 | 18k–24k | cryo trailer ≈ 19 000 L ≈ 21.7 t LOX [S4] |
| tanker.CH4.capacity (FEN `MX`) | kg | 16 000 | 14k–18k | ≈ 38 m³ LNG at 420 kg/m³ |
| fleet.LX / fleet.MX | count | 4 / 2 | 2–8 / 1–4 | visible background traffic. Real refill ≈ 190 LOX truckloads; the farm absorbs that scale |
| tanker.offloadRate | kg/s | 15 | 10–25 | ~22 min per LOX truck |
| tanker.speedOnSite | m/s | 8.3 (30 km/h) | 5–12 | site roads |
| delivery.standard.leadTime | s | 14 400 (4 h) | 3–6 h | off-map round trip, abstracted |
| delivery.rush.leadTime | s | 5 400 (1.5 h) | 1–2.5 h | chartered extra trucks (do not use the fleet) |
| delivery.standard.fee | cr / truckload | 6 000 | 3k–10k | haulage, on top of propellant price |
| delivery.rush.fee | cr / truckload | 120 000 | 50k–250k | **needs to show on the debrief.** Cash is a weak lever in the MVP (see §11) |
| roadClosure.start | T s | −2 400 (T-00:40:00) | −3 600–−1 800 | tankers wait at the gate, D1 timing pressure |
| hazard.padRadius (road keep-out) | m | 3 000 | 1 500–5 000 | game-scale, shorter than reality, so it fits the map |
| transporter.speedLoaded (MULE `SP`) | m/s | 1.0 (3.6 km/h) | 0.5–1.5 | SPMT walking pace |
| transporter.speedEmpty | m/s | 2.0 | 1.5–3 | |
| route.yardToPad | m | 1 800 | 1 000–3 000 | small on-site yard (BY-1 is 6 000 m, post-MVP) |
| crane.loadTask (CR-77 lifts a stage onto SP) | s | 1 800 | 900–3 600 | |
| tower.stackBooster | s | 5 400 | 3 600–10 800 | arms lift + mate |
| tower.stackShip | s | 3 600 | 2 700–7 200 | |
| wind.limit.stack | m/s | 13 | 10–16 | gusts above → stack task holds |
| wind.limit.transporter | m/s | 15 | 12–18 | |
| crewVan.speed | m/s | 11 (40 km/h) | 8–15 | |
| picket.speed (PK) | m/s | 12 (≈ 23 kn) | 8–16 | intercept ETA 6–17 min over 4–12 km |
| recoveryVessel.speed (RV) | m/s | 6 | 4–8 | ambient |

Nominal prep (no holds) from start T-06:00:00: booster lifted → rolled → stacked by ≈ T-03:30:00, ship stacked by ≈ T-02:30:00 → **70 min of slack** before the T-01:20:00 load poll. One long wind hold during stacking eats most of it.

## 4. Countdown: `src/data/countdown.ts`

| Key | Unit | Default | Range | Rationale |
|---|---|---|---|---|
| scenario.start | T s | −21 600 (T-06:00:00) | — | |
| poll.load | T s | −4 800 (T-01:20:00) | — | GO for propellant load |
| crew.padClearBy | T s | −4 800 | — | vans out of the hazard radius before load |
| load.start | T s | −4 500 (T-01:15:00) | −5 400–−3 600 | ends ≈ T-00:31:00 nominal |
| load.mustCompleteBy | T s | −180 | — | else auto-hold |
| poll.terminal | T s | −600 (T-00:10:00) | — | |
| force1x.from | T s | −180 (T-00:03:00) | −600–−60 | |
| poll.final (auto hold point) | T s | −40 | — | |
| autoAbort.after | T s | −10 | — | hard fault → abort → RECYCLE |
| engineIgnition | T s | −3 | — | |
| recycle.to | T s | −600 | — | |
| autoGoWhenAllGreen | bool | true | — | removes busywork; MARGINAL always asks |
| marginalBand | – | 0.15 | 0.1–0.25 | MARGINAL = within 15 % of a limit |
| crew.shiftLimit | s | 43 200 (12 h) | 36k–50k | |
| crew.marginalFrom | s | 39 600 (11 h) | — | |
| crew.elapsedAtStart | s | 14 400 (4 h) | 0–21 600 | nominal T-0 at 10 h; long holds go MARGINAL |
| safing.duration | s | 1 800 | 900–3 600 | vent, purge, lower booster |

## 5. Contract and window: `src/data/contracts.ts` (MVP contract NRL-3)

| Key | Unit | Default | Range | Rationale |
|---|---|---|---|---|
| window.open | T s | −900 (planned T-0 = open + 15 min) | −1 800–0 | |
| window.duration | s | 5 400 (90 min) | 1 800–7 200 | 75 min of hold possible versus ~31 min of propellant at start (≤ ~66 min with the full standard fleet, §13): **the core tension** |
| payloadMass | kg | 95 000 | 50k–150k | label, feeds flight profile post-MVP |
| price | cr | 62 000 000 | 40M–90M | |
| penalty.windowMissed | cr | 15 000 000 | 10–30 % of price | |
| penalty.payloadLost | cr | 40 000 000 | 50–80 % of price | |
| rebook.delay | s | 86 400 | — | shown in debrief, not played in MVP |

## 6. Flight profile: `src/data/flightProfile.ts` (nominal, interpolated keyframes)

| Event | T+ (s) | Altitude (m) | Speed (m/s) | Booster prop left (kg) | Source / note |
|---|---|---|---|---|---|
| Liftoff | 0 | 0 | 0 | 3 400 000 | |
| Max-Q | 62 | 12 000 | 450 | 2 100 000 | |
| MECO | 155 | 68 000 | 1 550 | 240 000 | MECO ≈ T+2:33, separation ≈ 70–74 km on a real catch flight [S3] |
| Hot staging | 160 | 71 000 | 1 540 | 235 000 | |
| Boostback start / end | 165 / 215 | 74 000 / 85 000 | → 900 (reversed) | 230 000 → 110 000 | boostback ended by ≈ T+3:41 on the reference flight [S3] |
| Booster apogee | 250 | 95 000 | 600 | 108 000 | |
| Ship SECO (contract event) | 515 | 150 000 | 7 300 | — | ship then leaves the scene |
| Landing burn ignition = **catch deadline** | 380 | 1 200 | 280 | 90 000 | |
| Tower catch | 415 | 60 (catch point) | ≤ 1 | 60 000 | catch ≈ T+6:56 [S3] |
| Divert splashdown | 420 | 0 (offshore point, 8 km) | — | — | |

Sim additions (3.6, plausibility only — **game-designer to review**): ground track along `launchHeadingRad` = π/2
(east, over the sea); `downrangeM` per keyframe 0 / 4 000 / 60 000 / 66 000 / 70 000 / 72 000 / 60 000 / 0 / 0
(liftoff … catch); ship SECO `secoDownrangeM` 1 300 000 m and `secoPropKg` 80 000 kg. The booster aims at the
offshore divert point until a CATCH is committed. "Landing propellant" (forced-divert and low-prop σ input) =
predicted booster propellant at landing-burn ignition (90 000 kg nominal − engine-out penalties).

| Key | Unit | Default | Range | Rationale |
|---|---|---|---|---|
| landing.minProp (forced divert below) | kg | 30 000 | 20k–50k | |
| engineOut.ascent.MECOdelay | s | 4 | 2–8 | fewer engines, longer burn |
| engineOut.ascent.landingPropPenalty | kg | 25 000 | 10k–40k | |
| engineOut.boostback.landingPropPenalty | kg | 35 000 | 20k–50k | |
| profile.toleranceMECO / catch | s | 2 / 5 | — | acceptance criterion 16 |

## 7. Catch model: `src/data/catch.ts`

Success if the lateral error *e* ~ N(0, σ) satisfies |*e*| ≤ tol → **p = erf(tol / (σ·√2))**. One seeded roll at the catch event.

| Key | Unit | Default | Range | Rationale |
|---|---|---|---|---|
| arms.tolerance | m | 1.8 | 1.2–2.5 | catch arms close on hardpoints with a few m of play |
| sigma.base | m | 0.6 | 0.4–0.8 | nominal p ≈ 0.997 |
| sigma.perEngineOut | m | 1.0 (§13) | 0.8–1.2 | one out, calm → p ≈ 0.74 |
| sigma.windCoef (above windRef) | m per m/s | 0.15 (§13) | 0.1–0.2 | |
| sigma.windRef (**tower** wind) | m/s | 11 (§13) | 10–13 | ≈ ground 8.5 m/s × towerFactor 1.3: σ only grows in the windier ~28 % |
| sigma.lowProp (prop < lowPropRef) | m | 0.4 | 0.2–0.6 | |
| lowPropRef | kg | 60 000 (§13) | 55k–64k | a boostback engine-out (90 − 35 = 55 t) is low-prop, an ascent one (65 t) is not |
| tower.windLimitCatch (forced divert above) | m/s | 20 | 16–24 | |
| autoCatchThreshold | – | 0.65 (§13) | 0.6–0.75 | policy without player input: never takes a contested call |
| catch.maxVerticalSpeed | m/s | 2 | — | display / assert only (scripted) |

Reference cases (tower wind V<sub>t</sub>; §13): nominal calm 0.997 · nominal V<sub>t</sub> 14.3 0.90 · nominal V<sub>t</sub> 16.9 (ground at the 13 m/s launch limit) 0.78 · ascent engine-out calm 0.74 · ascent EO V<sub>t</sub> 14 0.62 · boostback EO (low prop) calm 0.63 · boostback EO V<sub>t</sub> 14 (σ = 2.45) **0.537** · boostback EO V<sub>t</sub> 16 0.49. Break-even is 0.535 (§9).

**Catch bands** (decision strip label; UI-only thresholds, data in `catch.ts`): CLEAR p ≥ 0.90 · LEAN 0.65–0.90 · **CONTESTED 0.45–0.65** (EV of catch vs divert within ≈ ±10 M cr) · AGAINST < 0.45.

## 8. Weather and anomalies: `src/data/weather.ts`, `src/data/anomalies.ts`

| Key | Unit | Default | Range | Rationale |
|---|---|---|---|---|
| groundWind.mean / sd / tau | m/s, m/s, s | 7 / 2.5 / 1 800 | — | Ornstein–Uhlenbeck, seeded. Onshore, from ~210° |
| upperWind.mean / sd / tau | m/s, m/s, s | 35 / 10 / 3 600 | — | at ~12 km |
| limit.launch.groundWind | m/s | 13 (≈ 25 kn) | 11–16 | typical launch ground wind constraint |
| limit.launch.upperWind | m/s | 60 | 50–75 | shear loads |
| front.probability (per run) | – | 0.35 | 0.2–0.5 | drives A2 |
| front.upperWindBoost / ramp / duration | m/s, s, s | +18 / 1 800 / 2 400–5 400 | — | crosses the limit from mean + 1 sd |
| forecast.errorGrowth | m/s per h of lead | 1.0 | 0.5–2 | radar upgrade halves it (post-MVP) |
| forecast.horizon | s | 10 800 | — | 3 h band on the Range tab |
| A1 rangeFouled.rate | 1/h | 0.12 (window T-02:00:00 → T-0) | 0.05–0.3 | ≈ 22 % per run |
| A1 intruder distance from picket | m | 4 000–12 000 | — | ETA 6–17 min |
| A1 clearAfterIntercept | s | 300 | 120–600 | |
| A2 upperWindSpike | – | = front arrival inside load → T-0 | — | |
| A3 gseLeak.perLoad | – | 0.10 | 0.05–0.2 | |
| A3 fixDuration | s | 1 200 | 600–2 400 | |
| A4 engineOut.perEngine.ascent | – | 6e-4 | 2e-4–1.5e-3 | × 33 ≈ 2.0 % |
| A4 engineOut.perEngine.boostback | – | 1.5e-3 | 5e-4–3e-3 | × 13 ≈ 1.9 % |
| catastrophic.ascent | per flight | 0.004 | 0.001–0.01 | base only, never scheduled by the director |
| marginalRiskMultiplier | – | 2.0 | 1.5–3 | GO on MARGINAL → category probabilities × 2 |
| director.guaranteeOne | bool | true (MVP) | — | |
| director.deadline | T s | −1 800 | — | if no anomaly yet, schedule one |
| director.weights A1/A2/A3/A4 | – | 0.30 / 0.25 / 0.20 / 0.25 | — | A3 only if the load has not finished; renormalise |

All failure probabilities are multiplied by `wear.reliabilityFactor` (booster) and by `marginalRiskMultiplier` when relevant.

## 9. Economy: `src/data/economy.ts`

| Key | Unit | Default | Range | Rationale |
|---|---|---|---|---|
| startMoney | cr | 30 000 000 | — | |
| startReputation | 0–100 | 50 | — | |
| price.LOX | cr/kg | 0.15 | 0.08–0.3 | bulk industrial LOX is cheap |
| price.CH4 | cr/kg | 0.50 | 0.3–0.8 | LNG |
| → propellant per flight | cr | ≈ 1.1 M | derived | |
| ship.expendedCost (MVP) | cr | 20 000 000 | 10M–30M | dominates flight cost |
| booster.replacementCost | cr | 40 000 000 | 30M–60M | divert or loss |
| booster.refurbNominal | cr, s | 1 500 000, 259 200 (72 h) | — | |
| tower.repairCost | cr | 25 000 000 | 15M–40M | |
| tower.repairDowntime | s | 1 814 400 (21 d) | 7–60 d | |
| ops.costPerDay | cr | 1 000 000 | 0.5M–2M | prices downtime |
| reputation: success / miss / payload loss / tower damage | pts | +8 / −10 / −30 / −15 | — | |

**Catch break-even**: failed catch = booster 40 M + tower 25 M + 21 d × 1 M = 86 M. Divert = 40 M. Catch is better if (1 − p) · 86 < 40 → **p > 0.535**. Keep this near 0.5–0.6 whenever any of these numbers change.

Nominal flight P&L: +62 M − 20 M (ship) − 1.1 M (prop) − 1.5 M (refurb) − ~0.3 M ops ≈ **+39 M**. Divert ≈ −1 M. Failed catch ≈ −47 M. Window miss ≈ −15 M − propellant lost.

## 10. Time: `src/data/time.ts`

| Key | Unit | Default | Rationale |
|---|---|---|---|
| rates | × | 0, 1, 10, 100 + skip-to-milestone | 100× runs 6 h of prep in ~3.6 min of real time |
| maxRate by phase | × | see GDD §6 | |
| force1x.until | s after catch/divert | 30 | |
| uiProjection.maxAge | s | 0.25 | acceptance criterion 17 |
| sim dt | s | *architect's call* (ADR) | must not change with the rate |

## 11. Known balance concerns

1. **Cash is a weak lever in the MVP.** Real propellant and haulage are tiny next to a 62 M contract, so D1's real tension is *timing* (lead time versus road closure) and *hold capacity*, not money. Rush fees are inflated to register in the debrief. In the campaign, daily ops cost and an expansion budget make cash bite.
2. **The hold window (75 min) versus propellant margin (~31 min at start, §13)** is the main dial. If playtests show players always scrub or always go, tune `MVP start farm LOX/CH4` and `vehicle.boilOff` first.
3. **Anomaly frequency without the director** is ~45 % per run. The director makes it 100 % in the MVP. Revisit for the campaign.
4. Rounded figures: no real vehicle is replicated. Prefer round numbers that are easy to read on the HUD.

## 12. Sim additions for game-designer review (Phase 3.7–3.10)

Numbers the sim needed that this document did not specify. Each lives in `src/data/*` with a "Sim addition" comment.

| Key (file) | Value | Why |
|---|---|---|
| `weather.groundWind.gustFactor` | 1.25 | gust-inclusive ground wind for the stack / transporter limits |
| `weather.groundWind.towerFactor` | 1.3 | catch-arm wind (tower top) for the catch model |
| `weather.front.arrivalEarliestTS / LatestTS` | −21 600 / +4 500 | natural front arrival band (scenario start → window close) |
| `logistics.picketPatrolSpeedMPerS` | 5 | PICKET cruise on patrol (intercepts use 12 m/s) |
| `anomalies.A1.escortSpeedMPerS` | 4 | UNK-01 escorted out for `clearAfterIntercept` |
| `anomalies.A3.onsetLoadFractionMin / Max` | 0.05 / 0.6 | leak starts at a booster-LOX load fraction (always during the load) |
| `anomalies.A4.ascentWindowS` | 10–150 s | ascent engine-out timing |
| `anomalies.A4.directorAscentShare` | 0.5 | director A4: ascent vs boostback |
| `anomalies.director.a2EarliestTS` | −4 500 | director front earliest at load start |
| `anomalies.marginalCategories` | WEATHER, VEHICLE → A4 | "matching category" of GDD §7.1 |
| `countdown.crew.vanDepartTS / vanStaggerS` | −5 400 / 30 | crew vans clear the pad before T-01:20:00 |
| `countdown.stationHysteresisFraction` | 0.03 | station deadband (no GO ⇄ MARGINAL flicker) |
| `countdown.stationSampleS` | 0.1 | stations evaluated at 10 Hz |
| `vehicles.healthLossPerWear` | 0.5 | VEHICLE health = 1 − 0.5·wear (B-09 = 0.89, GO) |
| `logistics.windLimit.resumeMarginMPerS` | 0.5 | a wind-paused stack / transporter resumes 0.5 m/s under the limit |
| `anomalies.director.windowCloseLeadS` | 1 800 | director fallback also 30 min before the window closes (count frozen at a poll) |

**Review status (balancing pass 1, §13)**: all additions above are **accepted as is**, except
`weather.groundWind.towerFactor` (kept at 1.3, now paired with a tower-wind `sigmaWindRefMPerS`) and
`vehicles.wear.highWindCatchAboveMPerS` (10 → 11). Flag 1 → **resolved** (§13.1). Flag 4 → **resolved** (§13.2).
Flags 2 and 3 → **accepted as deferred** (catastrophic failure and lightning stay unsimulated in the MVP; GDD §13.4).

**Flagged** (resolved in §13, kept for history):
1. **Hold margin is ~13 min, not ~38 min.** With the MVP start farm the sim leaves ≈ 31 t LOX / 6 t CH4 usable at T-0
   after a nominal load (the "88 t" above omits the loaded-vehicle boil-off during the 44-min load, ≈ 51 t LOX). Hence
   PROPELLANT starts MARGINAL. The golden autopilot orders 3 LX + 1 MX standard deliveries, which restores ≈ 39 min.
   To restore the design intent without orders: farm LOX ≈ 4 210 000 kg, CH4 ≈ 1 152 000 kg.
2. Catastrophic ascent failure (`catastrophicAscentPerFlight`) is kept in data but not simulated yet.
3. Lightning (GDD §4.10) has no numbers here and is not simulated.
4. **The auto catch policy diverts often**: in the 200-run hands-off sweep (QA.md) 82 of 188 flights diverted. Tower
   wind = 1.3 × ground wind sits above `sigma.windRef` (8 m/s) most of the time, so p < 0.90 whenever ground wind
   exceeds ~9.3 m/s or an engine is out. Consider windRef 10 or towerFactor 1.15 if the auto policy should mostly catch.

## 13. Balancing pass 1 (post-Phase 3)

Resolves §12 flags 1 and 4 and the AC 3 no-input case. Data-only changes; no system logic changes. Hold-minute
figures use the PROPELLANT station's own estimate (`propellantReserve().holdS`: usable farm − remaining load −
boil-off during the load − topping to T-0, divided by the topping rate). Topping = 38.3 kg/s LOX (2.30 t/min) and
7.1 kg/s CH4 (0.43 t/min); one LX truck = +8.7 min, one MX truck = +37 min.

| Tunable (`file` → key) | Old | New | Unit | Rationale | Expected effect |
|---|---|---|---|---|---|
| `propellant.ts` → `mvpStart.farmLoxKg` | 4 150 000 | **4 190 000** | kg | the "88 t" design figure forgot boil-off during the load (≈ 51 t). 31 min covers one typical hold (A3 fix 20 min, or A1 at 11–22 min) but not two, nor a front | LOX reserve at T-0 ≈ 71 t ≈ **31 min**; PROPELLANT opens **MARGINAL** (intended: it is the D1 prompt) |
| `propellant.ts` → `mvpStart.farmCh4Kg` | 1 140 000 | **1 155 000** | kg | CH4 binds *second*, so LOX is the readable main dial and an LOX-only order meets a CH4 wall | CH4 reserve ≈ 21 t ≈ **49 min** |
| `catch.ts` → `sigmaWindRefMPerS` | 8 | **11** | m/s | the reference was written for ground wind but the model feeds **tower** wind (1.3 × ground). 11 m/s tower ≈ 8.5 m/s ground ≈ 72nd percentile | nominal flights: σ grows only in the windy tail |
| `catch.ts` → `sigmaWindCoefMPerMPerS` | 0.12 | **0.15** | m per m/s | keeps wind a real driver once above the reference | nominal p = 0.90 at tower 14.3 m/s (ground 11, ~5 % of flights); floor ≈ 0.78 at the 13 m/s launch limit |
| `catch.ts` → `sigmaPerEngineOutM` | 0.9 | **1.0** | m | an engine-out must make the call visibly risky in every wind | ascent EO calm p ≈ 0.74, at tower 14 m/s ≈ 0.62 |
| `catch.ts` → `lowPropRefKg` | 50 000 | **60 000** | kg | with 50 t no single engine-out ever triggered the low-prop term (landing prop 65 t / 55 t), so the "+ low prop" reference case was unreachable | **boostback** EO (55 t) is low-prop: p 0.63 calm → **0.537 at tower 14 m/s** (on break-even) → 0.49 at 16 m/s. Ascent EO (65 t) is not |
| `catch.ts` → `autoCatchThreshold` | 0.90 | **0.65** | – | rule: *the flight computer never takes a contested call for you*. 0.65 is the top of the CONTESTED band (EV catch − divert = 86p − 46 M cr ≈ +10 M); below it a human must decide, else divert (protects the irreversible asset). Above it, catching is clearly EV-positive | hands-off diverts drop from 44 % to **≈ 15–25 %** (essentially the contested flights) |
| `vehicles.ts` → `wear.highWindCatchAboveMPerS` | 10 | **11** | m/s | "high wind" = the wind that also raises σ (same reference) | cosmetic: slightly fewer high-wind wear hits |
| `weather.ts` → `groundWind.towerFactor` | 1.3 | 1.3 (kept) | – | power law from 10 m to the ~145 m arms with α ≈ 0.1 gives 1.31; physically right, so the fix goes into the σ reference instead | — |
| `weather.ts` → `groundWind.gustFactor` | 1.25 | 1.25 (kept) | – | accepted | — |
| `catch.ts` (new, UI only) → `bands` | — | CLEAR ≥ 0.90 · LEAN ≥ 0.65 · CONTESTED ≥ 0.45 · AGAINST | – | decision-strip label (§7); not read by the sim | — |

Break-even is unchanged at 0.535 (economy untouched; `scenarios.test.ts` asserts it).

### 13.1 Hold margin and D1 (finding 1)
Design answer: **start lean on purpose** (~31 min, MARGINAL) so D1 is always presented and always has a price in time.
D1 ladder (standard orders placed by T-04:40:00 arrive by T-02:00:00, before the T-00:40:00 road closure):

| Orders | LOX min | CH4 min | Binding | PROPELLANT at load poll |
|---|---|---|---|---|
| none | 31 | 49 | LOX 31 | MARGINAL |
| 3 LX + 1 MX (golden / hands-off autopilot) | 57 | 86 | 57 | MARGINAL |
| 4 LX only | 66 | 49 | CH4 49 | MARGINAL |
| **4 LX + 1 MX** (whole standard LX fleet) | 66 | 86 | 66 | **GO** (> 61.8 min incl. hysteresis) |
| 4 LX + 2 rush LX + 1 MX | 83 | 86 | 83 | GO; covers the full 75-min hold budget |

The tension is **information vs lead time**, not cash: the 3 h forecast only covers the launch window from ≈ T-03:00:00,
after the standard-order cutoff (T-04:40:00). So the player either buys a blind hedge with standard trucks, or waits
for the forecast and pays 20× for rush (cutoff T-02:10:00). Only rush beyond the 4-truck LX fleet can cover a full
75-min hold. Cash stays a weak lever (§11.1, GDD §14 risk 5).

### 13.2 Catch call and D3 (finding 2)
Target distribution of p (tower wind ~ N(9.1, 3.25) m/s; launch needs ground ≤ 13 m/s):

| Flight class | CLEAR ≥ 0.90 | LEAN 0.65–0.90 | CONTESTED 0.45–0.65 | AGAINST < 0.45 |
|---|---|---|---|---|
| nominal (no engine-out) | ≥ 93 % | ≤ 7 % | ≈ 0 % | 0 % |
| ascent engine-out | 0 % | ≈ 89 % (0.65–0.74) | ≈ 11 % (tower > 13.1 m/s) | 0 % |
| boostback engine-out (low prop) | 0 % | 0 % | ≈ 99 % | < 1 % (tower > 17.7 m/s) |
| all hands-off flights (≈ 35 % have an EO, mostly via the director) | ≈ 60 % | ≈ 20 % | **≈ 18–20 %** | < 1 % |

D3 is a confirmation without anomaly, a "lean catch with visible risk" after an ascent engine-out, and a real
coin-flip after a boostback engine-out (the later failure is worse: less propellant to correct). Wind alone never
creates a contested call: the launch wind limit puts a floor under nominal p. Hands-off now catches the LEAN cases,
so it will lose some: expect **≈ 3–7 % failed catches** under hands-off, all of them ascent-EO catches at p 0.65–0.74.
That is the price of an EV-sane default, and it shows on the debrief.

### 13.3 AC 3 no-input case (finding 3)
Design answer: **reword AC 3, keep the director unchanged.** With no input at all nothing is rolled out or stacked,
so there is no load and no flight: A2–A4 are unreachable by construction, and the load poll waits on MARGINAL
PROPELLANT. A director that fired anomalies into an empty pad would be spectacle without a decision. The anomaly
guarantee is therefore measured under the scripted **hands-off** policy, and the no-input run becomes a robustness
clause (still ≥ 1 anomaly via the existing fallback, clean auto-scrub, no hang). New text: GDD §13.3 AC 3.

### 13.4 Expected sweep outcomes (`npx tsx scripts/sim/anomaly-sweep.ts 200`) and checks to verify
| Check | Before | Target after pass 1 |
|---|---|---|
| PROPELLANT `holdS` at the scenario start, no orders | ≈ 13 min (LOX) | **31 ± 2 min** LOX (CH4 49 ± 3), status MARGINAL, driver `FARM_RESERVE_LOX` |
| Same after the autopilot's 3 LX + 1 MX have offloaded | ≈ 39 min | **57 ± 2 min**, still MARGINAL (golden log: the load-poll GO stays `MARGINAL PROPELLANT`) |
| `hands-off`: runs with ≥ 1 anomaly | 200 / 200 | 200 / 200 |
| `hands-off`: anomaly shares vs 30 / 25 / 20 / 25 | 33.6 / 22.3 / 20.4 / 23.7 | each within ±10 pts (expect ≈ unchanged) |
| `hands-off`: diverted / flights | 82 / 188 (44 %) | **15–25 %** (≈ 28–47 of ~190), none from wind alone |
| `hands-off`: failed catches / flights | 1 / 188 | **3–7 %** |
| `hands-off`: scrubbed runs | 12 | ≤ 12 (more hold margin) |
| `none`: runs with ≥ 1 anomaly / outcome | 200 / 200, all scrubbed, A1 only | unchanged: 200 / 200 with ≥ 1 anomaly, all scrubbed with the window-missed penalty, each reaches Debrief |
| Golden seed 42 | CAUGHT, p 0.997 | still CAUGHT (no EO, calm). Diff expected only in farm levels / PROPELLANT `value`; regenerate with that explanation |
| Unit tests to retarget | — | `range.test.ts` "MVP start: MARGINAL on LOX" stays valid; any test asserting 0.90 auto policy or the old σ reference cases moves to the §7 cases |

## Sources (brief)
- [S1] Widely reported public specs for the super-heavy methalox class (booster ~3 400 t, ship ~1 200–1 500 t of propellant). Not re-verified in this pass; used as order of magnitude only.
- [S2] Teslarati reporting on the Starbase tank farm: ~5 400 t of LOX in the main tanks — https://teslarati.com/spacex-starship-orbital-launch-site-propellant-delivery
- [S3] Starship flight test 5 (Oct 2024): MECO ≈ T+2:33, separation ≈ 74 km, boostback end ≈ T+3:41, catch ≈ T+6:56 — https://en.wikipedia.org/wiki/Starship_flight_test_5 ; https://thespacebucket.com/what-exactly-happened-on-starships-fifth-launch-attempt/
- [S4] NASA NTRS, Shuttle-era cryogen trucking: LOX tankers ≈ 19 000 L — https://ntrs.nasa.gov/api/citations/20110014378/downloads/20110014378.pdf
