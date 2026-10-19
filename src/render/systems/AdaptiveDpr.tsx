// Adaptive DPR within the [1, 1.5] clamp (ADR 0002 §8): drop to 1 when the median frame exceeds the budget,
// climb back when there is clear headroom. Decisions every 120 frames; setDpr is rare (no per-frame React).
import { useFrame } from '@react-three/fiber';
import type { RootState } from '@react-three/fiber';
import { useState } from 'react';
import type { FrameInput } from '../frame';

export const DPR_RANGE = [1, 1.5] as const;
const WINDOW_FRAMES = 120;
const DECLINE_MS = 20;
const INCLINE_MS = 12;

export class AdaptiveDprController {
  private readonly samples = new Float32Array(WINDOW_FRAMES);
  private n = 0;

  constructor(private readonly input: FrameInput) {}

  frame(state: RootState): void {
    this.samples[this.n++] = this.input.wallDtMs;
    if (this.n < WINDOW_FRAMES) return;
    this.n = 0;
    const sorted = Array.from(this.samples).sort((a, b) => a - b);
    const median = sorted[WINDOW_FRAMES >> 1] ?? 0;
    const max = Math.min(DPR_RANGE[1], Math.max(DPR_RANGE[0], window.devicePixelRatio || 1));
    const dpr = state.viewport.dpr;
    if (median > DECLINE_MS && dpr > DPR_RANGE[0]) state.setDpr(DPR_RANGE[0]);
    else if (median < INCLINE_MS && dpr < max) state.setDpr(max);
  }
}

export function AdaptiveDpr({ input }: { input: FrameInput }) {
  const [ctrl] = useState(() => new AdaptiveDprController(input));
  useFrame((state) => ctrl.frame(state), -40);
  return null;
}
