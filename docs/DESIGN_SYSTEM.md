# Fuel-X — Design System

> Owner: `ui-design-system`. Status: Gate 1 approved; Phase 6 addendum (6.0: decision strip §6.28, debrief §6.29, rate control §6.25, primitives §6.30–6.36, view-model contract §13).
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
| `--fx-3d-pad-concrete` | `tokens.world.padConcrete` | `#EFEEE9` | Pads, roads, terrain concrete lots (lighter than ground); `MAT_Concrete` base — pad apron slab (5.11) |
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

Component sizes (added in 6.2, all `tokens.size.*`):

| Token | Value | Use |
|---|---|---|
| `--fx-size-spark-w` · `--fx-size-spark-h` | 120px · 20px | Sparkline box (§6.8) |
| `--fx-size-segment` | 16px | Width of one segmented-progress cell (§6.9) |
| `--fx-size-bar` | 6px | Height of linear progress, segment cells, inline tank bar (§6.9, §6.10) |
| `--fx-size-deadline` | 8px | Deadline bar track height (§6.30) |
| `--fx-size-tag` | 20px | Label tag height (§6.20) |
| `--fx-size-popover` | 280px | Tooltip / popover max width (§6.32) |
| `--fx-size-toast` | 400px | Toast width (§6.23) |
| `--fx-size-dialog` | 480px | Confirm dialog width (§6.27) |
| `--fx-size-debrief` | 880px | Debrief sheet width (§6.29) |
| `--fx-size-tile` | 160px | Metric tile min width (§6.8) |

HUD frame sizes (added in 6.3, `tokens.size.*`; compact values apply through the `hud` container query, §3.5):

| Token | Standard · compact | Use |
|---|---|---|
| `--fx-hud-gutter` · `--fx-size-hud-gutter-compact` | 16px · 12px | Outer gutter columns/rows |
| `--fx-size-topbar` · `--fx-size-topbar-compact` | 40px · 36px | Top-bar row |
| `--fx-size-hud-left` · `-compact` | 320px · 272px | Left column (flight card, poll) |
| `--fx-size-hud-alt` · `-compact` | 56px · 44px | Altitude-scale rail |
| `--fx-size-hud-rail` · `-compact` | 40px · 32px | Map-control column and compass row |
| `--fx-size-hud-right` · `-compact` | 400px · 336px | Right column (inspector over tabs) |
| `--fx-size-hud-timeline` · `-compact` | 112px · 88px | Countdown band row |
| `--fx-size-hud-tabs` · `-compact` | 600px · 260px | Tabbed-panel height (inspector takes the rest) |
| `--fx-size-hud-sites` | 440px | Site-switcher sheet width |

State semantics added in 6.2: a **capped** segment (rate above the current cap, §6.25) is hatched but keeps `ink-3` text (5.91, still selectable); only `aria-disabled` items drop to `ink-4`. Stale values (§6.36) print in `ink-3` over the hatch, not `ink-4`, because they stay readable data.

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

The HUD is one CSS grid laid over the canvas (`position: fixed; inset: 0`). Columns (px): `16 | 320 | 56 | 1fr | 40 | 8 | 400 | 16`. Rows: `40 | 16 | auto | 1fr | 40 | auto | 112 | 16` (row 6 = decision strip, 0 px when no decision is open).

```
grid-template-areas:
 "top    top    top    top     top     top   top     top"
 ".      .      .      .       .       .     .       ."
 ".      flight alt    toast   .       .     inspect ."
 ".      poll   alt    world   .       .     inspect ."
 ".      poll   alt    compass ctrl    .     tabs    ."
 ".      strip  strip  strip   strip   .     tabs    ."
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
| `strip` | Decision strip (§6.28), only while a decision is open; pushes nothing else (the row grows upward into `world`) |
| `time` | Countdown timeline (§6.17) incl. rate control (§6.25) |
| (centered over `world`) | Debrief sheet (§6.29), end of run |

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
- **As built (6.4) — inspector**: `src/ui/hud/inspector/priority.ts` holds the per-class priority (`COMPACT_PRIORITY`, keyed by the projected `InspectorVM.kind` and the metric keys of `project-entities.ts`; presentational, no bridge field). `compactMetricKeys(vm)` keeps 6: warn/danger metrics first (an alert is never hidden), then class priority, then unlisted keys in projection order; sets of ≤ 6 are untouched. Kept cells stay in projection order (a cell does not move when the viewport crosses the breakpoint); dropped cells carry `data-compact-drop` and are hidden by the `hud` container query, so the DOM is the same at both sizes. Priorities: booster `ENGINES · CATCH P · LANDING PROP · TOWER WIND · ALTITUDE · VELOCITY` (D3), ship `ALTITUDE · VELOCITY · ENGINES · PROP · DOWNRANGE · HEADING`, vessel `TARGET · SPEED`, transporter `CARGO · SPEED`, tanker `GATE ETA · CARGO · FLUID · SPEED · ORDER` (D1), tower, tank, weather station likewise; other classes fall back to projection order. The chart sits behind a `▸ CHART` / `▾ CHART` `<button aria-expanded aria-controls>` (closed by default, state kept per card). Poll collapse: the container sets `data-poll` when the poll panel is open (POLL decision or hold, same condition as §6.24); `@container hud (height < 900px)` then hides sub-line, metrics, progress, chart and actions — `F` still toggles follow. `/design` forces both with the `compact` / `headerOnly` props (section `INSPECTOR · COMPACT`). Screen: `docs/screens/phase6-panels-inspector-compact-1280.png`.

### 3.4 Pointer-events rules

- `.hud-root` and every grid area wrapper: `pointer-events: none`.
- Cards, panels, controls, buttons, inputs, popovers, toasts: `pointer-events: auto` (a click on a card must not select the entity behind it).
- World label layer: `none`; each label tag: `auto` (click = select/follow). Leader lines: `none`.
- Altitude scale, compass tape, noise, stamp: `none` (read-only).
- The canvas receives everything else (orbit, pick). Wheel over a scrollable panel scrolls the panel, not the camera.

### 3.5 Slot API (as built 6.3)

`src/ui/hud/HudRoot.tsx` mounts `HudFrame` (`src/ui/hud/frame/HudFrame.tsx`) over the canvas. It also holds the glyph sprite, the two live regions (`#fx-live-polite`, `#fx-live-assertive`, written through `announce(text, level)` from `frame/live.tsx`, throttled to one message per 2 s with merging), the `SKIP TO PANELS` link (target `#hud-panels` = the right column) and the global keys (`frame/keys.ts`: `Space`, `,` `.`). The app passes its debug readout through `debug`. It shows at the bottom left of the world area and ignores the pointer.

**Slots** (`frame/slots.ts`, names are an API):

| Slot | Grid area | Pointer | Owner |
|---|---|---|---|
| `top` | top bar row | auto | 6.3 |
| `flight` | left column, row 3 | auto | 6.4 |
| `poll` | left column, rows 4–5 | auto | 6.5 |
| `alt` | altitude rail, rows 3–5 | **none** | 6.6 |
| `toasts` | over the world, row 3 (z-toast) | auto | 6.7 |
| `compass` | world column, row 5 | **none** | 6.6 |
| `ctrl` | rail, rows 4–5, bottom-right aligned | auto | 6.6 |
| `inspect` | right column, flexes above `tabs`, takes the remaining height | auto | 6.4 |
| `tabs` | right column bottom, height `--hud-tabs` | auto | 6.4 |
| `strip` | row 6 (auto height, grows up into the world) | auto | 6.5 |
| `time` | row 7, countdown band | auto | 6.5 |
| `overlay` | rows 3–7 × cols 2–7, centred, z-stamp | auto | 6.7 (stamp, debrief) |

**How to mount:** add one line to `src/ui/hud/mounts.tsx` (`HUD_MOUNTS: Partial<Record<HudSlotName, ComponentType>>`). Each mounted component takes no props and reads the projection itself through a narrow selector. A slot with no mount renders no DOM. Each slot wrapper is a flex column with `min-width/height: 0` and `pointer-events: none`. In interactive slots the direct children get `pointer-events: auto` at zero specificity (`:where()`), so a component can still opt out on its own root. A panel that may overflow should set `min-height: 0; overflow: auto` on its own root. `HudFrame` also takes a `slots` object, which lets `/design` render presentational views. `contained` positions it inside a sized parent, and `outline` prints empty slot names.

**Compact and minimum viewport** use container queries on the HUD host (`container: hud / size`): `@container hud (width < 1600px) or (height < 900px)` for compact, and `(width < 1280px) or (height < 720px)` for the `[ VIEWPORT 1280×720 MIN ]` plate. Component CSS can use the same `hud` container query for its own compact rules. Deviations from §3.1: the right column ends on row 7, keeping the bottom gutter, and inspector + tabs are one flex column, so they never overlap. The wide ≥ 2560 root multiplier and pausing the sim under the minimum plate are not built yet.

**Top bar (6.3):** collapsed debrief → `[■ DEBRIEF READY B]` cell after the spacer (from `debriefUi`; the overlay renders nothing while collapsed) · `FX` mark · `CALDER / VARNE COAST / [LC-1 BRACKWATER ▾]` · sim UTC · `SIM n×` readout (warn frame when paused or lagging) · RANGE badge (→ `view.tab('range')`, tooltip = worst reason, hatched `RANGE —` without a launch) · alert counter (→ `view.tab('events')`, assertive announcement only for a new danger alert) · `LAUNCH DIRECTOR`. Org/region are UI constants (not projected). Locked sites stay navigable listbox options (`aria-disabled`, hatch, status + `LOCKED IN THIS BUILD`, ink-3 so the reason stays AA). The search (§6.3) and the 1/s danger invert of the alert counter are not built: the invert would break the frozen-frame e2e equality.

**Rate control (6.3)** lives in the countdown band header, as §6.25 places it. The top bar mirrors only the readout. In compact mode the SKIP button keeps its glyph and key and drops the milestone text. At run end (`timeScale.runEnded`, falling back to `debrief !== null`) every segment and SKIP are `aria-disabled` with `RUN ENDED`. A one-shot drop (`timeScale.drop`) prints its own chip next to the cap chip and never hatches segments.

---

## 4. Shared component conventions

- Every card: `paper` bg, `--fx-rule-frame`, header `[ TITLE ]` in `type-strong`, body is a `display:grid; gap:1px` on an `ink-5` parent with `paper`/`paper-2` children.
- States vocabulary for all interactive parts: **default** (paper), **hover** (paper-2, 80 ms), **pressed** (paper-3), **selected** (accent-tint bg + 2 px accent left rule for rows; accent fill + ink text for small badges), **alert** (per §2.3 warn/danger), **disabled** (hatch, ink-4, `aria-disabled`), **focus-visible** (focus ring).
- Values come from the throttled UI projection (`ui.*` selectors, names illustrative; ARCHITECTURE.md is authoritative). No component subscribes to per-tick sim data.
- Telemetry semantics: values in `<data value="…">` (machine value in SI, display in UI units) or `<output>` when computed live; label/value pairs in `<dl>`; key hints in `<kbd>`; log lines in `<samp>`.
- Missing data renders `—` in the same slot (never collapses), state `neutral`.

---

## 5. Decision map (why each component exists)

Synced with GDD §10 / §13.2 in 6.0. D1–D3b are the MVP decisions (GDD §13.2).

| Component | Player decision served | GDD §10 verdict |
|---|---|---|
| Site switcher | Where to act / expand (strategy layer) | MVP display only (other sites disabled) |
| Search | Find & follow any entity fast | MVP stub: filters the tabbed panel |
| UTC clock + **rate control** (§6.25) | Window timing; compress dead air, play the count at 1× | keep + ADD |
| `TLM 38 MS` cell | — | **repurposed** as the effective sim-rate readout `SIM 10×` (§6.25) |
| Range badge, alert counter | D2 GO/HOLD/RECYCLE/SCRUB; notice anomalies | keep |
| User chip | — (frames the fantasy) | role label `LAUNCH DIRECTOR` only, no avatar/initials plate |
| Flight card | D1 margin (prop % + farm reserve tick), D2 (`STATIONS GO n OF 5`, range trend) | keep / REDEFINE stages → stations |
| Poll panel (§6.24) | D2 evidence (station table) | keep; the **buttons live in the decision strip** |
| **Decision strip** (§6.28) | D1, D2, D3, D3b: the only command surface for the four decisions | ADD |
| Inspector | D3 margin (landing prop, engines, tower wind), monitoring | keep |
| Tabbed panel | Dispatch logistics (Tasks = D1 order rows), follow, review (Events), D2 (Range) | keep |
| Countdown timeline | When to hold; hold glyph; window open/close markers | keep |
| **Debrief panel** (§6.29) | Learning / next turnaround (outcome, deltas, decision log) | ADD |
| Map controls, labels, altitude scale | Spatial awareness for D2 (range) and D3 (where is the booster) | keep |
| Compass tape | — | FLAG ambience, low priority (built last, cut first) |

Components without a decision are removed; ambience items are allowed only where GDD §10 says *keep*.

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
[■✓ RANGE GO]   [△ RANGE MARGINAL]   [▲ RANGE NO-GO]  (danger: orange fill, ink text, hazard band left edge)
```
- `<button>` (opens Range tab) containing `<output aria-live="polite">`. Data: `ui.range.aggregate ∈ GO|MARGINAL|NO_GO|NONE`, `ui.range.reason` (worst station, §13).
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
- **As built (6.4)** — `src/ui/hud/tabs/*`: active tab = `viewStore.tab` (`view.tab`), so `Alt+1…5`, `+N MORE` and the flight card's `TASKS ›` land on the same panel; tablist name `Site lists`. Badge = danger count if any, else warn (`lists.badges`). Vehicles: click = `view.select`, double-click / `F` = `view.follow`. Tanks: §6.15 trail (64×6 bar, reserve tick, %, boil-off). Tasks: rows carry their `ActionVM` buttons → `commands.send(action.command)`. Range: station table (code links to `sourceId`) + `rangeAssets` rows. Inspector (`src/ui/hud/inspector/*`): macro call-sign only when followed; FOLLOW `F` (global, skipped when a list row already handled `F`) and FRAME (`view.camera({kind:'frame'})`) are UI actions; projected actions with `confirm` open the §6.27 dialog first; the chart is the sparkline stretched to the card (last-point square hidden). Flight card (`src/ui/hud/flight/*`): the farm reserve tick is a 2 px gauge under the propellant value (`farmReserve` clamped to its track) with `FARM <fluid> <h>`; contract id on the vehicles sub-line.

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
- **As built (6.7)** — `src/ui/hud/events/{EventLog,Toasts,toast-queue}`. Toast sources: *alerts* (`alerts.items`, condition-based) → warn 8 s, danger sticky with `ACK` (= `view.ackAlert`), removed as soon as acked or the condition clears; *log rows* (`lists.events`) → ok/info 4 s, warn 8 s, danger sticky with `ACK` (local dismiss). Log codes that already have a surface or are per-step noise are never toasted (`StationChanged`, `HoldStarted`, `DecisionRequired`, `AnomalyFired`, `EnginesChanged`, `WindowMissed`, `RecoveryOutcome`, `EntityStateChanged`, `FlightEvent`, `ArmsChanged`, `Despawned`), so a condition never shows twice. The log present at mount is not replayed. Timers are wall-clock UI time (never the sim) and pause while the pointer or focus is inside the stack. `+N MORE · EVENTS TAB` is a button (`view.tab('events')`). Events tab filter: ALL / WARN + / DANGER (segmented control, local state).

### 6.24 Go/No-Go poll panel
```
+[ GO / NO-GO POLL · T-00:10:00 TERMINAL ]--+
|STATION        STATUS        DRIVER         |
|WEATHER   WX   ■✓ GO         GND 8.1 M/S    |
|RANGE     RNG  ▲ NO-GO       UNK-01 IN AREA |   danger row: 4px hazard band left
|PROPELLANT PRP △ MARGINAL    LOX 0.6 HOLD-H |   warn row: 2px accent left rule
|VEHICLE   VEH  ■✓ GO         HEALTH 0.98    |
|PAD/CREW  CRW  ■✓ GO         SHIFT 6:10 H   |
|--------------------------------------------|
|RESULT  △ 1 MARGINAL · ▲ 1 NO-GO   4 OF 5   |
+--------------------------------------------+
```
- `<section role="region" aria-labelledby>`; stations as `<table>` (caption, `<th scope>`); result `<output aria-live="polite">`.
- Data: `ui.range.stations[]` = `StationVM {id, code, label, status: GO|MARGINAL|NO_GO|PENDING, driver, value, source}` (§13). Station vocabulary is the GDD's **GO / MARGINAL / NO-GO** (MARGINAL = warn, NO-GO = danger, PENDING = `○ POLLING…` neutral).
- **6.0 change:** the panel is evidence only. The GO / HOLD / RECYCLE / SCRUB buttons live in the decision strip (§6.28), which is the single command surface, so there is never a second set of buttons for the same decision. Clicking a station code selects its source entity (`UNK-01`, `WX-1`, `LOX-1`).
- States: polling (pending rows step `○ → ◐`), all GO, any MARGINAL, any NO-GO (danger header band). Shown in `poll` while a poll is open and during any hold; collapsed to its header otherwise.

### 6.25 Rate control (time compression)
```
default    [ II | 1× | 10× | 100× | ▸▸ T-01:20:00 POLL ]   SIM 10×
paused     [ ■II| 1× | 10× | 100× | ▸▸ … ]                 SIM PAUSED    (II = ink fill; PAUSED plate on T-clock)
locked     [ II | 1× |▨10×▨|▨100×▨| ▨▸▸▨ ]  ⊘ 1× LOCKED · TERMINAL COUNT   (hatch, aria-disabled, reason text)
capped     [ II | 1× | 10× |▨100×▨| ▸▸ … ]  ⊘ MAX 10× · PROPELLANT LOAD
lagging    [ II | 1× | 10× | 100× | ▸▸ … ]  △ SIM 7.4× OF 100×             (warn: 2px accent frame on readout)
skipping   [ II | 1× | 10× | 100× |◐ SKIPPING… ]  SIM SKIP → T-01:20:00   (all segments aria-disabled until arrival)
```
- Placement: in the countdown header (§6.17) and mirrored as the `SIM` readout in the top bar (replaces `TLM 38 MS`, GDD §10).
- Element: segmented control (§6.33) = `role="radiogroup" aria-label="Time rate"` of `role="radio"` (II, 1×, 10×, 100×), plus a separate `<button>` **SKIP** whose label names the target milestone (`▸▸ T-01:20:00 LOAD POLL`); readout `<output aria-live="off">`.
- Data: `TimeScaleVM {requested, effective, maxAllowed, paused, lagging, effectiveRate, lockReason, skip{enabled, target, reason}}` (§13).
- States:
  - **selected** = the *requested* rate (ink fill, paper text). If `effective < requested` the selected segment keeps the ink fill and a 2 px accent underline marks the effective one, so the player sees both what they asked for and what runs.
  - **locked / capped** (`maxAllowed < 100`): segments above the cap get `pattern-hatch` + ink-4 text, `aria-disabled="true"` (still focusable, announce reason); the reason chip (`⊘ 1× LOCKED · TERMINAL COUNT`, `⊘ 1× · DECISION OPEN`, `⊘ 1× · NO-GO`) sits right of the control. Requesting a capped rate is allowed and remembered (GDD §6: the game never auto-raises; when the cap lifts the requested rate applies because the player asked for it) — the requested segment shows a hatched fill with an ink border to say "queued".
  - **lagging** (`effectiveRate < 0.9 × effective` over 1 s): readout switches to `SIM 7.4× OF 100×` in warn style. No modal, no auto-change.
  - **paused**: II segment selected; `PAUSED` plate (warn, 2 px accent frame) on the T-clock box; world keeps rendering.
  - **skip**: disabled with reason when forced 1×, a decision is open or no milestone is scheduled; while skipping the control shows `◐ SKIPPING…` and is inert; arrival = hard cut + phase stamp if a phase changed.
- Keyboard: `Space` pause/resume, `,` / `.` slower/faster (skips capped steps with an announcement), `←/→` inside the group, `N` skip to next milestone. Rate changes announce in the polite region (`RATE 10×`, `RATE LOCKED 1×, TERMINAL COUNT`).

### 6.26 Phase-transition stamp
`LIFTOFF` in `type-macro-stamp`, ink on paper plate with 2 px ink frame and `[ PHASE 05 / 08 ]` micro header, centered over `world`; 3-step appear (`steps(3)`), hold, hard cut; total 640 ms (static 1 s plate under reduced motion). Pointer-events none; `aria-hidden` (the countdown live region announces).

**As built (6.5 follow-up):** `src/ui/hud/stamp/*`, mounted in the `overlay` slot next to the debrief through a composite in `mounts.tsx`. It is printed only on a phase *change* while the sim runs; a phase reached by a headless jump or a load (sim paused) is not stamped, so frozen screenshots never catch a transient plate. The 640 ms life is wall-clock (JS cut); the CSS prints it in `steps(3)` over the first third.

### 6.27 Dialog (confirm scrub/abort/divert)
`<dialog>` modal, 480 px, 2 px ink frame, danger header band for irreversible actions; consequence list (`PENALTY 2.4 M`, `TURNAROUND +3 D`); buttons `CANCEL` (default focus) and `SCRUB` (danger style). Esc cancels.

### 6.28 Decision strip (D1, D2, D3, D3b)

One opaque strip in the `strip` grid area, directly above the countdown timeline, full width of `flight → ctrl`. It is **the only place the four MVP decisions are taken** (GDD §10, §13.2): a question, its deadline, the evidence, the consequences of each branch and 2–4 buttons. At most one strip at a time; a newer decision queues behind (`+1 QUEUED · D2 D1` chip from `queuedKinds`) by priority **D3 > D3b > D2 > D1** (the projector picks; aligned in 6.5 with GDD §13.2.1, AC 30).

Anatomy (1920 wide):
```
+[ DECISION · D3 RECOVERY ]─────────────────────────────────────────────────── ⊘ 1× · DECISION OPEN ─+
| CATCH B-09 AT TOWER-1?                       | P(CATCH)  0.62  LEAN        | LANDING BURN  T+00:06:20 |
| AUTO AT DEADLINE: DIVERT (P < 0.65)          | ▕████████████▌░░░░░░░▏0.535 | ████████████░░░░  00:41  |
|----------------------------------------------+-----------------------------+--------------------------|
| DRIVERS  ENGINE OUT 32 OF 33  σ +0.9 M  · TOWER WIND 11.2 M/S  σ +0.4 M  · LANDING PROP 55 T  σ +0.6 M |
|------------------------------------+-------------------------------------+---------------------------|
| [ GO FOR CATCH  ⏎ ]  primary       | [ DIVERT  D ]  secondary            |                           |
|  SUCCESS 62 %  → +1.5 M REFURB     |  BOOSTER LOST  −40.0 M              |                           |
|  FAIL 38 %  → −86.0 M (TOWER 21 D) |  TOWER SAFE                         |                           |
|  EV  −33.6 M                       |  EV  −40.0 M                        |                           |
+----------------------------------------------------------------------------------------------------+
```
Cells: **question** (`type-title`, ink; second line `AUTO AT DEADLINE: …` in `type-label` ink-3 — the auto policy is always stated), **evidence** (decision-specific, below), **deadline** (§6.30), **drivers** (D3 only), **options** = one column per option: button (§6.33) + consequence `<dl>` + EV line.

| Variant | Opens when | Question / evidence | Options (key) | Deadline | Default at deadline |
|---|---|---|---|---|---|
| **D1 PROPELLANT MARGIN** | from scenario start while the road is open; re-raised on forecast change or station PROPELLANT ≠ GO | `ORDER PROPELLANT BEFORE ROAD CLOSURE?` · farm reserve `LOX 0.6 HOLD-H · CH4 0.9 HOLD-H` vs planned holds, open orders with ETA, LX/MX fleet `3 OF 4` | `STANDARD ×n` (S), `RUSH ×n` (R), `NO ORDER` (Esc) — steppers for n inside each option | `ROAD CLOSES T-00:40:00`; standard option disables itself at the standard cut-off (ETA would arrive after closure) with reason | nothing ordered |
| **D2 GO / NO-GO** | at each poll (T-01:20:00, T-00:10:00, T-00:00:40), whenever a station changes during the count, and on every hold | `POLL T-00:10:00 · 4 OF 5 GO` · station mini-row (5 chips) + reason of the worst one · risk line `GO ON MARGINAL: ASCENT RISK ×2.0` | `GO` (⏎), `HOLD` (H), `RECYCLE` (R, enabled only with propellant loaded + window remaining), `SCRUB` (danger, confirm dialog) | `WINDOW CLOSES` (shrinks during holds) | per sim: auto-GO when all GO and `autoGoWhenAllGreen`; else the clock stays held; window close = auto-scrub |
| **D3 RECOVERY** | no later than boostback end (AC 19) | `CATCH B-09 AT TOWER-1?` · *p* to 0.01 + band word (CLEAR / LEAN / CONTESTED / AGAINST) + a *p* bar with the break-even tick (0.535) · drivers with their σ contribution | `GO FOR CATCH` (⏎), `DIVERT` (D) | `LANDING BURN T+…` | catch if *p* ≥ 0.65 else divert; forced divert when landing prop < min (CATCH disabled, NO-GO) |
| **D3b GSE LEAK** | A3 fires | `CH4 QD LEAK · LOAD RATE ×0.5` · predicted load-complete T-clock for each branch vs the T-00:03:00 auto-hold | `CONTINUE DEGRADED` (C), `HOLD 20 MIN TO FIX` (H) | `WINDOW CLOSES` | continue degraded (see §13 gaps) |

Rules:
- **Honest numbers, no recommendation.** Every option prints its consequences (money, reputation, schedule, asset) and, where the GDD defines one, its **EV** in cr (D3 always; D2 SCRUB shows the certain penalty; D1 shows cost and the hold-minutes it buys). The auto/default option is marked `AUTO` (ink-3 tag), never visually emphasized as "recommended". The primary (ink fill) style is reserved for the commit-forward option (GO, GO FOR CATCH, CONTINUE, ORDER).
- **Severity of the strip** = the worst input: ok (all GO, *p* CLEAR) → `info` frame; warn (MARGINAL, LEAN, CONTESTED) → 2 px accent frame; danger (NO-GO, AGAINST, forced divert) → 4 px hazard band top edge + danger header. *p* band words: CLEAR = ok, LEAN = info, CONTESTED = warn, AGAINST = danger.
- **Time:** a blocking strip (D2, D3, D3b) drops the rate to 1× (GDD §6), shown in the header (`⊘ 1× · DECISION OPEN`). D1 is **advisory**: it does not touch the rate (else 5 h of prep would run at 1×) — it opens collapsed to one line (`D1 · ROAD CLOSES IN 03:12:00 · RESERVE 0.6 HOLD-H · ORDER ▸`) and expands on click/`O`.
- **Commit:** a button press sends one command through the bridge and the strip shows `◐ SENT · GO` until the projection reflects it (≤ 100 ms), then hard-cuts away. Irreversible options (SCRUB, DIVERT when *p* is CLEAR/LEAN) go through the confirm dialog (§6.27) listing the same consequences; others commit immediately.
- **Expiry:** at the deadline the strip prints `AUTO · DIVERT (P 0.62 < 0.65)` for 2 s (decision log entry `by: AUTO`), then cuts.
- Element: `<section role="region" aria-labelledby aria-describedby>` with the question as `<h2>`; consequences in `<dl>`; *p* in `<output>`; deadline `<progress>`/`<time>`. On open: focus moves to the strip (not into a button) and the assertive region announces `DECISION: CATCH B-09? P 0.62 LEAN, DEADLINE 41 SECONDS`.
- Keyboard: option keys above are **scoped to the strip** (active only while focus is inside it, so `H`/`C`/`D` never collide with camera keys), `G` focuses the strip, `Tab` cycles options, `Esc` collapses D1 (others cannot be dismissed, only decided or allowed to expire).
- Data: `DecisionVM` (§13), discriminated by `kind`.

### 6.29 Debrief panel

End-of-run sheet (GDD §4.9, §9, AC 22). Opens when the attempt enters Debrief; sim paused; world stays visible around it.
```
+[ DEBRIEF · LC-1 FLIGHT 7 · NRL-3 ]──────────────────────────────────────── REV 07 · SEED 42 ─+
| CAUGHT                                           | CONTRACT    FULFILLED  (SECO T+00:08:31)  |
| (macro stamp, ink; DIVERTED/CATCH FAILED/SCRUBBED |  LIFTOFF    T-0 AT 14:22:09 UTC           |
|  in danger plate)                                 |  HOLDS      00:23:40 · 2 HOLDS            |
|---------------------------+-----------------------+------------------------------------------|
| MONEY Δ                   | REPUTATION Δ          | B-09 BOOSTER                              |
| +37.4 M CR                | +4                    | CAUGHT, SAFING · FLIGHTS 7 → 8            |
| 812.0 → 849.4 M           | 61 → 65               | WEAR 0.18 → 0.24  ■■■■■□□□□□ (segmented)  |
|                           |                       | TOWER-1 NOMINAL · TURNAROUND 4.0 D        |
|---------------------------+-----------------------+------------------------------------------|
| LEDGER                          AMOUNT    REP   | DECISION LOG                                  |
| CONTRACT NRL-3                 +62.0 M    +5    | T-05:58:12  D1  ORDER 2× LX STANDARD   PLAYER |
| EXPENDED SHIP S-21             −20.0 M          | T-01:20:00  D2  GO (PRP MARGINAL)      PLAYER |
| PROPELLANT                      −1.1 M          | T-00:31:07  D2  HOLD · UNK-01          PLAYER |
| RUSH DELIVERY ×1                −0.1 M          | T+00:05:39  D3  CATCH P 0.71 → ROLL 0.44 AUTO |
| REFURB                          −1.5 M          |                                               |
| OPS                             −1.9 M          | ANOMALIES  A1 T-00:41:12 · A4 T+00:02:10      |
|---------------------------------+---------+-----+-----------------------------------------------|
| [ REPLAY SAME SEED ]  [ NEW SEED ]  [ EXPORT LOG ]                         [ VIEW SITE  Esc ]  |
+----------------------------------------------------------------------------------------------+
```
- Element: modal `<dialog>` (§6.27 frame, width `--fx-size-debrief`), heading `<h2>`; outcome word in `type-macro-stamp` is the one macro use on screen while it is open (the T-clock is hidden behind it); money/rep deltas as `<data value>` in `type-value`; ledger as `<table>` (`<th scope="col">`, numbers right-aligned, true minus `−`); decision log as `<ol>` of `<samp>` lines (`<time>` T-clock, decision id D1–D3b, detail, `by` tag `PLAYER` ink / `AUTO` ink-3 / `FORCED` accent-text).
- States by outcome: `CAUGHT` (ok, ink stamp), `DIVERTED` (warn: 2 px accent frame on the stamp), `CATCH FAILED` (danger: accent plate + hazard band, tower line `TOWER-1 DAMAGED · 21 D`), `SCRUBBED` (danger header, `WINDOW LOST` reason, booster line `NOT FLOWN`, decision log ends with the scrub). Negative money delta = value in ink with `−` and a `▲` glyph; never orange text on a big number.
- Data: `DebriefVM` (§13). Every number is from the projection; no client maths.
- Behavior: `VIEW SITE` (Esc) collapses the sheet to a `[■ DEBRIEF READY]` badge in the top bar (reopen with `B`); replay / new seed are commands to `app` (MVP: reload the scenario). Focus starts on the heading; Tab order: deltas → ledger → log → actions.
- **As built (6.7)** — `src/ui/hud/debrief/*`. The outcome word uses the **T-clock macro scale** (`type-macro-clock`), not `type-macro-stamp`: the stamp scale overflows the 880 px sheet for `CATCH FAILED`; it is still the only macro element on screen while the sheet is open. Collapse state is UI-local (`debriefUi` store, keyed by `countdownId`), so a new run's debrief opens again; while collapsed the overlay slot shows the `[■ DEBRIEF READY B]` badge (the top bar may consume `debriefUi` / `DebriefReadyBadge` instead). When the projection lists no actions (6.1 emits `[]`) the four MVP actions are rendered; ids are matched by `debriefActionId` (`REPLAY`, `NEW_SEED`, `EXPORT_LOG`, `VIEW_SITE` + aliases). Decision-log ids print only when they are spec codes (`D1`…`D3B`).

### 6.30 Deadline bar
```
LANDING BURN  T+00:06:20   ████████████░░░░░░  00:41     remaining = ink fill shrinking right→left
                                ↑ 2px accent tick = point of no return / standard cut-off (optional)
warn (< 25 %)  2px accent frame;   danger (< 10 % or expired) fill = accent with ink end-cap + ▲
```
- `<div role="group">` with label, `<time>` target, `<progress max=1 value=fraction>` (remaining fraction) and remaining text `<output>` in a fixed `8ch` slot. Height `--fx-size-deadline`, track paper-3, fill ink, linear motion between projection samples.
- States: running, held (`HELD` tag; the bar keeps shrinking because the window keeps closing — GDD §4.5 HOLD: window keeps closing), warn, danger, expired (`EXPIRED` + hatch), none (`—`).

### 6.31 Hazard band
4 px (`--fx-rule-band`) strip of `pattern-hazard`, `aria-hidden`. Placement: left edge of danger rows/chips/toasts, top edge of danger panels/strips, right edge of sel+alert tags. It is the *mass* signal of danger (§2.3), never a divider. Horizontal and vertical orientations; a wide variant (`--fx-space-3`) only on the debrief `CATCH FAILED` plate and the showcase CTA band.

### 6.32 Tooltip and popover
- **Tooltip**: plain text, max width `--fx-size-popover`, paper bg, 1 px ink frame, `type-label`; opens 0 ms on focus, after hover intent (300 ms) on pointer, clip-reveal 120 ms; `role="tooltip"` linked by `aria-describedby`; Esc closes. Never holds the only copy of information needed for a decision (reasons are also printed or announced).
- **Popover**: interactive content (site list, user menu, D1 order stepper) — `[ TITLE ]` frame like a panel, `aria-haspopup` + `aria-expanded` trigger, focus moves in, Esc returns focus to the trigger, click outside closes. z = `--fx-z-popover`.

### 6.33 Button and segmented control
```
primary    [ GO  ⏎ ]   ink fill, paper text (17.96); hover ink-2 fill; pressed paper-3 fill + ink text
secondary  [ HOLD  H ] paper fill, 1px ink frame; hover paper-2; pressed paper-3
danger     [▲ SCRUB ]  accent fill, ink text + ink frame (6.35); hover: 4px hazard band left; pressed ink fill, paper text
disabled   [▨ RECYCLE ] hatch, ink-4 text, aria-disabled (stays focusable to expose its reason tooltip)
busy       [◐ SENT ]   glyph swap, inert until the projection confirms
```
- `<button type="button">` min height `--fx-size-hit-min` (32 in strips/toolbars), `type-strong`, key hint in `<kbd>` (`type-label`, 1 px current-color frame). Disabled buttons use `aria-disabled` + `aria-describedby` → reason, never the `disabled` attribute (reasons must be reachable).
- **Segmented control**: `role="radiogroup"`, cells share 1 px ink rules (grid gap on an ink parent), selected cell ink fill + paper text, roving tabindex, `←/→` moves and selects, disabled cells hatch. Used by the rate control and list filters.

### 6.34 Tabs
`role="tablist"` of `role="tab"` (roving tabindex, `←/→ Home End`, activation on arrow = automatic) + `role="tabpanel"`. Active: ink text + 2 px ink underline; inactive ink-3 (5.91); hover paper-2; disabled hatch. Trailing count badge per tab (§6.14). Panel switch is a hard cut.

### 6.35 Label tag (generic)
The §6.20 in-world tag as a reusable primitive (also used inline in rows, the debrief and the strip to name an entity): states default / hover / selected / alert / selected+alert / disabled, size `--fx-size-tag`. Inline use is a `<button>` (select) or `<span>` (static).

### 6.36 Value cell
Every number on screen goes through one primitive: `<data value="{SI}">{text}</data>` + unit in `type-label` ink-2, tabular, right-aligned in a fixed `ch` slot supplied by the projection (`width` = text length of the widest legal value). Missing → `—` (same slot). Stale (projection older than 2 s or source offline) → value kept, ink-4, `pattern-hatch` underlay and `aria-description="stale"`.

### 6.37 As built (6.5) — countdown band, poll panel, decision strip

- **Countdown band** (`src/ui/hud/timeline/*`, slot `time`): header `[ COUNTDOWN ]` · context · rate control (§6.25) · HOLD `⇧H` while counting / hold tag `↺ HOLD · POLL` while holding (AC 28) · macro T-clock box (hold/paused = accent frame + word, scrub = accent plate). Phase bar: each phase gets a 5 % floor (`MIN_SHARE`), the rest is proportional to the planned share; playhead, poll ticks (passed ink / open accent / pending ink-4) and the window bracket go through the same piecewise-linear map (`bar.ts`), so a mark never leaves its phase. The current phase prints its full label, the others their `short` code (all short in compact). Clicking a phase opens the Tasks tab. Phase changes and T−10 / T−5 / T−0 are announced politely; the T-clock is never live. The hold *span* is a single accent block at the playhead (the projection has no hold history yet).
- **Poll panel** (`src/ui/hud/decision/PollPanel.tsx`, slot `poll`): station table (`<table>`, row header = station code button → `view.select(sourceId)`), status glyph + word, driver detail, `RESULT` output. Open while a D2 is projected or the clock holds; otherwise collapsed to its header with a `▸ n OF 5 GO` toggle. Hidden after liftoff. No count buttons.
- **Decision strip** (`src/ui/hud/decision/*`, slot `strip`): header `D-code [ DECISION · title ]` · queued chip · rate-drop chip (`timeScale.drop.label`) · D1 `ORDER ▸ O` toggle. Body = question + auto policy · per-kind evidence (D3 *p*, band chip, *p* bar with break-even tick, σ; D2 station chips, result, blocker, risk note, `evidence` lines; D3b load-complete ETAs; D1 reserves, open orders, trucks) · deadline bar. D3 adds the drivers row. Then one column per option: button with key hint, `AUTO` tag, reason when disabled, consequences `<dl>`, EV. A press sends `option.command`; `confirm: true` opens the §6.27 dialog first; an option without a command (D1 `NO ORDER`) collapses the strip; the pressed button reads `◐ SENT · …` until the next projection. Blocking decisions take focus and announce assertively when they open; `G` focuses, `O` toggles D1.

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
| `II` | `g-pause` | Paused / pause segment |
| `▸▸` | `g-skip` | Skip to next milestone |
| `✕` | `g-close` | Dismiss toast / close popover |
| `▾` | `g-caret` | Opens a popover / dropdown |
| `✓` | `g-check` | Confirmed / sent |
| `⌕` | `g-search` | Search |
| `−` `+` | `g-minus` `g-plus` | Stepper (D1 order count), zoom |

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
| `Shift+H` | **Hold the count** (while counting; the timeline header's only count button, hint `⇧H`). Deliberately not plain `H` (home view): holding is high-stakes and must never fire from a camera habit (6.5) |
| `+` / `−` | Zoom · `Q` / `E` rotate |
| `Space` | Pause / resume |
| `,` / `.` | Time scale down / up |
| `A` | Jump to oldest unacknowledged alert · `Shift+A` ack focused alert |
| `G` | Focus the decision strip (when open) · inside it: the option keys the projector prints on each button (`⏎` GO, `R` recycle, `D` divert, `C` continue / catch, `H` hold-to-fix, `Esc` D1 no order / collapse). Strip keys are scoped: they act only with focus inside the strip and stop propagation, so `H`/`C`/`D` there never reach the camera |
| `O` | Expand the D1 propellant strip |
| `N` | Skip to next milestone (when allowed); again while skipping = cancel (`session.skipToNextMilestone()` / `cancelSkip()`) |
| `B` | Reopen the debrief |
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
8. **Components** (6.2, `src/ui/design/ComponentGallery.tsx`, e2e `tests/e2e/design.e2e.ts` incl. an AA contrast sweep over every rendered text): each §6 component in all states (default/hover/focus/selected/warn/danger/disabled/empty/stale) — top bar, site switcher open, search with results, badges, alert counter, user chip, flight card, metric tile, segmented & linear progress, inspector (booster, vessel, transporter), status chips, tabbed panel per tab, list rows, countdown at 4 states (pre, hold, T+, scrub), map controls, label tags over a neutral clay image, altitude scale, compass tape, toasts + log, poll panel (polling / all GO / hold / no-go), time-scale, stamp, dialog.
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
3. ~~Poll panel forcing 1× and auto-hold~~ — resolved by GDD §6 (decision prompt → 1×) and §4.5 (window close → auto-scrub).
4. Label tags as DOM vs instanced sprites (perf with 100+ entities) — render/architect decision; visual spec unchanged.
5. Self-hosted fonts vs Google Fonts — styling ADR.

## 12. Showcase addendum (public site, `docs/SHOWCASE.md`)

The showcase reuses every token and rule above; it is a scrolling document, not the fixed-viewport HUD, so it adds:

| Token | Value | Use |
|---|---|---|
| `--fx-type-lede` | `clamp(14px, 1.05vw, 17px)`, leading 1.5, sentence case | Reading copy (the one place lowercase is allowed) |
| `--fx-type-macro-hero` | `clamp(5.5rem, 19vw, 21rem)`, leading 0.8, tracking −0.065em | The hero `FUEL-X` only (may bleed over the stage) |
| `--fx-type-macro-section` | `clamp(2.75rem, 6.5vw, 7rem)`, leading 0.86 | Section titles, dossier stamps `§01`, call stamps |
| `--fx-size-measure` | `62ch` | Max reading width |
| `--fx-size-stage-phone` | `46svh` | Sticky stage strip height below 900 px |
| `--fx-size-cta-wide` · `--fx-size-label-column` · `--fx-size-code-column` | `18rem` · `11rem` · `4rem` | Hero/band CTA min width · decision option column · site code / spec term column |
| `--fx-size-map` · `--fx-size-map-phone` | `22rem` · `16rem` | Coast map min height |
| `--fx-dur-blink` | `2000ms` | `LIVE` square, stepped (2 steps), off with reduced motion |

| Component | Anatomy | States / behaviour |
|---|---|---|
| **Top bar (showcase)** | wordmark · breadcrumb · story T-clock · `OPEN THE PAD >>>` (accent fill, ink text) | sticky; breadcrumb hidden < 900 px; CTA hover = ink fill |
| **Flight card (hero)** | ink header `[ LC-1 FLIGHT 7 ]` + `LIVE` blinking square (stepped, 2 s) · T-minus macro clock · 20-segment propellant bar · 4 metric cells | ticks 1 Hz; frozen with reduced motion |
| **Stage readout** | `[ LC-1 FLIGHT 7 ]` · story T-clock (macro) · phase word in `accent-text` · ALT / VEL / PROP / ENGINES cells | values written from the story feed (no React render per frame); metrics hidden < 900 px |
| **Phase bar** | the HUD countdown timeline: 8 phases, glyph empty / half-orange / ink-filled, accent playhead on a `paper-3` track | segments are buttons (scroll to the phase); < 900 px only the current phase prints its name |
| **Dossier sheet** | stamp `§0N` (ink-5 → ink when active) · title · anchor time · lede · decision box (ink header, two options, the first marked by an accent square) · 4-cell data strip | active sheet = 4 px accent left band + stamp print (clip-path, 640 ms mech, none with reduced motion) |
| **Calls tabs** | vertical tablist (index, title, phase) + panel (macro stamp, lede, `[ PUSH ]` accent-ruled / `[ PROTECT ]` ink-ruled) | roving tabindex, arrows/Home/End |
| **Hardware plate** | Blender render (WebP) · call-sign + class caption | hover/focus prints an opaque spec sheet over the render; caption gets `accent-tint`; family filter = pressed ink buttons |
| **Site selector** | tablist rows (code, name, state) · schematic coast map (sea `3d-sea-base`, ink coast, dashed roads, square markers) · sheet | under construction = `pattern-hatch` row; active marker = accent fill with ink text |
| **CTA band** | hazard stripe · kicker · macro line · CTA · hazard stripe | — |
| **Colophon** | studio marks in ink (generated from tokens by `scripts/showcase/brand.ts`) · credit line · links · rev stamp | — |

Rules specific to the showcase: orange stays reserved for CTA, active/selected state, thrust and hazard bands; motion
is clip-path/translate "printing" (≤ 8 px, no bounce, no fade-only); every scroll-linked value updates in place with
tabular figures; the page must read completely without JS (prerender) and without WebGL (Blender still).

## 13. Phase 6 view-model contract and GDD gaps (6.0)

### 13.1 View models
HUD components never read the store shape directly; they take **view models** imported from `src/ui/types.ts`, which re-exports the source of truth `src/bridge/projection-types.ts` (moved there in 6.1 so the bridge stores can type them without importing `src/ui`). Fixtures in `src/ui/fixtures/` (used by `/design`, unit tests and e2e) are typed against it. The projector of 6.1 (`src/app/projection/`) produces the same shape (ARCHITECTURE §8); a shape change edits the bridge file, the projector and the fixtures in the same commit.

| Interface | Feeds |
|---|---|
| `ValueVM {text, unit?, value, width?, stale?}` | every number (§6.36): display string pre-formatted by the projector, SI `value` for `<data>` |
| `UiProjection` | root: `clock, timeScale, range, alerts, flightCard, inspector, lists, decision, debrief, labels, sites` |
| `ClockVM`, `TimeScaleVM` | top bar, timeline header, rate control (§6.25) |
| `RangeVM`, `StationVM` | range badge, poll panel, Range tab, D2 strip |
| `AlertsVM`, `EventVM` | alert counter, toasts, Events tab |
| `FlightCardVM`, `MetricVM` | flight card, metric tiles |
| `InspectorVM`, `ActionVM` | inspector, entity actions |
| `ListsVM`, `ListRowVM`, `TankRowVM`, `TaskRowVM` | tabbed panel |
| `DecisionVM` = `PropMarginDecisionVM \| PollDecisionVM \| CatchDecisionVM \| LeakDecisionVM` | decision strip (§6.28), with `DeadlineVM`, `DecisionOptionVM`, `ConsequenceVM`, `CatchDriverVM` |
| `DebriefVM` | debrief panel (§6.29) |
| `CountdownVM`, `PhaseVM` | countdown timeline |

Severity everywhere is the §2.3 vocabulary `neutral | info | ok | active | warn | danger | disabled`, computed by the projector (the UI never compares thresholds).

### 13.2 GDD gaps found in 6.0 (for `game-designer`)
1. **D1 vs "decision prompt drops to 1×"** (GDD §6): D1 is open for ~5 h of prep; forcing 1× would break compression. This spec makes D1 *advisory* (no rate change). GDD §6 should say "blocking decision prompts (D2, D3, D3b)".
2. **D1 is not listed for the decision strip** in GDD §10 ("Go/No-Go, catch/divert, load-leak") while §10 also puts order buttons on Tasks rows. This spec puts D1 in the strip (collapsed) *and* keeps the Tasks rows as the detailed order surface; both send the same command.
3. **D3b default** when the player gives no input is unstated (sim: the load continues degraded, deadline = window close). Spec assumes `CONTINUE DEGRADED` is the auto choice; confirm.
4. **Station vocabulary**: GDD uses GO / MARGINAL / NO-GO for stations and HOLD as a clock action; the old §6.24 mixed them. Fixed here (MARGINAL everywhere for stations; the top-bar badge aggregates to `RANGE GO | MARGINAL | NO-GO`).
5. **Poll panel buttons vs decision strip**: GDD §4.5 lists both the Range tab and the strip; two button sets for D2 would be ambiguous. The poll panel became evidence only (§6.24).
6. **Debrief exit actions** are not defined for the MVP (no rebook played). Spec proposes REPLAY SAME SEED / NEW SEED / EXPORT LOG / VIEW SITE; confirm with the architect (7.x) and designer.
7. **EV per option** is required by GDD §14 risk 2 for D3 only; D2 (SCRUB penalty) and D1 (cost vs hold-minutes bought) consequences are spec'd as plain consequences, not EV, because the sim has no probability for "hold succeeds". Designer to confirm that's enough.
8. **Telemetry latency** repurposed as `SIM n×` readout (GDD §10 recommendation adopted); the user avatar is dropped, role label kept.

**Resolutions (game-designer, 6.0):**
1. RESOLVED — D1 is advisory, no rate change; blocking = D2/D3/D3b. Note: a decision is a one-shot **drop** of the requested rate, not a cap, so `⊘ 1× · DECISION OPEN` must not hatch 10× (holds stay compressible up to the 10× cap). → GDD §6 (cap vs drop), AC 23.
2. RESOLVED — D1 is in the strip (collapsed) and on Tasks rows; the only decision allowed two surfaces (orders are additive). Priority is **D3 > D3b > D2 > D1** (matches the projection; §6.28 aligned in 6.5). → GDD §10, §13.2.1, AC 30.
3. RESOLVED — D3b default = CONTINUE DEGRADED, committed by the sim at `min(onset + 300 s, window close)` (`by: AUTO`); one-shot. → GDD §13.2.1, AC 29 (sim follow-up).
4. RESOLVED — stations GO / MARGINAL / NO-GO (+ POLLING); HOLD only on the T-clock. → GDD §4.5 Vocabulary, AC 28.
5. RESOLVED — counting: HOLD only, in the timeline header; holding: GO / RECYCLE / SCRUB only, in the D2 strip. → GDD §4.5 One command surface, AC 28.
6. RESOLVED — REPLAY SAME SEED / NEW SEED / EXPORT LOG / VIEW SITE confirmed; no continue/turnaround in MVP. → GDD §13.2.3, AC 32 (app follow-up).
7. RESOLVED — EV on D3 only; D1/D2/D3b show certain consequences + budgets (window minutes, hold-minutes, risk ×). D2 strip adds a "cost of staying held" evidence line. → GDD §13.2.2, AC 31.
