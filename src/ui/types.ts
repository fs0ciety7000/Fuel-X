// HUD view models (DESIGN_SYSTEM §13.1, ARCHITECTURE §8). Source of truth: `src/bridge/projection-types.ts` (6.1) —
// the projector (src/app/projection) produces exactly these types and the components render them verbatim.
// Formatting (units, rounding, fixed width) happens in the projector; the UI never compares thresholds or converts
// units. Change the shape in the bridge file (and the projector) in the same commit.
export type * from '@bridge/projection-types';
