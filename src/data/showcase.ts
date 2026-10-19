// Showcase story timeline (docs/SHOWCASE.md §3): shared by the DOM sections (src/ui/showcase) and the stage
// (src/render/systems/showcase). Story progress p ∈ [0, 1] spans the six dossier sheets; mission time is a display
// value derived from p (seconds relative to liftoff, orders of magnitude from GDD §4 / BALANCING). Not sim input.

/** Live story progress, written by the scroll driver (src/app/showcase/story.ts), read per frame or per change. */
export interface StoryFeed {
  /** Story progress, 0 at the top of §01, 1 at the end of §06. */
  readonly p: number;
  /** Calls `fn` after each progress change (rAF-batched). Returns the unsubscribe function. */
  subscribe(fn: () => void): () => void;
}

export type ChapterId = 'contract' | 'prepare' | 'countdown' | 'fly' | 'recover' | 'turnaround';

export const CHAPTERS: readonly ChapterId[] = ['contract', 'prepare', 'countdown', 'fly', 'recover', 'turnaround'];

/** Chapter index for a progress value (equal-height sheets → equal p spans). */
export function chapterAt(p: number): number {
  return Math.min(CHAPTERS.length - 1, Math.max(0, Math.floor(p * CHAPTERS.length)));
}

/** Anchor progress of a chapter (its middle), used for reduced-motion stills and phase-bar jumps. */
export function chapterAnchor(index: number): number {
  return (index + 0.5) / CHAPTERS.length;
}

/** Timeline phases of the game HUD countdown bar (GDD §4, PROMPT HUD), with their story p span. */
export const PHASES = [
  { id: 'rollout', label: 'Rollout', from: 0.1, to: 0.22 },
  { id: 'stack', label: 'Stack', from: 0.22, to: 1 / 3 },
  { id: 'load', label: 'Propellant load', from: 1 / 3, to: 0.42 },
  { id: 'terminal', label: 'Terminal count', from: 0.42, to: 0.5 },
  { id: 'liftoff', label: 'Liftoff', from: 0.5, to: 0.58 },
  { id: 'boostback', label: 'Boostback', from: 0.58, to: 0.7 },
  { id: 'catch', label: 'Tower catch', from: 0.7, to: 0.83 },
  { id: 'safing', label: 'Safing', from: 0.83, to: 1 },
] as const;

/** (p, mission time s) keyframes; linear between them. */
const CLOCK: readonly (readonly [number, number])[] = [
  [0, -21_600],
  [0.1, -19_800],
  [1 / 3, -4_800],
  [0.42, -2_400],
  [0.49, -3],
  [0.5, 0],
  [0.6, 165],
  [0.7, 360],
  [0.8, 415],
  [1, 900],
];

/** Mission time (s, relative to liftoff) shown for story progress p. */
export function missionTimeAt(p: number): number {
  const first = CLOCK[0] as readonly [number, number];
  if (p <= first[0]) return first[1];
  for (let i = 1; i < CLOCK.length; i += 1) {
    const [p1, t1] = CLOCK[i] as readonly [number, number];
    const [p0, t0] = CLOCK[i - 1] as readonly [number, number];
    if (p <= p1) return t0 + ((p - p0) / (p1 - p0)) * (t1 - t0);
  }
  return (CLOCK[CLOCK.length - 1] as readonly [number, number])[1];
}

/** `T-HH:MM:SS` / `T+HH:MM:SS`, whole seconds toward zero (the game clock convention). */
export function formatMissionTime(seconds: number): string {
  const sign = seconds < 0 ? '-' : '+';
  const s = Math.floor(Math.abs(seconds));
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `T${sign}${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
