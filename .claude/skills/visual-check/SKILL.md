---
name: visual-check
description: Launch the Fuel-X app, drive it with Playwright to a precise game state (time, phase, followed entity, site, camera), take screenshots, look at them and compare with baselines. Use after any change to UI, render, assets or design tokens, and to show progress at phase gates.
---

# Visual check

Seeing the change is part of done. Unit tests don't tell you a panel overlaps the countdown.

## How
1. Start the app: `npm run dev` in the background (or `npm run build && npm run preview` for perf-representative output). Wait for the port to answer.
2. Drive it with Playwright (Chromium is preinstalled; never run `playwright install`; if the pinned version mismatches use `executablePath: '/opt/pw-browsers/chromium'`).
3. Reach the state **deterministically** through the debug hooks exposed in dev builds (to be defined in ARCHITECTURE.md), e.g. `window.__fuelx.seed(42)`, `.jumpTo('T+00:01:45')`, `.follow('B-14')`, `.site('LC-1')`, `.pause()`. Never rely on sleeping and hoping the sim is at the right moment.
4. Screenshot at 1920×1080 (and 1280×720 for density checks). Name files by state: `ascent-follow-B14@T+00-01-45.png`.
5. **Look at the screenshot** with the Read tool and check against `docs/DESIGN_SYSTEM.md` and the reference description in `PROMPT.md`: grid alignment, no radius/shadow, single orange accent, monospace data, labels anchored, nothing clipped, numbers not jittering.
6. For regression baselines (`tests/e2e/`), use Playwright's screenshot comparison with a small threshold; mask the noise overlay and live clocks.

## Standard states to cover
- `/design` page (every component)
- Terminal count `T-00:00:04`, flight card + timeline
- Ascent following booster `T+00:01:45`, inspector card
- Recovery vessel followed, holding pattern rings
- Tower catch / safing
- Build yard site with logistics moving

Share the key screenshots with the user at each phase gate.
