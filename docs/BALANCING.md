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
| ambientTransporter.dwellYard (SP-42) | s | 240 | 0–600 | ambient duty yard bay ⇄ tank-farm apron (1 220 m, `speedEmpty` both ways); a dwell is only taken while another tanker / transporter moves (AC 26) |
| ambientTransporter.dwellFarm (SP-42) | s | 300 | 0–600 | both dwells **kept** in pass 7.5 (§15.4): cycle 1 760 s, moving 69 % of it |
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
| autoGoAtPoll (7.5b, was `autoGoWhenAllGreen` true) | bool per poll | load true · terminal true · **final false** | — | removes busywork; MARGINAL always asks; the final poll always asks for the launch director's GO (GDD §15 q6, user yes) |
| marginalBand | – | 0.15 | 0.1–0.25 | MARGINAL = within 15 % of a limit |
| stationHysteresisFraction (sim addition 3.7) | – | **0.05** (was 0.03; applied 7.5b, §15 P4) | 0.02–0.08 | deadband before a station improves; 0.03 of the 60 m/s upper limit (1.8 m/s) is re-crossed within a minute by the upper-wind series |
| milestones (skip stops) | T s | STANDARD_ORDER_LAST_CALL −17 100, FORECAST_SEES_WINDOW −11 700, RUSH_ORDER_LAST_CALL −8 100 (derived, applied 7.5b, §15 P2), ROAD_CLOSURE, TERMINAL_FORCE_1X, ENGINE_IGNITION, LIFTOFF | — | D1 is advisory and must not be skipped over |
| orderLastCallLeadS (7.5b) | s | 300 | 120–600 | the two order last-call stops sit this long before the last order that still beats the road closure |
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
| Liftoff | 0 | 20 (mount deck) | 0 | 3 400 000 | altitudes = booster origin above site ground (5.0b): on OLM-1 it sits on the 20 m mount |
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

Eased liftoff (sim addition 5.10, `flightProfile.liftoff` — **game-designer to review**): the LIFTOFF → MAX_Q segment
is no longer a straight line (it left the mount at ≈ 190 m/s). Vertical acceleration a(t) = a0 + j·t from rest, j solved
so the Max-Q keyframe (12 000 m at T+62 s) is met exactly; downrange stays 0 through the vertical rise (8 s) then grows
∝ u² to 4 000 m; speed = |velocity| scaled to meet 450 m/s at Max-Q. Every keyframe (time and value) is unchanged, so
MECO (T+155 s, 68 km) and the catch (T+415 s) do not move.

| Key | Unit | Default | Range | Rationale |
|---|---|---|---|---|
| liftoff.accel (a0) | m/s² | 4.5 | 3.9–4.9 | T/W ≈ 1.46 off the mount; derived jerk j ≈ 0.084 m/s³ → a ≈ 9.7 m/s² at Max-Q as propellant burns off |

Resulting profile (booster origin above ground / speed): T+1 s 22 m / 4.4 m/s · T+3 s 41 m / 13 m/s · tower tip (146 m)
cleared at **T+7.3 s** · T+8 s 171 m / 38 m/s · T+20 s 1 030 m / 108 m/s · Max-Q 12 000 m / 450 m/s.

Throttle (sim addition 5.10, `flightProfile.throttle` — **review**; cosmetic: render plume only, kinematics are scripted):

| Key | Unit | Default | Range | Rationale |
|---|---|---|---|---|
| throttle.ascent / boostback / ship | 0–1 | 1 / 1 / 1 | — | full thrust |
| throttle.maxQBucket | s, s, s, 0–1 | T+52 → T+72, 4 s ramps, 0.8 | 0.6–0.9 | readable throttle-down through Max-Q |
| throttle.landingStart → landingEnd | 0–1 | 1 → 0.4 | 0.3–0.6 | landing burn throttles down toward the catch |

Attitude program (sim addition 5.0b, `flightProfile.attitude` — **game-designer to review**): tilt from vertical,
rate-limited toward a target per phase.

| Key | Unit | Default | Range | Rationale |
|---|---|---|---|---|
| attitude.verticalRise | s | 8 | 5–15 | clear the tower before pitching over |
| attitude.ascentRate (pitch-over, ship) | °/s | 1 | 0.5–2 | reaches the 18.5° first-segment climb angle by ≈ T+27 s, 45° ≈ 26 s after Max-Q |
| attitude.flipRate | °/s | 15 | 10–25 | ≈ 9 s boostback flip |
| attitude.boostbackTilt | ° | −75 | −60 … −95 | nose back toward the site, a little above horizontal (boostback still climbs) |
| attitude.entryRate | °/s | 3 | 2–5 | entry reorientation; upright well before the catch |

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
| autoCatchThreshold | – | **0.65** (applied 7.5b, §15 P3; was 0.70, §13.5) | 0.6–0.75 | policy without player input: never takes a contested call; at 0.65 it equals the LEAN floor, so the band word predicts AUTO |
| catch.maxVerticalSpeed | m/s | 2 | — | display / assert only (scripted) |

Reference cases (tower wind V<sub>t</sub>; §13): nominal calm 0.997 · nominal V<sub>t</sub> 14.3 0.90 · nominal V<sub>t</sub> 16.9 (ground at the 13 m/s launch limit) 0.78 · ascent engine-out calm 0.74 · ascent EO V<sub>t</sub> 14 0.62 · boostback EO (low prop) calm 0.63 · boostback EO V<sub>t</sub> 14 (σ = 2.45) **0.537** · boostback EO V<sub>t</sub> 16 0.49. Break-even is 0.535 (§9).

**Catch bands** (decision strip label; UI-only thresholds, data in `catch.ts`): CLEAR p ≥ 0.90 · LEAN 0.65–0.90 · **CONTESTED 0.45–0.65** (EV of catch vs divert within ≈ ±10 M cr) · AGAINST < 0.45.

## 8. Weather and anomalies: `src/data/weather.ts`, `src/data/anomalies.ts`

| Key | Unit | Default | Range | Rationale |
|---|---|---|---|---|
| groundWind.mean / sd / tau | m/s, m/s, s | 7 / 2.5 / 1 800 | — | Ornstein–Uhlenbeck, seeded. Onshore, from ~210° |
| windDirection.sd / tau / clamp (sim addition 5.10, **review**) | rad, s, sd | 15° (0.262) / 2 700 / ±3 sd | sd 10–25° | ground wind direction: OU deviation around `groundWind.fromDeg` (210°) on rng stream `wind`; meteorological "from" bearing, clockwise from north. Cosmetic for now (steam / plume drift); no limit reads it |
| upperWind.mean / sd / tau | m/s, m/s, s | 35 / **8** / 3 600 (applied after 7.5b, §15.6; was 10) | sd 7–10 | at ~12 km |
| limit.launch.groundWind | m/s | 13 (≈ 25 kn) | 11–16 | typical launch ground wind constraint |
| limit.launch.upperWind | m/s | 60 | 50–75 | shear loads |
| front.probability (per run) | – | 0.35 | 0.2–0.5 | drives A2 |
| front.upperWindBoost / ramp / duration | m/s, s, s | +18 / 1 800 / **2 400–3 600** (applied 7.5b, §15 P1; was 2 400–5 400) | durationMax 3 000–4 500 | crosses the limit from mean + 1 sd; a plateau ≤ 60 min keeps a typical front inside the 75-min hold budget |
| forecast.errorGrowth | m/s per h of lead | 1.0 | 0.5–2 | radar upgrade halves it (post-MVP) |
| forecast.horizon | s | 10 800 | — | 3 h band on the Range tab |
| A1 rangeFouled.rate | 1/h | 0.12 (window T-02:00:00 → T-0) | 0.05–0.3 | ≈ 22 % per run |
| A1 intruder distance from picket | m | 4 000–12 000 | — | ETA 6–17 min |
| A1 clearAfterIntercept | s | 300 | 120–600 | |
| A2 upperWindSpike | – | = front arrival inside load → T-0 | — | |
| A3 gseLeak.perLoad | – | 0.10 | 0.05–0.2 | |
| A3 fixDuration | s | 1 200 | 600–2 400 | |
| A3 decisionTimeoutS (`anomalies.A3.decisionTimeoutS`, **new 6.0**, implemented 6.8) | s | 300 | 120–600 | D3b deadline = min(onset + this, window close); no answer → DEGRADED by AUTO (GDD §13.2.1). 300 s = 30 s real at the 10× load cap, a quarter of a fix, short enough not to hide a queued D2 for long |
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
| holdMaxTimeScale | × | 10 | cap while holding before T-00:03:00: holds stay compressible, so the drain is felt but a 14 min hold costs ~84 s real |
| dropTriggers (app, `src/app/time/rules.ts`) | — | blocking decision opens (D2 via POLL / NO_GO / LOAD_INCOMPLETE hold, D3, D3b) · station → NO-GO · last non-GO station → GO while holding | one-shot reset of the *requested* rate to 1× (GDD §6 cap vs drop). D1 and player-started holds (MANUAL, LEAK_FIX) never drop |
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
| `countdown.stationHysteresisFraction` | 0.05 (0.03 until 7.5b) | station deadband (no GO ⇄ MARGINAL flicker) |
| `countdown.stationSampleS` | 0.1 | stations evaluated at 10 Hz |
| `vehicles.healthLossPerWear` | 0.5 | VEHICLE health = 1 − 0.5·wear (B-09 = 0.89, GO) |
| `logistics.windLimit.resumeMarginMPerS` | 0.5 | a wind-paused stack / transporter resumes 0.5 m/s under the limit |
| `anomalies.director.windowCloseLeadS` | 1 800 | director fallback also 30 min before the window closes (count frozen at a poll) |
| `logistics.ambientTransporter.dwellYardS / dwellFarmS` (7.3) | 240 / 300 | SP-42 ambient duty dwells (game feel; cut short when nothing else moves, so AC 26 holds) |

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

### 13.5 Verification and applied deviations (simulation-engineer, 2026-10-18)
All §13 values applied as written, except one. The σ model already fed tower wind; only its reference moved (8 → 11).

| Tunable | Designer value | **Applied value** | Reason |
|---|---|---|---|
| `catch.ts` → `autoCatchThreshold` | 0.65 | **0.70** | at 0.65 the hands-off sweep diverted 27 / 193 = **14.0 %** (< 15 %). The seed set has fewer contested flights than the §13.2 estimate: 33 % of flights have an EO (64 / 193; 24 boostback, 37 ascent, 3 double), and ascent-EO tower winds sit mostly under 11 m/s, so ascent EO is a mass point at p 0.739. 0.70 is the only single-number change inside the listed ranges that meets every target: it adds the low-LEAN ascent EO calls (p 0.66–0.70) to the auto-divert set, still never diverts on wind alone, and keeps "never takes a contested call" (it is stricter). Alternatives checked offline on the same flights: threshold 0.68 → 15.0 % (on the edge); `sigmaPerEngineOutM` 1.2 → 15.5 % but 7.8 % failed; `sigmaWindRefMPerS` 10 → 15.0 % but 8.3 % failed; `sigmaWindCoefMPerMPerS` 0.17–0.2 → ≤ 15 % and a wind-only divert. UI bands stay CLEAR 0.90 / LEAN 0.65 / CONTESTED 0.45 |

Measured (§13.4 checks):

| Check | Target | Measured |
|---|---|---|
| PROPELLANT `holdS` at start, no orders | 31 ± 2 min LOX, CH4 49 ± 3, MARGINAL `FARM_RESERVE_LOX` | **31.4 min** LOX (72 t), CH4 **49.6 min** (21 t), MARGINAL `FARM_RESERVE_LOX` |
| After 3 LX + 1 MX offloaded (load poll) | 57 ± 2 min, MARGINAL | **56.7 min** LOX (CH4 86.4 min), MARGINAL; golden load poll `marginal=[PROPELLANT]` |
| `hands-off` runs with ≥ 1 anomaly | 200 / 200 | **200 / 200** |
| `hands-off` shares vs 30 / 25 / 20 / 25 | ±10 pts | 33.3 / 22.1 / 20.3 / 24.3 |
| `hands-off` diverted / flights | 15–25 %, none from wind alone | **30 / 193 = 15.5 %** (29 auto, 1 forced); 0 diverted at commit-time p ≥ 0.70; 0 nominal-flight auto diverts |
| `hands-off` failed catches | 3–7 % | **11 / 193 = 5.7 %** (all ascent-EO LEAN catches) |
| `hands-off` scrubbed runs | ≤ 12 | **7** |
| `none` | 200 / 200, all scrubbed, reach Debrief | **200 / 200** with ≥ 1 anomaly (A1), 200 scrubbed |
| Golden seed 42 | still CAUGHT | CAUGHT, p 0.997 (commit-time p was 0.995 before: tower wind ≈ 11 m/s is now at the σ reference) |

Note: the 15.5 % divert share is close to the lower bound; a later change to the weather or A4 timing could push it
under. The sweep script now fails on any AC 3c miss, so that will show up.

## 14. Tower mechanisms: `src/data/tower.ts` (5.0)

Geometry mirrors the Blender scripts (ASSETS_GUIDE TOWER / PAD / BOOSTER / SHIP sockets): carriage travel 25–135 m,
rest 86 m; arms open ±40°; QD hinge 100 m, engaged 90°; mount deck 20 m; booster catch pins 66 m, ship lift pins
44 m above their origins. Derived carriage heights: booster stack **86 m**, ship stack **135 m**, catch **126 m**.
QD keep-out band **92–106 m** (ASSETS_GUIDE operational rule).

**Sim additions 5.0 — game-designer to review** (cosmetic: no balance effect, the stack task timers are unchanged and
the catch outcome does not read them):

| Key | Value | Unit | Why |
|---|---|---|---|
| `tower.carriage.speedMPerS` | 1 | m/s | hoist: rest → ship stack (49 m) in 49 s, ship stack → catch (9 m) in 9 s, well inside the 35 s between the last possible CATCH commit (landing burn) and the catch |
| `tower.arms.rateRadPerS` | 8°/s (0.1396) | rad/s | 40° open ⇄ closed in 5 s, readable from the default camera |
| `tower.qdArm.rateRadPerS` | 9°/s (0.1571) | rad/s | 90° in 10 s; stowed by T+00:00:10 after the liftoff retract |

## 15. Playtest pass 7.5 (2026-10-21)

Inputs: `npx tsx scripts/sim/playtest.ts 7,42,1234` (scenario `mvp`, three policies) and a 40-seed outcome sweep
(seeds 0–39, standard vs hedger). Policies: **standard** = `STANDARD_AUTOPILOT` (3 LX + 1 MX standard, GO at every
releasable hold, leak HOLD_FIX, catch if *p* beats the 0.535 break-even); **frugal** = no orders, leak DEGRADED, catch
left to the auto policy; **hedger** = 4 LX + 2 MX rush, HOLD_FIX, catch call. They are scripts: they show the payoff
structure, not how a human feels it. Risk statuses live in GDD §14; design calls in GDD §14.1.

### 15.1 Findings

| Seed | standard | frugal | hedger |
|---|---|---|---|
| 7 | SCRUBBED −15.54 M · hold 135 min · 7 NO-GO holds | SCRUBBED −15.50 M · hold 148 min | SCRUBBED −16.24 M · hold 92 min |
| 42 (A3) | CAUGHT +40.17 M · HOLD_FIX 20 min · *p* 0.997 | CAUGHT +40.22 M · DEGRADED → LOAD_INCOMPLETE hold 8.4 min | CAUGHT +39.46 M |
| 1234 (A4) | CAUGHT +40.18 M · player *p* 0.739 | **DIVERTED +1.72 M** · AUTO at *p* 0.688 | CAUGHT +39.48 M |

40 seeds: standard and hedger give **identical** outcome sets: 34 CAUGHT, 4 CATCH_FAILED, 2 SCRUBBED (seeds 7 and 17,
WEATHER NO-GO holds from T-01:18:00 until the window closes; seed 7 also fires A1 at the close).

- **F1 · D1 never changes an outcome** (risk 5). The full rush hedge costs 0.70 M more (haulage −0.72 M vs −0.02 M),
  1.8 % of a +40 M flight, and buys nothing in 40 seeds. The standard order (57 hold-min) is never exhausted.
- **F2 · Hedging removes decisions** (new risk 7). With PROPELLANT GO, all-green polls auto-pass: the hedger's seed-1234
  run opened one decision (D3) against four for standard.
- **F3 · Skip jumps D1** (risk 1). The stretch T-06:00:00 → T-01:20:00 (280 min of sim) has no blocking beat. That is
  only 2.8 min real at 100×, but the next skip mark after scenario start is the load poll, so one SKIP passes the
  standard cutoff (T-04:40:00), the moment the 3 h forecast covers the window (T-03:15:00) and the rush cutoff
  (T-02:10:00) without a stop. D1 is advisory and never interrupts a skip.
- **F4 · Weather scrubs have no agency, and the hold flickers** (risks 3, 9). In seed 7 the T-clock advanced 20 min in
  155 min: seven NO-GO holds, each released into seconds or minutes of count, ≈ 14 one-shot drops to 1× (NO-GO + GO
  possible) and seven GO presses with no real choice. The holds sit at T-01:18:00, **before the load starts**
  (T-01:15:00), so no topping drains the farm: margin cannot buy anything, only the 75-min window counts, and it is not
  enough. The long NO-GO can only come from a front plateau (up to 90 min, plus ramps), not from the base series
  (ground 7 ± 2.5 m/s vs 13; upper 35 ± 10 m/s vs 60).
- **F5 · Failed catches at ≈ 10 % under the EV rule are the honest price** (risk 2). 4 / 38 flights. Expected:
  ascent engine-out ≈ 19 % of flights × (1 − 0.74) ≈ 5.0 % + boostback engine-out ≈ 12 % × (1 − ≈ 0.57) ≈ 5.3 % ≈
  10.5 %. Hands-off (AUTO 0.70) is 5.7 % because it diverts the contested ones. No tuning wanted: lowering it turns D3
  into a formality.
- **F6 · AUTO diverted a LEAN call** (new risk 8). Seed 1234 frugal: *p* 0.688 at the deadline, EV(catch) − EV(divert) =
  86·*p* − 46 = **+13.2 M**, realised −38.5 M against the player's catch. 0.70 was set to hit the 15 % AC 3c estimate
  (§13.5), not by the rule; the strip shows LEAN while AUTO diverts, and DESIGN_SYSTEM §6.28 already prints
  `catch if p ≥ 0.65`.
- **F7 · D3b holds up.** DEGRADED cost 8.4 min of LOAD_INCOMPLETE hold vs 20 min for HOLD_FIX, same outcome; its price
  is VEHICLE MARGINAL → ×2 on A4 (≈ +5.6 points of engine-out probability at B-09's wear, ≈ 1.5 M of EV). Fix when you
  have margin, degrade when lean: a real trade-off. No change.
- **F8 · *p* drifts while D3 is open** (0.739 at T+03:39 → 0.688 at T+06:24, seed 1234): committing early vs waiting is a
  small decision of its own. No change; the strip must keep *p* live (it is projected).

### 15.2 Ranked data changes (for simulation-engineer)

All inside documented ranges (P4's range is new: the key had none). Apply in the order **P3 → P2 → P4 → P1**, one
commit each, sweeping after P4 and after P1 so the two weather effects can be told apart.

| Rank | `file` → key | Current → proposed | Why (risk) | Expected effect | Verify |
|---|---|---|---|---|---|
| **P1** | `weather.ts` → `front.durationMaxS` | 5 400 → **3 600** s (`durationMinS` 2 400 kept) | F1 + F4 (risks 5, 9). With base upper wind ≤ mean + 1 sd (45 m/s) a front is above 60 m/s only on the plateau plus ≈ 5 min of each ramp: ≤ 60 + 10 = **70 min**, inside the 75-min hold budget (today up to 100 min). A front during the load (A2) costs topping (2.3 t/min LOX), so a 50–70 min loaded hold lands **across the D1 ladder** (lean 31 / standard 57 / full fleet 66 / + rush 83 min): margin decides it | weather scrubs 5 % → **≤ 2 %** (standard); pre-load fronts become out-waitable; loaded fronts separate the policies: scrubs frugal > standard ≥ hedger. A2 share unchanged (arrival rule untouched) | **Step 0**: log the WEATHER driver and value through the holds of seeds 7 and 17; if it is `GROUND_WIND`, stop and report (P1 does not address it). Then the outcome sweep, seeds 0–199 × standard / frugal / hedger, and `anomaly-sweep.ts 200` |
| **P2** | `countdown.ts` → `milestones` (+ new `orderLastCallLeadS`) | 4 marks → **7**: prepend, ascending, `STANDARD_ORDER_LAST_CALL` = `logistics.roadClosureStartTS − logistics.delivery.standard.leadTimeS − orderLastCallLeadS` = **−17 100** (T-04:45:00) · `FORECAST_SEES_WINDOW` = `mvpContract.windowOpenTS − weather.forecast.horizonS` = **−11 700** (T-03:15:00) · `RUSH_ORDER_LAST_CALL` = `roadClosureStartTS − delivery.rush.leadTimeS − orderLastCallLeadS` = **−8 100** (T-02:15:00); `orderLastCallLeadS` = **300** s (range 120–600) | F3 (risk 1), F1 (risk 5: the forecast stop is the informed-rush moment). Data-only: `src/app/time/rules.ts` already turns every data milestone into a skip stop and prints its name with spaces | longest stop-less stretch before the load poll 280 → **90 min** of sim (75 / 90 / 60 / 55); a SKIP from scenario start stops at each D1 moment; no rate drop (D1 stays advisory). Golden: +3 `Milestone` events | `data.test.ts` (ascending), `countdown.test.ts` (milestones in order, follows data); playtest with `Milestone` added to the salient set: longest stretch ≤ 90 min. If the Events tab maps milestone names to text, add the three strings (UI) |
| **P3** | `catch.ts` → `autoCatchThreshold` | 0.70 → **0.65** | F6 (risks 2, 8). AUTO = the band rule: catches CLEAR and LEAN, diverts CONTESTED and AGAINST; matches DESIGN_SYSTEM §6.28 | hands-off diverts 15.5 % → **≈ 14 %** (measured 14.0 % at 0.65, §13.5); failed catches 5.7 % → **≈ 6–7 %**; seed 1234 frugal catches instead of diverting | `anomaly-sweep.ts 200` against the re-targeted AC 3c (GDD): diverted **10–25 %**, none at *p* ≥ 0.65, none without an engine-out, failed **≤ 8 %**. Update the AC 3c bound in `scripts/sim/anomaly-sweep.ts` (15 % → 10 %, add the failed-catch bound) and the comment in `catch.ts` in the same commit |
| **P4** | `countdown.ts` → `stationHysteresisFraction` | 0.03 → **0.05** | F4 (risk 3). The upper-wind series moves ≈ sd·√(2Δt/τ) ≈ 1.8 m/s per minute, so today's 1.8 m/s deadband (3 % of 60) is re-crossed within a minute; 3.0 m/s takes ≈ 3 min. Ground wind: 0.39 → 0.65 m/s | fewer, longer NO-GO holds; fewer 1× drops; each release counts for minutes, not seconds. Cost: a recovering station reads worse ≈ 1 min longer | playtest seeds 7 and 17: NO-GO holds per run **≤ 3** (from 7 / 2); hands-off scrubs still ≤ 12; retarget any `range.test.ts` case that encodes 0.03 to the data value. If NO-GO holds stay > 3, **code fallback** (not data): a station must stay releasable for `countdown.releaseDwellS` = 60 s before GO is offered |

Golden seed 42: expected still CAUGHT at *p* 0.997. Explain the regenerated diff as: +3 `Milestone` lines (P2), any
station-change timestamps moved by the wider deadband (P4), and front-duration effects only if seed 42 draws a front
(P1 rescales the duration draw; the rng call count is unchanged).

### 15.3 Targets after P1–P4

| Check | Before | Target |
|---|---|---|
| Weather scrubs, seeds 0–39, standard | 2 / 40 | ≤ 1 / 40 |
| Seeds 0–199, scrubs by policy | not measured | frugal > standard ≥ hedger; outcome differs between frugal and hedger in **≥ 2 %** of seeds (D1 matters) |
| `hands-off` diverted / failed / scrubbed (AC 3c) | 15.5 % / 5.7 % / 7 | 10–25 % / ≤ 8 % / ≤ 7 |
| Anomaly shares vs weights | within ±3.3 pts | within ±10 pts |
| NO-GO holds per run, seeds 7 / 17 | 7 / 2 | ≤ 3 each |
| Longest stretch before the load poll with no decision, poll, hold, anomaly or milestone | 280 min | ≤ 90 min |
| Seed 1234 frugal | DIVERTED by AUTO at 0.688 | CATCH by AUTO (result per the seeded roll) |

If P1 leaves frugal and hedger identical (D1 still never matters), report back before touching the start farm: the
next lever is `propellant.mvpStart.farmLoxKg` (range 4.17–4.25 M kg), which would also move the D1 ladder.

### 15.4 Deliberately unchanged

| Key | Why |
|---|---|
| `catch.sigmaPerEngineOutM` 1.0 | risk 2 watch ("players catch every LEAN call without thinking") needs humans; the scripts catch at 0.74 because EV says +17.6 M, which is correct play |
| `logistics.delivery.rush.feeCrPerTruck` 120 000, `standard.feeCrPerTruck` 6 000 | even the top of the range (250 k) makes the full hedge 1.5 M (≈ 4 %): cash is not an MVP lever (§11.1); the campaign fixes it |
| `propellant.mvpStart.farmLoxKg / farmCh4Kg` | P1 gives margin its job first; re-check after P1 |
| `weather.launchLimit` 13 / 60 m/s, `front.probabilityPerRun` 0.35, `front.upperWindBoostMPerS` 18 | grounded limits; the fix is the front's length, not its existence |
| `anomalies.A3.*`, `propellant.load.degradedFactor` | F7: D3b is a real trade-off |
| `logistics.ambientTransporter.dwellYardS / dwellFarmS` 240 / 300 | GDD §14.1 call 5: cycle 610 + 300 + 610 + 240 = 1 760 s, moving 69 % of it, ≈ 18 s real per cycle at 100×; cosmetic |
| `countdown.autoGoWhenAllGreen` true | F2 is real, but the fix (final poll always asks) needs a per-poll flag in code: user call, GDD §15 q6. **Answered yes; applied in 7.5b** as `countdown.autoGoAtPoll` (final false) |

Non-data follow-ups from the same pass (GDD §14.1): `src/app/game.ts` `followLaunch` must ignore a plain selection
(AC 25); `DIRECTOR` decision-log tag (AC 33); held transporters must read `WIND HOLD` with the gust (AC 26). All three done
in 7.5b (§15.5).

### 15.5 As applied (7.5b, 2026-10-21, simulation-engineer)

Applied in the order P3 → P2 → P4 → P1, one commit each, all values as proposed; plus the final-poll rule (GDD §15
q6, user yes): `countdown.autoGoWhenAllGreen` → `countdown.autoGoAtPoll` = load / terminal true, **final false**.
Step 0 (P1): through the NO-GO holds of seeds 7 and 17 the WEATHER driver is **UPPER_WIND** (peaks 77.0 / 76.4 m/s),
never GROUND_WIND, so P1 went ahead. Tools: `scripts/sim/outcome-sweep.ts` (new: seeds 0–199 × standard / frugal /
hedger, 4 workers, scrub attribution by hold cause), `scripts/sim/anomaly-sweep.ts 200` (AC 3c bound updated),
`scripts/sim/playtest.ts 7,17,42,1234` (Milestone now salient; NO-GO hold count + WEATHER driver). Policies shared in
`scripts/sim/policies.ts`.

| Check (§15.3) | Before (HEAD of 7.5) | After P4 | After P1 + final poll (as shipped) | Target | |
|---|---|---|---|---|---|
| Weather scrubs, seeds 0–39, standard | 2 / 40 (7, 17) | 3 / 40 (2, 7, 17) | **2 / 40** (7, 17) | ≤ 1 / 40 | **missed** |
| Scrubs, seeds 0–199: frugal / standard / hedger | 13 / 10 / 6 | 16 / 11 / 6 | **14 / 9 / 6** (7.0 / 4.5 / 3.0 %) | frugal > standard ≥ hedger | met |
| Weather scrubs ≤ 2 % (standard, §15.2 P1; user q8) | 5.0 % | 5.5 % | **4.5 %** | ≤ 2 % | **missed** |
| Frugal vs hedger: scrub outcome differs (D1 matters) | 9 / 200 (4.5 %) | 12 / 200 | **10 / 200 (5.0 %)** | ≥ 2 % | met |
| Frugal vs hedger: any outcome differs (incl. catch call) | 37 / 200 | — | 35 / 200 | — | |
| `hands-off` diverted / failed / scrubbed (AC 3c) | 15.5 % / 5.7 % / 7 | — | **13.9 % / 5.7 % / 6** (27 / 11 of 194 flights; 26 AUTO, 1 FORCED) | 10–25 % / ≤ 8 % / ≤ 7 | met |
| Diverted at *p* ≥ threshold / without an engine-out | 0 / not checked | — | **0 / 0** | 0 / 0 | met |
| Anomaly shares vs weights (hands-off) | +3.3 / −2.9 / +0.3 / −0.7 | — | **+3.5 / −2.8 / 0.0 / −0.6** pts | ±10 pts | met |
| NO-GO holds per run, seeds 7 / 17 (standard) | 7 / 2 | 3 / 1 | **2 / 1** | ≤ 3 each | met (no `releaseDwellS` fallback) |
| NO-GO holds per run, 200 seeds standard: mean / max / runs > 3 | 1.32 / 13 / 24 | 0.94 / 8 / 14 | **0.90 / 8 / 13** | — | |
| Longest T-clock stretch before the load poll with nothing salient | 280 min | 90 min | **90 min** (every seed, every policy) | ≤ 90 min | met |
| Seed 1234 frugal | DIVERTED by AUTO at 0.688 | — | **CAUGHT by AUTO** at 0.688 (+40.22 M) | catch by AUTO | met |
| Golden seed 42 | CAUGHT *p* 0.997 | — | CAUGHT *p* 0.997, money / debrief identical | unchanged outcome | met |

**Why the scrub targets miss (for game-designer).** P1 removed little: standard 10 → 9 scrubs, and seeds 7 / 17 still
scrub. The §15.2 P1 argument assumes the base upper wind ≤ mean + 1 sd (45 m/s) under the front; the scrubbed seeds
sit higher: on the plateau the deviation is +6…+21 m/s in seed 7 and +9…+20 m/s in seed 17 (up to +2.1 sd), and seed 7
was already at 54–64 m/s for the 90 min *before* its front arrived (a 36-min load-poll hold on UPPER_WIND before the
front peaked). With that base even a 49–52 min plateau keeps the station NO-GO past the 75-min window, and the holds
stack with an A1 intrusion (13 min, seed 7) or, for an A2 during the load, a LOX reserve drained by topping (seed 17:
PROPELLANT FARM_RESERVE_LOX NO-GO 17–19 min on top). UPPER_WIND is the largest hold cause in 8 of the 9 standard
scrubs (seed 102: FARM_RESERVE_LOX), mostly combined with FARM_RESERVE_LOX — so the margin ladder *does* act (frugal 14
vs hedger 6 scrubs), but high-base fronts are not out-waitable. Standard also loses seeds 79 / 115 that frugal flies,
through the 20-min HOLD_FIX (D3b trade-off, F7). The front's length is not the remaining lever. Candidates, not
applied (designer / user call): `weather.upperWind.sdMPerS` 10 → 8 (no documented range yet), a front boost that does
not stack fully on a high base (code), or `weather.launchLimit.upperWindMPerS` (range 50–75, kept as grounded in
§15.4). Before touching `propellant.mvpStart.farmLoxKg` (§15.3 note): D1 already matters (frugal vs hedger scrubs differ
in 5 % of seeds), the miss is the scrub rate, not D1's weight. Q8 (user: weather scrubs ≤ 2 % after P1) is therefore
**not met** by P1 alone.

### 15.6 Follow-up after 7.5b — `weather.upperWind.sdMPerS` 10 → 8 (user: go on the recommended option)

Outcome sweep, seeds 0–199 (`scripts/sim/outcome-sweep.ts 200`): weather scrubs standard **9 → 6 (3.0 %)**, frugal
14 → 10 (5.0 %), hedger 6 → **3 (1.5 %)**; seeds 0–39 standard 2. Ordering frugal > standard ≥ hedger holds and D1
decides a scrub in 7 / 200 seeds (17, 87, 102, 110, 121, 151, 198: frugal scrubs, hedger flies). Every remaining
scrub is UPPER_WIND stacked with FARM_RESERVE_LOX, an A1 intrusion or the 20-min HOLD_FIX. Reading of q8: a player
who uses the margin ladder (hedger) is under 2 %; the standard policy (3 LX + 1 MX standard) sits at 3 %. Anomaly
sweep 200 (hands-off): shares +3.6 / −2.5 / +0.3 / −1.4 pts, diverted 12.8 %, failed 5.6 %, none at p ≥ 0.65 —
AC 3 still green. Golden seed 42: only the upper-wind telemetry values and WEATHER MARGINAL/GO crossings change (10
crossings fewer between T-03:34 and T-02:28, the T-01:04 / T-00:54 pair shifts by ≈ 1 min); no hold, poll, phase,
flight or debrief line moves.

## Sources (brief)
- [S1] Widely reported public specs for the super-heavy methalox class (booster ~3 400 t, ship ~1 200–1 500 t of propellant). Not re-verified in this pass; used as order of magnitude only.
- [S2] Teslarati reporting on the Starbase tank farm: ~5 400 t of LOX in the main tanks — https://teslarati.com/spacex-starship-orbital-launch-site-propellant-delivery
- [S3] Starship flight test 5 (Oct 2024): MECO ≈ T+2:33, separation ≈ 74 km, boostback end ≈ T+3:41, catch ≈ T+6:56 — https://en.wikipedia.org/wiki/Starship_flight_test_5 ; https://thespacebucket.com/what-exactly-happened-on-starships-fifth-launch-attempt/
- [S4] NASA NTRS, Shuttle-era cryogen trucking: LOX tankers ≈ 19 000 L — https://ntrs.nasa.gov/api/citations/20110014378/downloads/20110014378.pdf
