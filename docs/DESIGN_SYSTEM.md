# Fuel-X — Design System

> Owner: `ui-design-system`. Status: Phase 1 draft, awaiting Gate 1.
> Aesthetic source: `industrial-brutalist-ui` skill, **Swiss Industrial Print (light) only**, with the Fuel-X addendum (§9). Mechanics of token use: `design-tokens` skill.
> Styling technology is the architect's call (see `docs/adr/`). Every token below is given as a **CSS custom property** and a **TS constant path**; one is generated from the other, never both hand-maintained.
> Names in examples (`LC-1`, `B-14`, `S-31`, `SP-41`, `RV-1`, `RB-2`) are placeholders until `docs/GDD.md` fixes lore & naming.

---

## 1. Principles

1. **A printed technical document that happens to be live.** Paper substrate, carbon ink, square compartments, 1 px rules. No radius, shadow, gradient, blur or translucency, anywhere.
2. **One accent, one meaning: attention.** Signal orange marks *thrust, selection, alerts, hazard/recovery zones*. If something is orange, the player should look at it. Everything else is ink on paper.
3. **Bimodal type.** Monospace uppercase micro-type for every label, value, unit and call-sign; heavy grotesk macro-type for at most three hero elements on screen (T-clock, followed call-sign, phase stamp).
4. **Numbers never move.** Tabular figures, fixed-width slots, values replaced in place (no tweened counters, no width jitter).
5. **Every widget serves a decision** listed in the GDD (hold, recycle, scrub, follow, dispatch, divert…). Decorative widgets are cut.
6. **State is never color-only.** Severity is carried by glyph + word + fill/stripe weight, so the single accent hue is enough and the UI survives grayscale and color-blindness.
7. **The world is transparent to the pointer.** HUD containers ignore the pointer; only cards, controls and label tags catch it.

**One visual language for HUD and 3D.** The three.js scene is the same sheet of paper: background and haze are `paper`, clay is the `ink` ramp, the sea and ground are dot-printed (point clouds / dithering ≈ halftone), and the only saturated pixels are `accent` — exhaust, the selection ring, alert markers and recovery/hazard rings. HUD label tags in the world use the exact component of §6.20, so a selected booster's tag, its inspector badge and its list row are the same orange at the same moment.

---

## 2. Tokens

Naming: CSS `--fx-<group>-<role>`; TS `tokens.<group>.<role>` (camelCase). Names by role, not look.

### 2.1 Color — substrate, ink, accent

| Token (CSS) | TS | Hex | Role |
|---|---|---|---|
| `--fx-color-paper` | `tokens.color.paper` | `#F4F4F0` | Substrate: panels, cards, page, 3D background & haze |
| `--fx-color-paper-2` | `tokens.color.paper2` | `#EAE8E3` | Metric-tile fill, hover row, alt compartment |
| `--fx-color-paper-3` | `tokens.color.paper3` | `#DEDCD5` | Pressed state, inactive segment fill, track behind progress |
| `--fx-color-ink` | `tokens.color.ink` | `#0A0A0A` | Primary text, frame rules, filled glyphs, focus outline |
| `--fx-color-ink-2` | `tokens.color.ink2` | `#3D3D3A` | Secondary text (sub-status, units) |
| `--fx-color-ink-3` | `tokens.color.ink3` | `#5E5E59` | Field labels, tertiary text, axis labels |
| `--fx-color-ink-4` | `tokens.color.ink4` | `#8C8C86` | Disabled text (exempt), scale ticks, chart baseline |
| `--fx-color-ink-5` | `tokens.color.ink5` | `#BDBCB5` | Interior 1 px dividers (grid-gap parent), empty tracks, hatch |
| `--fx-color-accent` | `tokens.color.accent` | `#FF5A1F` | Fills, bars, rings, glyph fills, playhead. **Never text on paper.** |
| `--fx-color-accent-text` | `tokens.color.accentText` | `#B23B0B` | Small orange text on `paper`, `paper-2` and `accent-tint` (5.41 / 4.87 / 4.81) |
| `--fx-color-accent-tint` | `tokens.color.accentTint` | `#FFE1D2` | Selected row background (flat, opaque) |
| `--fx-color-on-accent` | `tokens.color.onAccent` | = ink `#0A0A0A` | Text/glyph on an orange fill |
| `--fx-color-focus` | `tokens.color.focus` | = ink | Focus outline |

Patterns (images, not gradients — tiled SVG data-URIs in the token source):

| Token | TS | Spec | Use |
|---|---|---|---|
| `--fx-pattern-hazard` | `tokens.pattern.hazard` | 45° stripes, 4 px accent / 4 px ink, 8 px tile | DANGER bands, NO-GO badge edge, hazard zones on minimap |
| `--fx-pattern-hatch` | `tokens.pattern.hatch` | 45° 1 px ink-5 lines every 4 px on paper | Disabled, offline, under-construction, future timeline span |
| `--fx-pattern-noise` | `tokens.pattern.noise` | 256 px static grain, alpha **baked into the asset** (~5 %) | Global overlay, never animated |

### 2.2 Measured contrast (WCAG 2.x relative luminance)

Computed with a script (sRGB → linear, `(L1+.05)/(L2+.05)`). **Allowed** = may be used for text of the given size. Text ≥ 18.66 px bold / 24 px counts as large.

| Foreground \ Background | paper | paper-2 | paper-3 | accent-tint | accent | ink |
|---|---|---|---|---|---|---|
| ink | **17.96** ✓ | **16.17** ✓ | **14.43** ✓ | **15.98** ✓ | **6.35** ✓ | — |
| ink-2 | **9.88** ✓ | **8.90** ✓ | **7.94** ✓ | **8.80** ✓ | 3.49 ✗ | 1.82 ✗ |
| ink-3 | **5.91** ✓ | **5.32** ✓ | **4.75** ✓ | **5.26** ✓ | 2.09 ✗ | 3.04 ✗ |
| ink-4 | 3.07 disabled/ticks only | 2.76 disabled only | 2.46 ✗ | 2.73 ✗ | ✗ | 5.86 (unused) |
| accent-text | **5.41** ✓ | **4.87** ✓ | 4.34 ✗ | **4.81** ✓ | 1.91 ✗ | 3.32 ✗ |
| accent | 2.83 ✗ text | 2.55 ✗ | 2.27 ✗ | 2.52 ✗ | — | **6.35** (as bg) |
| paper | — | — | — | — | 2.83 ✗ | **17.96** ✓ |

Rules derived:
- Text on orange is **ink**, never white/paper (the reference's white-on-orange fails at 2.83).
- `accent-text` (`#B23B0B`, Gate 1 decision) allowed on `paper`, `paper-2` and `accent-tint`; never on `paper-3`/`accent`/`ink`.
- `accent` as a non-text graphic on paper is 2.83 (< 3:1 for UI components). Therefore **every orange mark is paired with an ink element** (ink border on orange tags, ink glyph inside orange fills, ink numeric value next to an orange bar). Orange is never the sole carrier of information.
- `ink-5` empty tracks (1.73 vs paper) are decorative; the filled part is ink and the value is always printed.
- Inverted plates (ink bg, paper text, 17.96) are allowed for the alert variant of label tags and the phase stamp.

### 2.3 Semantic states — no extra hues

Severity scales by **amount of ink/orange mass**, not by hue. Every state has: glyph (§7), uppercase word, and a fill treatment.

| State | Word examples | Glyph | Treatment | Text color |
|---|---|---|---|---|
| `neutral` | IDLE, PARKED | `□` hollow | paper fill, 1 px ink-5 border | ink-2 |
| `info` | QUEUED, NOTE | `◫` hollow, inner bar | paper fill, 1 px ink border | ink |
| `ok` | GO, READY, NOMINAL | `■✓` solid ink square w/ paper check | paper fill, 1 px ink border, glyph solid ink | ink |
| `active` | FOLLOWING, ASCENT | motion glyph (`↑ ↓ ›`) | paper fill, **2 px ink** left rule | ink |
| `warn` | HOLD, LOW, SLIP | `△` hollow orange triangle w/ ink `!` | paper fill, **2 px accent** border | accent-text (on paper) |
| `danger` | NO-GO, ABORT, FAULT, SCRUB | `▲` solid orange triangle w/ ink `!` | **solid accent fill**, ink text, 4 px `pattern-hazard` edge band | on-accent (ink) |
| `disabled` / `offline` | OFFLINE, N/A | `⊘` | `pattern-hatch` fill, ink-4 text | ink-4 |

So: warn = orange *line*; danger = orange *mass + stripes*; ok/info = ink only. **Selection** is orange too but is distinguished from danger by having no stripes, no triangle, and square brackets `[ ]` / the tint (rows) — see §6.13 and §6.20. Danger may additionally do one stepped invert per second until acknowledged (off under `prefers-reduced-motion`).

CSS: `--fx-state-<state>-bg|-fg|-border|-glyph`; TS: `tokens.state.<state>.{bg,fg,border,glyph}`.

### 2.4 3D tokens (consumed by render code and Blender material helper)

| Token | TS | Hex | Use |
|---|---|---|---|
| `--fx-3d-background` | `tokens.world.background` | `#F4F4F0` (= paper) | Clear color, Blender preview bg |
| `--fx-3d-haze` | `tokens.world.haze` | `#F4F4F0` (= paper) | Fog color (linear fog, start/end in ARCHITECTURE) |
| `--fx-3d-clay-light` | `tokens.world.clayLight` | `#E6E4DE` | `MAT_Clay` base — structures, vehicles |
| `--fx-3d-clay-dark` | `tokens.world.clayDark` | `#9A9993` | `MAT_ClayDark` — engines, trusses, wheels, details |
| `--fx-3d-clay-metal` | `tokens.world.clayMetal` | `#C9C8C2` | `MAT_Metal` (roughness tuned, no hue) |
| `--fx-3d-glass` | `tokens.world.glass` | `#5E5E59` (= ink-3) | `MAT_Glass` — opaque dark, no transparency |
| `--fx-3d-shadow-tint` | `tokens.world.shadowTint` | `#BDBCB5` (= ink-5) | Ambient/hemisphere ground color (shadows stay neutral) |
| `--fx-3d-sun` | `tokens.world.sun` | `#FBFBF8` | Key light color (near-neutral) |
| `--fx-3d-sea-base` | `tokens.world.seaBase` | `#D9D8D2` | Sea plane under points |
| `--fx-3d-sea-points` | `tokens.world.seaPoints` | `#FBFBF8` | Sea point cloud / foam |
| `--fx-3d-ground-base` | `tokens.world.groundBase` | `#E3E1DB` | Ground under points |
| `--fx-3d-ground-points` | `tokens.world.groundPoints` | `#C4C3BC` | Scrub dots (darker = vegetation) |
| `--fx-3d-pad-concrete` | `tokens.world.padConcrete` | `#EFEEE9` | Pads, roads (lighter than ground) |
| `--fx-3d-exhaust-core` | `tokens.world.exhaustCore` | `#FFE1D2` (= accent-tint) | Hot core particles (additive) |
| `--fx-3d-exhaust-glow` | `tokens.world.exhaustGlow` | `#FF5A1F` (= accent) | Plume body/glow (`MAT_Accent` emissive) |
| `--fx-3d-steam` | `tokens.world.steam` | `#FBFBF8` | Deluge steam, foam |
| `--fx-3d-selection-ring` | `tokens.world.selectionRing` | `#FF5A1F` | Selected-entity ground ring, 2 concentric strokes |
| `--fx-3d-zone-recovery` | `tokens.world.zoneRecovery` | `#FF5A1F` | Recovery zone rings (solid) |
| `--fx-3d-zone-hazard` | `tokens.world.zoneHazard` | `#FF5A1F` | Hazard area outline (dashed 4:4) + ink-5 inner hatch |
| `--fx-3d-guide` | `tokens.world.guide` | `#8C8C86` (= ink-4) | Range circles, trajectories, leader lines at rest |

Rule: orange in the world only for exhaust, selection, alerts, recovery/hazard zones. Point clouds may be halftoned by a postprocessing pass; live HUD text never is.

### 2.5 Typography

| Token | TS | Value |
|---|---|---|
| `--fx-font-micro` | `tokens.font.micro` | `"JetBrains Mono", "IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace` |
| `--fx-font-macro` | `tokens.font.macro` | `"Inter Tight", "Inter", "Archivo Black", "Helvetica Neue", Arial, sans-serif` (weight 900) |

Sources: JetBrains Mono (OFL; weights 400/500/700) and Inter Tight (OFL; weight 900, has `tnum`) — Google Fonts or self-hosted WOFF2 subsets (Latin + `° ▲△■□◐›»↑↓`), `font-display: swap` for micro, `block` ≤ 300 ms for macro to avoid T-clock reflow. Self-host is preferred (offline play, no third-party request); final call in the styling ADR. Glyphs not in fonts are drawn as SVG icons (§7), never relying on fallback fonts.

**Micro scale** (fixed px, never `clamp`; all uppercase, `font-variant-numeric: tabular-nums slashed-zero`):

| Token | TS | Size / leading / tracking / weight | Use |
|---|---|---|---|
| `--fx-type-tick` | `tokens.type.tick` | 10 / 1.2 / 0.08em / 400 | Scale ticks, compass numerals, REV stamps (non-essential only) |
| `--fx-type-label` | `tokens.type.label` | 11 / 1.3 / 0.08em / 500 | Field labels, tab labels, sub-status, units, tag text |
| `--fx-type-body` | `tokens.type.body` | 12 / 1.35 / 0.05em / 400 | Default data, list values, event lines |
| `--fx-type-strong` | `tokens.type.strong` | 13 / 1.3 / 0.05em / 700 | Row primary name, chip text, card headers `[ … ]` |
| `--fx-type-title` | `tokens.type.title` | 14 / 1.25 / 0.05em / 700 | Inspector name, dropdown headers |
| `--fx-type-value` | `tokens.type.value` | 22 / 1.0 / 0.02em / 500 | Metric tile hero values (`100.0 %`, `3 of 5`, `GO`) — mono, fixed |

**Macro scale** (`clamp()` only here; uppercase; tabular):

| Token | TS | Value | Leading / tracking | Use |
|---|---|---|---|---|
| `--fx-type-macro-clock` | `tokens.type.macroClock` | `clamp(2rem, 2.6vw, 3.5rem)` | 0.9 / -0.03em | T-clock in timeline |
| `--fx-type-macro-callsign` | `tokens.type.macroCallsign` | `clamp(1.75rem, 2vw, 2.75rem)` | 0.9 / -0.04em | Followed call-sign in inspector |
| `--fx-type-macro-stamp` | `tokens.type.macroStamp` | `clamp(4rem, 9vw, 11rem)` | 0.85 / -0.05em | Phase-transition stamp (`LIFTOFF`) |

Rules: minimum readable content size 11 px (10 px only for redundant ticks). Units in micro-type after a thin space: `47 KM/H`, `9.7 KM`, `100.0 %`. Negative values use a true minus `−`. Fixed decimal places per field (defined by the projection), right-aligned in fixed `ch` slots.

### 2.6 Spacing, sizing, rules

| Token | TS | Value | | Token | TS | Value |
|---|---|---|---|---|---|---|
| `--fx-space-0` | `space[0]` | 0 | | `--fx-space-5` | `space[5]` | 16px |
| `--fx-space-1` | `space[1]` | 2px | | `--fx-space-6` | `space[6]` | 24px |
| `--fx-space-2` | `space[2]` | 4px | | `--fx-space-7` | `space[7]` | 32px |
| `--fx-space-3` | `space[3]` | 8px | | `--fx-space-8` | `space[8]` | 48px |
| `--fx-space-4` | `space[4]` | 12px | | `--fx-hud-gutter` | `size.hudGutter` | 16px (12px compact) |

Sizes: `--fx-size-row` 32px (list row, 28 compact), `--fx-size-control` 32px (map buttons, segmented), `--fx-size-topbar` 40px, `--fx-size-glyph` 12px, `--fx-size-glyph-lg` 16px, `--fx-size-hit-min` 24px (WCAG 2.5.8).

| Token | TS | Value | Use |
|---|---|---|---|
| `--fx-radius` | `tokens.radius` | `0` | Everything |
| `--fx-shadow` | `tokens.shadow` | `none` | Everything |
| `--fx-rule-hair` | `tokens.rule.hair` | `1px` | Interior dividers (grid gap on ink-5 parent) |
| `--fx-rule-frame` | `tokens.rule.frame` | `1px solid ink` | Card/panel outer frame |
| `--fx-rule-heavy` | `tokens.rule.heavy` | `2px solid ink` | Section heads, active left rule, top-bar bottom |
| `--fx-rule-warn` | `tokens.rule.warn` | `2px solid accent` | Warn border |
| `--fx-rule-band` | `tokens.rule.band` | `4px` hazard pattern | Danger band |
| `--fx-focus-ring` | `tokens.focus.ring` | `2px solid ink`, offset 2px | All focusables (square) |
| `--fx-crosshair` | `tokens.crosshair` | 9px `+`, 1px ink-4 | Marks at HUD grid intersections / card corners |

### 2.7 Z-layers

| Token | Value | Layer |
|---|---|---|
| `--fx-z-world` | 0 | three.js canvas |
| `--fx-z-world-labels` | 10 | DOM/CSS2D label tags, leader lines |
| `--fx-z-hud` | 20 | HUD frame & panels |
| `--fx-z-popover` | 30 | Site dropdown, search results, tooltips |
| `--fx-z-toast` | 40 | Event toasts |
| `--fx-z-dialog` | 50 | Scrub/abort confirm, shortcut sheet |
| `--fx-z-stamp` | 60 | Phase-transition stamp (pointer-events none) |
| `--fx-z-noise` | 70 | Static noise overlay (pointer-events none) |

### 2.8 Motion — mechanical, not bouncy

| Token | TS | Value | Use |
|---|---|---|---|
| `--fx-dur-0` | `motion.dur.instant` | 0ms | Value updates, selection, tab switch (hard cut) |
| `--fx-dur-snap` | `motion.dur.snap` | 80ms | Hover/press fills |
| `--fx-dur-fast` | `motion.dur.fast` | 120ms | Dropdown/popover reveal (clip, not fade) |
| `--fx-dur-base` | `motion.dur.base` | 200ms | Toast slide-in, panel expand |
| `--fx-dur-stamp` | `motion.dur.stamp` | 640ms | Phase stamp: 3 steps in, hold, cut out |
| `--fx-dur-camera` | `motion.dur.camera` | 700ms | Camera re-target (render side; follow lerp is continuous) |
| `--fx-ease-mech` | `motion.ease.mech` | `cubic-bezier(0.2, 0, 0, 1)` | Only easing allowed; no overshoot, no spring |
| `--fx-ease-linear` | `motion.ease.linear` | `linear` | Playhead, tapes, progress |
| `--fx-ease-step` | `motion.ease.step` | `steps(3, end)` | Stamp, danger invert |

Rules: numbers swap instantly at projection rate (no count-up). Bars and playhead move linearly between projection samples or step. No opacity fades on panels (would be translucency) — reveal by `clip-path` inset or hard cut. `prefers-reduced-motion`: all durations → 0 except camera (→ hard cut), stamp becomes a static 1 s plate.

### 2.9 Breakpoints & viewport

| Token | Value | Behavior |
|---|---|---|
| `--fx-bp-min` | 1280×720 | Minimum supported. Below: full-screen plate `[ VIEWPORT 1280×720 MIN ]`, sim paused. |
| `--fx-bp-compact` | width < 1600 **or** height < 900 | Compact mode (§3.3) |
| `--fx-bp-standard` | 1600–2559 | Reference layout, designed at 1920×1080 |
| `--fx-bp-wide` | ≥ 2560 | Same grid, `--fx-hud-scale: 1.25` applied to micro px via a root multiplier; world gets the extra space |

Touch/mobile out of scope for MVP.

---

## 3. Layout — the HUD blueprint grid

### 3.1 Grid definition (1920×1080)

The HUD is one CSS grid laid over the canvas (`position: fixed; inset: 0`). Columns (px): `16 | 320 | 56 | 1fr | 40 | 8 | 400 | 16`. Rows: `40 | 16 | auto | 1fr | 40 | 112 | 16`.

```
grid-template-areas:
 "top    top    top    top     top     top   top     top"
 ".      .      .      .       .       .     .       ."
 ".      flight alt    toast   .       .     inspect ."
 ".      poll   alt    world   .       .     inspect ."
 ".      poll   alt    compass ctrl    .     tabs    ."
 ".      time   time   time    time    .     tabs    ."
 ".      .      .      .       .       .     tabs    .";
```
(`ctrl` spans rows 4–5, bottom-aligned. `tabs` has a fixed height (≈ 600 px incl. rows 5–7, growing upward into row 4); `inspect` takes the remaining height above it and scrolls internally, so the two never overlap.)

| Area | Component(s) |
|---|---|
| `top` | Top bar (§6.1–6.6) |
| `flight` | Flight card (§6.7) |
| `poll` | Go/No-Go poll panel (§6.24), only during polls; otherwise empty |
| `alt` | Altitude scale (§6.21) |
| `toast` | Event toast stack (§6.23), top-center |
| `world` | Empty; the 3D scene shows through |
| `compass` | Compass tape (§6.22), centered on `world` |
| `ctrl` | Map controls (§6.19) |
| `inspect` | Inspector card (§6.11) |
| `tabs` | Tabbed panel (§6.14) |
| `time` | Countdown timeline (§6.17) incl. time-scale control (§6.25) |

Crosshair `+` marks (ink-4) sit on the outer corners of every card and at the four corners of `world`. No full-screen gridlines over the scene.

### 3.2 Wireframe 1920×1080

```
+----------------------------------------------------------------------------------------------------------+
|[FX] ORG / REGION / LC-1 ▾ | [⌕ SEARCH VEHICLES, TANKS, TASKS   /]  13:41:54 UTC  TLM 38 MS [■✓ RANGE GO] [▲ 1 ALERT] [RO R.OKAFOR·LAUNCH DIR]|
+==========================================================================================================+
| +[ LC-1 FLIGHT 7 ]----------+                                                    +[ B-14 ]-------------+ |
| |NEXT LAUNCH   |PROP LOADED |              [toast: ▲ WX-1 GUSTS 14 M/S  ✕]       |B-14          [B-14]| |
| |T-00:00:04    |100.0 %     |                                                    |BOOSTER · FLIGHT 7   | |
| |B-14 + S-31   |▁▂▃▅▇ spark |                                                    |↑ ASCENT · FOLLOWING | |
| |--------------+------------|   45 -           [TOWER-1]                         |MSN T+00:00:51|ALT 8.3 KM|
| |STAGES READY  |RANGE       |   30 ◄           [■ S-31]                          |VEL 0.24 KM/S|PROP 68.5%|
| |3 OF 5 ■■■□□  |■✓ GO  spark|   15 -     [B-14]━━ (orange)            [◐ PK-03] |ENG 33 OF 33 |ARMS CLOSED|
| +---------------------------+   00 -                                             |FLIGHT TO CATCH 12.7 %| |
| +[ GO / NO-GO POLL ]--------+   ALT                                              |████░░░░░░░░░░░░░░░░ | |
| | WX ■✓ GO   RANGE △ HOLD   |  scale                                             |ALTITUDE KM  ╱‾‾‾    | |
| | PROP ■✓   VEH ■✓  CREW ■✓ |                                                    +---------------------+ |
| | [HOLD] [RECYCLE] [SCRUB]  |                                              [+]   +[VEHICLES|TANKS|TASKS|RANGE|EVENTS]+
| +---------------------------+                                              [−]   |■✓ B-14 BOOSTER   100 % PROP| |
|                                    180 . 210 . ▲ . 240 . 270               [‹]   |▓ RV-1 RECOVERY    9.7 KM   | |
|                                             222°                           [›]   |» RB-2 RANGE BOAT 21.3 KM   | |
| +[ COUNTDOWN ] LC-1 · B-14 / S-31 -------[II|1×|10×|100×]--- T-00:00:04 --+ [⊞]   |■ SP-41 TRANSPORT  0 KM/H   | |
| |■■■■■■■|■■■■■|■■■■■■■■■▌orange▐■|■■■■│■■|//////|//////|//////|////////| [⌂]   |› CT-201 TANKER  47 KM/H    | |
| |☑ROLLOUT ☑STACK ☑PROP LOAD ◐TERMINAL COUNT ○LIFTOFF ○BOOSTBACK ○CATCH ○SAFING|  [⌖]   |› CT-207 TANKER  43 KM/H    | |
| +-------------------------------------------------------------------------+        +----------------------------+ |
+----------------------------------------------------------------------------------------------------------+
```

### 3.3 Behavior at 1280×720 (compact)

- Gutter 12 px; columns `12 | 272 | 44 | 1fr | 32 | 8 | 336 | 12`; rows `36 | 8 | auto | 1fr | 32 | 88 | 12`.
- Top bar: search collapses to a `⌕ /` button opening a popover; telemetry latency moves into the user chip popover; role text hidden (initials + name only).
- Flight card: sparklines hidden, values only (2×2 tiles stay).
- Inspector: metric grid stays 2 columns but shows 6 metrics max (priority order defined by entity class), chart hidden behind a `▸ CHART` disclosure.
- Tabbed panel: tabs may abbreviate (`VEH TNK TSK RNG EVT`), ~6 rows visible, rows 28 px.
- Timeline: phase labels abbreviate (`ROLL STK PROP TERM LIFT BBK CATCH SAFE`); T-clock clamps to its min (2 rem).
- Altitude scale: 5 ticks; compass tape: ±45° window.
- Inspector + poll + tabs never overlap: when the poll is active and height < 900, the inspector collapses to its header (name + chip).

### 3.4 Pointer-events rules

- `.hud-root` and every grid area wrapper: `pointer-events: none`.
- Cards, panels, controls, buttons, inputs, popovers, toasts: `pointer-events: auto` (a click on a card must not select the entity behind it).
- World label layer: `none`; each label tag: `auto` (click = select/follow). Leader lines: `none`.
- Altitude scale, compass tape, noise, stamp: `none` (read-only).
- The canvas receives everything else (orbit, pick). Wheel over a scrollable panel scrolls the panel, not the camera.

---

## 4. Shared component conventions

- Every card: `paper` bg, `--fx-rule-frame`, header `[ TITLE ]` in `type-strong`, body is a `display:grid; gap:1px` on an `ink-5` parent with `paper`/`paper-2` children.
- States vocabulary for all interactive parts: **default** (paper), **hover** (paper-2, 80 ms), **pressed** (paper-3), **selected** (accent-tint bg + 2 px accent left rule for rows; accent fill + ink text for small badges), **alert** (per §2.3 warn/danger), **disabled** (hatch, ink-4, `aria-disabled`), **focus-visible** (focus ring).
- Values come from the throttled UI projection (`ui.*` selectors, names illustrative; ARCHITECTURE.md is authoritative). No component subscribes to per-tick sim data.
- Telemetry semantics: values in `<data value="…">` (machine value in SI, display in UI units) or `<output>` when computed live; label/value pairs in `<dl>`; key hints in `<kbd>`; log lines in `<samp>`.
- Missing data renders `—` in the same slot (never collapses), state `neutral`.

---

## 5. Decision map (why each component exists)

| Component | Player decision served |
|---|---|
| Site switcher | Where to act / expand (strategy layer) |
| Search | Find & follow any entity fast |
| Range badge, alert counter, poll panel | Hold / recycle / scrub / proceed |
| Flight card | Is the next launch on track? (prop, stages, range) |
| Inspector | React to a vehicle anomaly (divert, hold arms, safe) |
| Tabbed panel | Dispatch logistics, follow entities, review events |
| Countdown timeline | When to hold; how far is the cycle |
| Time-scale | Compress logistics, play the count at 1× |
| Map controls, labels, scales | Spatial awareness to judge hazards/recovery |

(GDD may cut/merge; components without a decision are removed.)

---

## 6. Component specs

### 6.1 Top bar
```
[FX]│ORG / REGION / LC-1 ▾│ [⌕ SEARCH … /] │13:41:54 UTC│TLM 38 MS│[■✓ RANGE GO]│[○ 0 ALERTS]│[RO NAME·ROLE]
```
- Element: `<header role="banner">` with `<nav aria-label="Site">` for the breadcrumb. Height 40, `paper`, bottom `--fx-rule-heavy`; cells separated by 1 px ink-5 verticals.
- Fields: logo mark (square monogram, ink), breadcrumb, search, `ui.clock.utc` (`<time>`, sim time in UTC, `HH:MM:SS`), `ui.telemetry.latencyMs` (`TLM 38 MS`, warn ≥ 250 ms, danger = stale > 2 s showing `TLM STALE`), range badge, alert counter, user chip.
- Behavior: fixed; never scrolls; clock ticks once per sim second (instant swap).

### 6.2 Breadcrumb site switcher
```
ORG / REGION / [LC-1 ▾]             dropdown (popover):
                                    +[ SITES ]--------------------------+
                                    |■✓ LC-1   ORBITAL PAD     ACTIVE   |  <- current: 2px ink left rule
                                    |⊘  LC-2   ORBITAL PAD   BUILD 62 % |  <- hatch, progress text
                                    |□  TS-1   TEST STAND       IDLE    |
                                    |□  YD-1   BUILD YARD    4 VEH      |
                                    |+  NEW SITE…            (if allowed)|
                                    +-----------------------------------+
```
- Elements: `<nav><ol>` crumbs, last crumb a `<button aria-haspopup="listbox" aria-expanded>`; dropdown `role="listbox"` with `role="option"`.
- Data: `ui.sites[] {id, code, kind, status, buildProgress?, alertCount}`.
- States: hover row paper-2; current = selected style; a site with alerts shows `▲ n` (danger fill badge) at row end; under construction = hatch + `BUILD nn %`; locked = disabled.
- Behavior: open on click/Enter/↓; arrows move, Enter switches (camera cuts to site home, 700 ms), Esc closes; reveal by clip 120 ms. Org/Region crumbs are non-interactive text in MVP.

### 6.3 Search
```
[⌕ SEARCH VEHICLES, TANKS, TASKS            / ]
 results: +--------------------------------------+
          | VEHICLES                             |
          | ↑ B-14  BOOSTER     ASCENT           |
          | ■ SP-41 TRANSPORTER PARKED           |
          | TASKS                                |
          | ◐ T-118 LOX TRANSFER 62 %            |
          +--------------------------------------+
```
- `<search>` (or `<form role="search">`) + `<input type="search" role="combobox" aria-controls aria-autocomplete="list">`; results `role="listbox"` grouped with `role="group"` headers.
- Data: index of entities, tanks, tasks, sites (`id, code, class, status`). Prefix + fuzzy on code/name, max 8 results.
- States: default (paper-2 field, 1 px ink-5 border), focus (ink border + focus ring), no results (`NO MATCH`), hint `<kbd>/</kbd>` right-aligned.
- Behavior: `/` or `Ctrl/⌘+K` focuses; Enter selects + follows; Esc clears then blurs. Query text is not uppercased in the input (typing readability), results are.

### 6.4 Status badge (RANGE GO / NO-GO)
```
[■✓ RANGE GO]   [△ RANGE HOLD]   [▲ RANGE NO-GO]  (danger: orange fill, ink text, hazard band left edge)
```
- `<button>` (opens Range tab) containing `<output aria-live="polite">`. Data: `ui.range.status ∈ GO|HOLD|NO-GO`, `ui.range.reason`.
- States map to ok / warn / danger (§2.3). Tooltip = reason (`BOAT IN HAZARD ZONE: RB-9`). Disabled when no launch scheduled (`RANGE —`).

### 6.5 Alert counter
```
[○ 0 ALERTS]   [▲ 1 ALERT]  (orange fill, ink text)   [▲ 3 ALERTS ·2 NEW] (danger invert 1/s until ack)
```
- `<button aria-haspopup="dialog">` opens Events tab filtered to unacknowledged. Data: `ui.alerts.unackCount`, `ui.alerts.maxSeverity`.
- States: 0 = neutral; any warn only = warn style; any danger = danger style. Number in fixed 2-digit slot.
- `aria-live="assertive"` announcement only on new danger.

### 6.6 User chip
```
[RO│R. OKAFOR      ]
[  │LAUNCH DIRECTOR]
```
- `<button>`; initials in an ink square (paper text), name `type-strong`, role `type-label` ink-3. Popover: role, shift time left, settings, shortcut sheet `?`, (compact) telemetry latency. Name/role from save data (placeholder above).

### 6.7 Flight card
```
+[ LC-1 FLIGHT 7 ]----------------+
|NEXT LAUNCH     |PROPELLANT LOADED|
|T-00:00:04      |100.0 %          |
|B-14 + S-31     |▁▂▃▅▆▇ ────────  |
|----------------+-----------------|
|STAGES READY    |RANGE            |
|3 OF 5          |■✓ GO            |
|■■■□□           |▁▁▁▁▁▁ ────────  |
+---------------------------------+
```
- `<section aria-labelledby>`; header `<h2>`; four Metric tiles (§6.8).
- Data: `ui.flight {pad, number, nextLaunchAt, tMinus|daysToLaunch, vehicles, propLoadedPct, propSeries[], stagesReady, stagesTotal, rangeStatus, rangeSeries[]}`.
- Behavior: before T-1 day show `DAYS TO NEXT LAUNCH 9.4 D`; after launch show `FLOWN T+00:03:16` as sub-line. Click card = open Countdown/Tasks.

### 6.8 Metric tile + sparkline
```
+----------------+
|PROP LOADED     |  label: type-label, ink-3
|100.0 %         |  value: type-value, ink; unit type-label ink-2
|▁▂▃▅▆▇─────── ┊ |  sparkline 120×20, 1px ink polyline, ink-5 baseline,
+----------------+  last-point 3px ink square; threshold tick ink-4
```
- `<div role="group">` with `<dl><dt>label</dt><dd><data value="0.999">100.0 %</data></dd></dl>`; sparkline `<svg role="img" aria-label="Propellant, last 10 min, rising">`.
- States: default; warn (2 px accent border, value stays ink, `△` before label); danger (accent fill on the label strip only, value ink on paper below, so the number stays 17.96:1); stale (`—`, hatch on sparkline); selected (when its entity is followed) none.
- Behavior: sparkline window fixed (e.g. last 60 samples), redrawn at projection rate, no smoothing, no area fill.

### 6.9 Segmented progress (stages ready)
```
3 OF 5   ■■■□□     filled = ink, empty = paper-3 with 1px ink-5 border, 2px gaps, segment 16×6
         ■■▣□□     ▣ = in-work segment: accent fill w/ ink border (only one at a time)
```
- `<meter min=0 max=5 value=3>` with visible text. Also used for engines (`33 OF 33`, compressed to 11 segments of 3 at narrow width) and crane/tasks.

### 6.10 Linear progress (inspector)
`FLIGHT TO TOWER CATCH 12.7 %` + 6 px bar: track paper-3, fill ink; when the bar represents a hazard countdown (abort window) fill is accent with ink end-cap. `<progress>` with label.

### 6.11 Inspector card
```
+------------------------------------+
|B-14                         [B-14] |  macro-callsign (hero), class badge orange (selected)
|BOOSTER · FLIGHT 7 · 14 FLIGHTS     |  type-label ink-3
|[↑ ASCENT                FOLLOWING] |  status chip, full width
|------------------+-----------------|
|MISSION CLOCK     |ALTITUDE         |
|T+00:00:51        |8.3 KM           |
|VELOCITY          |PROPELLANT       |
|0.24 KM/S         |68.5 %           |
|ENGINES LIT       |CATCH ARMS       |
|33 OF 33          |CLOSED           |
|------------------------------------|
|FLIGHT TO TOWER CATCH        12.7 % |
|███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ |
|ALTITUDE · KM          ╱‾‾‾         |  line chart 360×64, 1px ink, axis ink-4
|[FOLLOW F] [FRAME] [ACTIONS ▾]      |  entity actions (divert, hold arms, safe…)
+------------------------------------+
```
- `<aside aria-label="Inspector">`, name `<h2>`, metrics `<dl>` grid 2 cols, chart `<svg role="img">` + hidden `<table>` of last values for SR.
- Data: `ui.inspector {id, callsign, class, flight, history, status, following, metrics[{key,label,value,unit,state}], progress{label,pct}, chart{label,series[]}, actions[{id,label,enabled,danger}]}`. Metric set per class (booster, ship, vessel, transporter, tanker, tank, crane, building).
- States: empty (no selection → card hidden, area free); following vs selected-only (chip says `FOLLOWING` / `SELECTED`); alert (header gets danger band; offending metric tile in alert style); destroyed/lost (hatch + `LOST`).
- Behavior: switching entity = hard cut. Destructive actions (abort, scrub, divert) open a confirm dialog with the consequence spelled out.

### 6.12 Status chip
```
[↑ ASCENT · FOLLOWING]  [↓ LANDING BURN]  [⊠ CAUGHT, SAFING]  [↺ ON STATION, HOLDING]  [▲ ENGINE OUT]
```
- `<span role="status">` (inspector) or plain `<span>` in rows. Glyph (§7) + uppercase text `type-strong`. Treatment per §2.3: nominal states = paper + ink; warn/danger as defined. Trailing meta (`FOLLOWING`) right-aligned, ink-3.

### 6.13 List row
```
|■✓ B-14  BOOSTER            100 % PROP|   glyph 12 | name type-strong / sub type-label ink-3 | key value right, tabular
|   TERMINAL COUNT                     |
```
- In a `role="listbox"` (single-select) or `<table>`-like grid for Tanks; row = `role="option" aria-selected`.
- Data: `{id, glyph, name, sub, keyValue, keyUnit, state}`.
- States: default; hover paper-2; **selected/followed = accent-tint bg + 2 px accent left rule, ink text** (ink on tint 15.98); warn (`△` glyph, sub-status may use accent-text (passes on tint/paper-2 since Gate 1), 2 px accent right edge); danger (row left edge hazard band 4 px + `▲`, text ink); disabled/offline (hatch, ink-4).
- Behavior: click/Enter = select + camera focus; double-click/F = follow; rows never reorder while hovered or focused (sort freezes, resumes on leave).

### 6.14 Tabbed panel (VEHICLES / TANKS / TASKS / RANGE / EVENTS)
```
+[VEHICLES]|TANKS|TASKS|RANGE|EVENTS ▲2+   active tab: ink text, 2px ink underline; others ink-3
|filter: ALL ▾  SORT: STATUS ▾   12 ITEMS |
|row…                                    |
+-----------------------------------------+
```
- `role="tablist"` / `role="tab" aria-selected` / `role="tabpanel"`; roving tabindex, ←/→ between tabs, `Alt+1…5` direct.
- Tab contents: **Vehicles** (all mobile entities), **Tanks** (`LOX-1 82 % · BOIL-OFF 0.4 %/H`, fill bar), **Tasks** (logistics/build tasks with progress, assignee, ETA; actions: prioritize, cancel), **Range** (boats/aircraft in hazard zone, WX stations, sea state), **Events** (log lines §6.23, filter by severity).
- Tab badge: count of items in warn/danger (`▲2` danger style, `△1` warn).
- Height fixed; internal scroll with 1 px ink scrollbar thumb, paper-3 track (styled, square).

### 6.15 Tank row (Tanks tab variant)
`□ LOX-1  LIQUID OXYGEN   ████████░░ 82 %  −0.4 %/H` — inline fill bar 64×6 (ink on paper-3), warn when below reserve for the planned load.

### 6.16 Event / task rows reuse list row anatomy with `<time>` prefix.

### 6.17 Countdown timeline
```
+[ COUNTDOWN ] LC-1 · B-14 / S-31 ---------------[II|1×|10×|100×]---- T-00:00:04 +
|■■■■■■■■■|■■■■■■■|■■■■■■■■■▓▓▓▓▓▓■■■|■■■■■■│░░|//////|//////|////////|/////// |
|☑ ROLLOUT ☑ STACK  ☑ PROPELLANT LOAD   ◐ TERMINAL COUNT  ○ LIFTOFF ○ BOOSTBACK ○ TOWER CATCH ○ SAFING|
+-------------------------------------------------------------------------------+
```
- `<section aria-label="Countdown">`; header `[ COUNTDOWN ]` + context; T-clock `<time aria-live="off">` in `type-macro-clock` (a separate SR-only live region announces each phase change and T-10/T-5/T-0); phase bar `<ol>` of phases, each `<li aria-current="step">` for current.
- Data: `ui.countdown {pad, vehicles, tSeconds, sign, phases[{id,label,start,end,state: done|current|pending|held|skipped}], holds[], playheadT, scale}`.
- Segments: width ∝ planned duration (min 48 px); done = ink fill; current = ink fill up to playhead then paper-3; pending = `pattern-hatch` (future); **playhead** = 2 px accent vertical line full height + ink 5 px triangle on top; a hold window = accent fill block (`▓`) on the bar with ink border. Labels: `☑` done, `◐` current (bold), `○` pending, `⊘` skipped.
- States: hold (`T-00:00:04 HOLD` — clock frozen, clock gets 2 px accent border, word `HOLD` accent-text); recycle (playhead jumps back, hard cut); scrub (whole bar hatch, clock `SCRUB` in danger style); post-liftoff clock switches to `T+` instantly.
- Behavior: clicking a phase opens its task list (Tasks tab filtered). Phase change triggers the stamp (§6.26).

### 6.18 Big T-clock
Format `T−HH:MM:SS` / `T+HH:MM:SS`, sign glyph fixed-width, tabular, never re-centers (right-aligned in fixed `14ch` box). Above 99 h: `T−4D 06:12`. Sub-seconds never shown.

### 6.19 Map controls
```
[+] zoom in      32×32 squares, 1px ink frame, gap 1px column
[−] zoom out
[‹] rotate left
[›] rotate right
[⊞] frame selection
[⌂] home view (site)
[⌖] recenter on followed
```
- `<div role="toolbar" aria-orientation="vertical" aria-label="Camera">` of `<button aria-label>` with `title` showing the key (`+ / −`, `Q / E`, `Z`, `H`, `C`).
- States: hover paper-2; pressed paper-3; active mode (e.g. follow on) = ink fill, paper glyph; disabled (nothing selected → frame/recenter disabled).
- Hold-to-repeat on zoom/rotate at a fixed step rate (no inertia in UI; camera easing is render side).

### 6.20 In-world label tag
```
default   [◐ TOWER-1]        paper bg, 1px ink border, type-label ink, glyph 12; 20px tall
selected  [◐ B-14]           accent fill, ink border, ink text (6.35)  + ground selection ring in 3D
alert     [▲ WX-1]           ink fill, paper text, orange ▲ glyph (inverted plate)
sel+alert [▲ B-14]▚▚         accent fill + 4px hazard band on right edge
hover     [◐ PK-03]          paper-2 bg, 2px ink border
            │  leader line: 1px ink-4 (selected: 1px accent), vertical, from tag bottom-center
            ·  anchor: 3px ink square at SOCKET_Label
```
- DOM tag (CSS2D-like) or instanced sprites — render team's call; visual spec is identical. `<button aria-label="B-14, booster, ascent">`.
- Behavior: placed at `SOCKET_Label`; screen-space size constant; declutter: priority selected > alert > followed class > rest, lower priority tags collapse to the anchor square when overlapping; hidden beyond LOD distance; never occluded by HUD cards (tags under a card are hidden). Click = select, double-click = follow.

### 6.21 Altitude scale
```
 45 -
    -
 30 ◄       ◄ = followed entity's altitude marker (ink triangle; accent when entity in danger)
    -
 15 -
 00 -
600 M       readout of exact value, type-label
```
- `<div role="img" aria-label="Altitude 8.3 kilometres">`; ticks ink-4 1 px, numerals `type-tick` ink-3. Range auto-scales by entity class (vessel: 0–200 M, booster: 0–60 KM) with stepped re-scale (hard cut). Hidden when nothing is followed or entity is ground-bound.

### 6.22 Compass tape
```
 180 . | . 210 . | . 240 . | . 270
               ▲
              222°
```
- `role="img"` with label `Heading 222 degrees`; camera heading (or followed vehicle heading when following). Tape moves linearly; center caret ink, readout `type-label` fixed 4ch. Window ±60° (±45° compact). Cardinal letters `N E S W` replace 0/90/180/270.

### 6.23 Event toast / log line
```
toast:  +-------------------------------------------+
        |▲ 13:42:16  B-14  ENGINE OUT · 32 OF 33  ✕ |   danger: accent fill strip left (8px) + band
        |  [FOLLOW]  [ACK]                          |
        +-------------------------------------------+
log:    13:42:16  ▲  B-14   ENGINE OUT · 32 OF 33          (<samp>, type-body, ink; glyph conveys severity)
        13:41:58  ■✓ LC-1   TERMINAL COUNT STARTED
```
- Toast container `role="region" aria-label="Notifications"`; each toast `role="status"` (info/ok/warn) or `role="alert"` (danger). Max 3 visible, newest top; overflow → `+2 MORE` → Events tab.
- Durations: info/ok 4 s, warn 8 s, danger sticky until ACK. Hover/focus pauses timers. Enter slides 200 ms mech ease from top (translate, no fade); exit hard cut.
- Log lines: `<time>` + glyph + entity code (link) + message; never truncated mid-number.

### 6.24 Go/No-Go poll panel
```
+[ GO / NO-GO POLL · TERMINAL COUNT ]---+
|STATION        STATUS      BY          |
|WEATHER   WX   ■✓ GO       WX-1        |
|RANGE     RNG  △ HOLD      RB-9 IN ZONE|   warn row: 2px accent left rule
|PROPELLANT PRP ■✓ GO       LOX 100 %   |
|VEHICLE   VEH  ■✓ GO       B-14 / S-31 |
|CREW REST CRW  ■✓ GO       SHIFT 6:10 H|
|RECOVERY  REC  ○ POLLING…  RV-1        |
|---------------------------------------|
|RESULT: △ 1 HOLD          T-00:10:00 ⏸ |
|[PROCEED ⏎] [HOLD H] [RECYCLE R] [SCRUB]|  SCRUB = danger button, confirm dialog
+---------------------------------------+
```
- `<section role="region" aria-labelledby>`; stations as `<table>` (caption, `<th scope>`); result `<output aria-live="polite">`; buttons `<button>` with `<kbd>`.
- Data: `ui.poll {phase, stations[{id,label,status: GO|HOLD|NO-GO|PENDING, detail, source}], result, deadlineT, actions[{id,enabled}]}`.
- States: polling (pending rows step through `○ → ◐`), all GO (PROCEED is default button, ink fill), any HOLD (PROCEED disabled with reason, HOLD default), any NO-GO (danger header band; SCRUB/RECYCLE emphasized), expired (auto-hold per GDD).
- Behavior: appears in `poll` area when the sim opens a poll; time scale forced to 1× while open (GDD to confirm); focus moves to the panel; closing requires a decision. Station code click = select its source entity.

### 6.25 Time-scale control
```
[ II | 1× | 10× | 100× ]     selected: ink fill, paper text; locked (poll/terminal count): hatch on 10×/100×
```
- `role="radiogroup" aria-label="Time scale"` of `role="radio"`; `Space` pause toggle, `,` / `.` slower/faster.
- Data: `ui.time {scale ∈ 0|1|10|100, lockedMax, reason}`. Paused: a `PAUSED` stamp (warn style, 2 px accent frame) on the T-clock box; the world keeps rendering.

### 6.26 Phase-transition stamp
`LIFTOFF` in `type-macro-stamp`, ink on paper plate with 2 px ink frame and `[ PHASE 05 / 08 ]` micro header, centered over `world`; 3-step appear (`steps(3)`), hold, hard cut; total 640 ms (static 1 s plate under reduced motion). Pointer-events none; `aria-hidden` (the countdown live region announces).

### 6.27 Dialog (confirm scrub/abort/divert)
`<dialog>` modal, 480 px, 2 px ink frame, danger header band for irreversible actions; consequence list (`PENALTY 2.4 M`, `TURNAROUND +3 D`); buttons `CANCEL` (default focus) and `SCRUB` (danger style). Esc cancels.

---

## 7. Iconography & glyph set

12×12 px grid (16 for large), 1.5 px ink stroke or solid ink, square caps, no curves except ◐/○/↺. Monochrome; orange appears only as a fill on `warn`/`danger`/`selected` triangles/blocks. Drawn as SVG symbols (`<symbol id="g-…">`) — Unicode in this doc is the fallback/notation.

| Glyph | ID | Meaning |
|---|---|---|
| `■✓` | `g-ok` | GO / ready / done-nominal |
| `☑` | `g-done` | Phase done |
| `◐` | `g-current` | Current phase / in progress / safing |
| `○` | `g-pending` | Pending / polling |
| `□` | `g-idle` | Idle, parked (hollow) |
| `■` | `g-parked` | Parked & secured (solid) |
| `›` | `g-driving` | Driving / moving (ground) |
| `»` | `g-patrol` | Patrolling / transit (sea) |
| `↺` | `g-holding` | On station, holding pattern |
| `↑` | `g-ascent` | Ascent |
| `↓` | `g-descent` | Landing burn / descent |
| `↶` | `g-boostback` | Boostback |
| `⊠` | `g-caught` | Caught by tower / secured |
| `▥` | `g-fueling` | Loading / transferring propellant |
| `‖` | `g-stacked` | Stacked on pad |
| `⊞` | `g-build` | Under construction / refurbishment |
| `⊘` | `g-offline` | Offline / disabled / skipped |
| `△` | `g-warn` | Warning (hollow, orange stroke, ink `!`) |
| `▲` | `g-danger` | Danger / fault (solid orange, ink `!`) |
| `◆` | `g-selected` | Selected marker (minimap/legend only) |
| `+` | `g-crosshair` | Grid intersection mark |

Syntax decoration (structure, not ornament): `[ TITLE ]` card heads, `>>>` for "next" in task chains, `///` hatch for future spans, `REV 0.1 · UNIT LC-1` stamp in the top-bar logo cell tooltip and `/design` header only.

---

## 8. Accessibility & keyboard

- Contrast per §2.2; no information by color alone (§2.3); orange always paired with ink.
- Focus visible on everything (`:focus-visible` ink 2 px square ring, offset 2 px; on orange fills the ring is ink outside the ink border — still visible).
- Hit targets ≥ 24×24 (map controls 32).
- Live regions: one polite (`#fx-live-polite`: phase changes, range status, poll result), one assertive (`#fx-live-assertive`: danger alerts only). Throttled: max 1 announcement / 2 s, merged.
- Screen readers get tabular equivalents of charts; T-clock is not live (announces milestones only).
- `prefers-reduced-motion` per §2.8. `prefers-contrast: more`: ink-3 → ink-2, interior rules → ink.
- Zoom: HUD supports 125 % root scale at 1920×1080 without overlap (it becomes compact mode).
- Skip link `Skip to panels` as first focusable. Focus order: top bar → flight card → poll → inspector → tabs → timeline → map controls → world labels.

**Keyboard map** (shown in `?` sheet; no single-letter key fires while typing in an input):

| Key | Action |
|---|---|
| `/`, `Ctrl/⌘+K` | Focus search |
| `Esc` | Close popover/dialog → clear search → deselect |
| `Tab` / `Shift+Tab` | Move between regions/controls |
| `↑ ↓` / `Home End` | Move in lists, dropdowns |
| `← →` | Switch tab (in tablist); time scale (in radiogroup) |
| `Alt+1…5` | Vehicles / Tanks / Tasks / Range / Events |
| `Enter` | Select + focus camera on row/tag |
| `F` | Follow / unfollow selected |
| `C` / `H` / `Z` | Recenter on followed / home view / frame selection |
| `+` / `−` | Zoom · `Q` / `E` rotate |
| `Space` | Pause / resume |
| `,` / `.` | Time scale down / up |
| `A` | Jump to oldest unacknowledged alert · `Shift+A` ack focused alert |
| `G` | Focus Go/No-Go poll (when open) · in poll: `Enter` proceed, `H` hold, `R` recycle |
| `?` | Shortcut sheet |

(Camera WASD/drag bindings belong to ARCHITECTURE/render; they must not collide with the above.)

---

## 9. `/design` page spec

A static route (or Storybook per ADR), no sim running, fixtures only, screenshotted by `visual-check` at 1920×1080 and 1280×720. Sections, in order, each with an anchor:

1. **Header**: `[ FUEL-X DESIGN SYSTEM ] REV x.y` + token source hash.
2. **Color**: swatch per token (hex, CSS var, TS name), the contrast matrix of §2.2 rendered live from tokens with pass/fail, pattern swatches (hazard, hatch, noise).
3. **Semantic states**: each state as chip, badge, row, tile, label tag side by side; plus a grayscale-filtered copy to prove distinguishability.
4. **3D tokens**: swatches + a small three.js turntable (or Blender preview) of a clay cube, point-cloud patch, exhaust sprite, selection ring.
5. **Typography**: every micro step with sample `B-14 · 47 KM/H · 100.0 %`, every macro step with `T−00:00:04`, `B-14`, `LIFTOFF`; a tabular-digit jitter test (counter 0→9999 must not shift width).
6. **Spacing, rules, z-layers, motion**: scale bars; motion demos (hover, toast enter, stamp, playhead) with a reduced-motion toggle.
7. **Glyph set**: all glyphs at 12 and 16 px, on paper, paper-2, tint, accent.
8. **Components**: each §6 component in all states (default/hover/focus/selected/warn/danger/disabled/empty/stale) — top bar, site switcher open, search with results, badges, alert counter, user chip, flight card, metric tile, segmented & linear progress, inspector (booster, vessel, transporter), status chips, tabbed panel per tab, list rows, countdown at 4 states (pre, hold, T+, scrub), map controls, label tags over a neutral clay image, altitude scale, compass tape, toasts + log, poll panel (polling / all GO / hold / no-go), time-scale, stamp, dialog.
9. **Full HUD frame** with fixture data over a static background render, at both viewport sizes, grid areas outlined with crosshairs (toggle).
10. **Keyboard map** table generated from the same keymap source as the app.

---

## 10. Review checklist (UI PRs)

- [ ] Token grep from `design-tokens` returns nothing outside the token source.
- [ ] No `border-radius`, `box-shadow`, gradients (patterns are SVG images), `opacity` on panels, `backdrop-filter`, `filter: blur`.
- [ ] Only one hue (accent family) besides the ink/paper ramp; orange used only for attention/selection/thrust/zones.
- [ ] No orange text except `accent-text` on `paper`/`paper-2`/`accent-tint`; text on orange fills is ink.
- [ ] Every state has glyph + word; grayscale screenshot still readable.
- [ ] All numbers tabular, fixed slots, units uppercase; `—` for missing data.
- [ ] Macro-type used only for T-clock, followed call-sign, phase stamp; `clamp()` only there.
- [ ] Containers `pointer-events: none`, interactive children `auto`; world clicks pass through empty HUD.
- [ ] Reads from the throttled projection; no per-tick subscriptions; no count-up animations.
- [ ] Semantic elements (`<data>`, `<output>`, `<dl>`, `<samp>`, `<kbd>`, `<time>`, `<meter>`, `<progress>`, ARIA tabs/listbox/toolbar/radiogroup).
- [ ] Keyboard path for every action; focus ring visible; no keyboard traps except modal `<dialog>`.
- [ ] Reduced-motion honored; motion uses only `ease-mech`/`linear`/`steps`.
- [ ] Layout verified at 1920×1080 and 1280×720 (no overlap, compact rules applied).
- [ ] Widget maps to a GDD decision (§5).
- [ ] `/design` updated with the new/changed component and all its states; `visual-check` screenshots attached.

---

## 11. Open questions (for Gate 1)

1. ~~accent-text value~~ — resolved at Gate 1: `#B23B0B`.
2. `#FF5A1F` is 2.83:1 against paper — below the 3:1 non-text target. Spec mitigates by always pairing with ink; acceptable?
3. Poll panel forcing 1× time scale and auto-hold on deadline — GDD to confirm.
4. Label tags as DOM vs instanced sprites (perf with 100+ entities) — render/architect decision; visual spec unchanged.
5. Self-hosted fonts vs Google Fonts — styling ADR.
