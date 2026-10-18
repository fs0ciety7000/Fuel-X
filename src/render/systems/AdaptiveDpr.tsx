// Adaptive DPR within the [1, 1.5] clamp (ADR 0002 §8): drop to 1 when the median frame exceeds the budget,
// climb back when there is clear headroom. Decisions every 2 s of frames; setDpr is rare (no per-frame React).
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import type { FrameInput } from '../frame';

export const DPR_RANGE = [1, 1.5] as const;
const WINDOW_FRAMES = 120;
const DECLINE_MS = 20;
const INCLINE_MS = 12;

export function AdaptiveDpr({ input }: { input: FrameInput }) {
  const setDpr = useThree((s) => s.setDpr);
  const st = useMemo(() => ({ samples: new Float32Array(WINDOW_FRAMES), n: 0 }), []);
  useFrame((state) => {
    st.samples[st.n++] = input.wallDtMs;
    if (st.n < WINDOW_FRAMES) return;
    st.n = 0;
    const sorted = Array.from(st.samples).sort((a, b) => a - b);
    const median = sorted[WINDOW_FRAMES >> 1] ?? 0;
    const max = Math.min(DPR_RANGE[1], Math.max(DPR_RANGE[0], window.devicePixelRatio || 1));
    const dpr = state.viewport.dpr;
    if (median > DECLINE_MS && dpr > DPR_RANGE[0]) setDpr(DPR_RANGE[0]);
    else if (median < INCLINE_MS && dpr < max) setDpr(max);
  }, -40);
  return null;
}
