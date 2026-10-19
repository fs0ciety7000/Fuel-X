// Visual time for shaders and particles (5.7 freezeVisuals): wall-clock seconds while live, the fixed
// `controls.frozenTimeS` (= sim tick × DT at the moment of freezing) while frozen, so screenshots of the same state
// are pixel-identical. Unfreezing resumes from the frozen time (no jump).
import type { RenderControls } from '../controls';

/** Longest wall-clock step fed to visuals (background tab, debugger pause), s. */
const MAX_STEP_S = 0.25;

export class VisualClock {
  timeS = 0;

  frame(controls: Readonly<RenderControls>, wallDtS: number): number {
    if (controls.frozen) this.timeS = controls.frozenTimeS;
    else this.timeS += Math.min(Math.max(wallDtS, 0), MAX_STEP_S);
    return this.timeS;
  }
}
