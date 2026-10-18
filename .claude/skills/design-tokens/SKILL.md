---
name: design-tokens
description: How to use and extend Fuel-X design tokens (color, type, spacing, borders, motion) in UI components and in 3D materials. Use when writing or reviewing any UI/HUD code, render code that sets colors, or Blender material colors. Forbids hard-coded values, border-radius, shadows, gradients and translucency.
---

# Design tokens

Tokens are the single source of truth for the HUD **and** the 3D world. The aesthetic rules come from the `industrial-brutalist-ui` skill (Swiss Industrial Print, light) and its Fuel-X addendum; this skill is about *mechanics*.

## Where they live
Defined by `ui-design-system` in Phase 1 (see `docs/DESIGN_SYSTEM.md`). Expected shape, whatever the styling ADR picks:
- **CSS custom properties** on `:root` (consumed by UI components / utility classes).
- **TS constants** generated from — or the source of — the same values (consumed by render code and the Blender material helper). One source, the other generated; never two hand-maintained copies.

Baseline values (DESIGN_SYSTEM.md is authoritative once written):

| Token | Value | Use |
|---|---|---|
| `paper` | `#F4F4F0` | substrate, 3D background/haze |
| `paper-2` | `#EAE8E3` | panel alt / clay base |
| `ink` | `#0A0A0A` | text, rules |
| `ink-2..4` | grey ramp | secondary text, inactive segments, clay shading |
| `accent` | `#FF5A1F` | thrust, selection, alerts, hazard/recovery zones |
| `accent-text` | `#C2410C` | small orange text on paper (AA) |
| `accent-tint` | flat pale orange | selected row background |
| `radius` | `0` | everything |
| `rule` | `1px` / `2px` | dividers, compartments |

## Rules
1. No literal colors, font sizes, spacing or durations in components — reference a token. (Exception: data-driven values like chart coordinates.)
2. Banned in UI code: `border-radius` > 0, `box-shadow`, gradients, `opacity`/`rgba` used for translucency of panels, `backdrop-filter`.
3. A new token needs: a name by role (not by look), a value, a one-line use, and an entry in DESIGN_SYSTEM.md.
4. Render code imports the TS token constants; Blender scripts read the same values (export a JSON from the token source if needed).
5. Numbers use the monospace token with `font-variant-numeric: tabular-nums`.

## Review grep
```bash
grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba?\(|border-radius|box-shadow|gradient\(|backdrop-filter" src/ui src/render --include=*.{ts,tsx,css} | grep -v tokens
```
Anything returned outside the token source is a violation to fix.
