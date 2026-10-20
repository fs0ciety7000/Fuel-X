// DOM contract between the world-HUD components and the render frame loop (6.6, ARCHITECTURE §8 "per-frame DOM is
// written by render, not React"). `src/ui` cannot import `src/render` (and vice versa), so both sides declare the same
// strings; `tests/render/dom-contract.test.ts` proves this copy equals `src/render/dom-contract.ts` (the original).
//
// React (10 Hz projection) owns the *structure*: which label tags exist, their text / glyph / state, the tick marks.
// The render `WorldOverlaySystem` owns the *per-frame* values: label positions + declutter mode, the altitude marker,
// tick numerals and readout, the compass tape offset and readout. It never creates or removes elements.

/** Window event a map control dispatches to move the camera (zoom / rotate, hold-to-repeat). */
export const CAMERA_NUDGE_EVENT = 'fuelx:camera-nudge';

/** `detail` of {@link CAMERA_NUDGE_EVENT}: distance × `zoom` (> 1 = out), yaw + `yawDeg` (compass, clockwise). */
export interface CameraNudge {
  zoom?: number;
  yawDeg?: number;
}

/** Data attributes (selectors are `[attr]` / `[attr="value"]`). */
export const DOM = {
  /** Full-viewport label layer (z `world-labels`, pointer-events none). */
  labelLayer: 'data-fx-world-labels',
  /** One label: value = entity id. Positioned by render with `transform`; `data-priority` = declutter rank. */
  label: 'data-fx-label',
  priority: 'data-priority',
  /** Written by render on each label: `tag` (full tag), `anchor` (collapsed to the anchor square), `hidden`. */
  mode: 'data-mode',
  /** The tag button inside a label (measured for the declutter rectangles). */
  labelTag: 'data-fx-label-tag',
  /** HUD cards: labels whose tag would fall under one are hidden (DESIGN_SYSTEM §6.20). */
  occluder: 'data-fx-occluder',

  /** Altitude scale root (`role=img`); render writes `aria-label`. */
  altitude: 'data-fx-altitude',
  /** Tick numeral, value = index from the bottom (0 = ground). Render writes the text on a re-scale. */
  altitudeTick: 'data-fx-alt-tick',
  /** Full-height rail holding the marker at its top; render translates it by (1 − fraction) × 100 %. */
  altitudeRail: 'data-fx-alt-rail',
  /** Exact altitude readout (`600 M`, `8.3 KM`). */
  altitudeReadout: 'data-fx-alt-readout',

  /** Compass root (`role=img`); render writes `aria-label`. */
  compass: 'data-fx-compass',
  /** Tape covering COMPASS_TAPE_FROM_DEG … + COMPASS_TAPE_SPAN_DEG, left edge at the centre caret. */
  compassTape: 'data-fx-compass-tape',
  compassReadout: 'data-fx-compass-readout',
} as const;

/**
 * Everything a label must not sit under (DESIGN_SYSTEM §6.20 "tags under a card are hidden"): explicit occluders plus
 * the cards of the 6.3 HUD frame = direct children of its interactive slots (`data-slot` + `data-interactive`).
 * Empty (zero-area) matches are ignored.
 */
export const OCCLUDER_SELECTOR = '[data-fx-occluder], [data-slot][data-interactive] > *';

/** Compass tape extent: degrees −180 … 540, so any heading ± the 60° window stays on the tape. */
export const COMPASS_TAPE_FROM_DEG = -180;
export const COMPASS_TAPE_SPAN_DEG = 720;

/** Altitude-scale labelled ticks, ground included (00 · ¼ · ½ · ¾ · full scale, DESIGN_SYSTEM §6.21). */
export const ALTITUDE_TICKS = 5;
