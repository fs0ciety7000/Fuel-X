import type { CSSProperties, ReactElement } from 'react';
import type { GlyphId } from '../types';
import { cx } from './cx';
import styles from './Glyph.module.css';

// §7 glyph set: one inline SVG sprite of <symbol>s (12×12 grid, 1.5 px square-capped strokes). Ink parts use
// currentColor; the only orange is the warn/danger triangle and the selected diamond, set through token vars.

const ACCENT: CSSProperties = { fill: 'var(--fx-color-accent)' };
const ACCENT_STROKE: CSSProperties = { stroke: 'var(--fx-color-accent)' };
const PAPER_STROKE: CSSProperties = { stroke: 'var(--fx-color-paper)' };
const INK: CSSProperties = { fill: 'var(--fx-color-ink)' };
const INK_STROKE: CSSProperties = { stroke: 'var(--fx-color-ink)' };

const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'square',
  strokeLinejoin: 'miter',
} as const;
const F = { fill: 'currentColor' } as const;

const exclam = (
  <>
    <path d="M6 5v2.5" {...S} style={INK_STROKE} strokeLinecap="butt" />
    <rect x="5.25" y="8.6" width="1.5" height="1.5" style={INK} />
  </>
);

export const GLYPHS: Record<GlyphId, { label: string; body: ReactElement }> = {
  ok: {
    label: 'GO',
    body: (
      <>
        <rect x="1" y="1" width="10" height="10" {...F} />
        <path d="M3.5 6.2l1.8 1.8 3.4-3.6" {...S} style={PAPER_STROKE} />
      </>
    ),
  },
  done: {
    label: 'DONE',
    body: (
      <>
        <rect x="1.75" y="1.75" width="8.5" height="8.5" {...S} />
        <path d="M3.8 6.1l1.6 1.6 3-3.2" {...S} />
      </>
    ),
  },
  current: {
    label: 'IN PROGRESS',
    body: (
      <>
        <circle cx="6" cy="6" r="4.25" {...S} />
        <path d="M6 1.75a4.25 4.25 0 0 0 0 8.5z" {...F} />
      </>
    ),
  },
  pending: { label: 'PENDING', body: <circle cx="6" cy="6" r="4.25" {...S} /> },
  idle: { label: 'IDLE', body: <rect x="1.75" y="1.75" width="8.5" height="8.5" {...S} /> },
  parked: { label: 'PARKED', body: <rect x="1" y="1" width="10" height="10" {...F} /> },
  driving: { label: 'DRIVING', body: <path d="M4 2l4 4-4 4" {...S} /> },
  patrol: { label: 'TRANSIT', body: <path d="M1.5 2l4 4-4 4M6.5 2l4 4-4 4" {...S} /> },
  holding: {
    label: 'HOLDING',
    body: (
      <>
        <path d="M3 3.2A4.25 4.25 0 1 1 1.9 7" {...S} strokeLinecap="butt" />
        <path d="M1 1v3.5h3.5" {...S} />
      </>
    ),
  },
  ascent: { label: 'ASCENT', body: <path d="M6 10.5V2M2.5 5.5L6 2l3.5 3.5" {...S} /> },
  descent: { label: 'DESCENT', body: <path d="M6 1.5V10M2.5 6.5L6 10l3.5-3.5" {...S} /> },
  boostback: {
    label: 'BOOSTBACK',
    body: (
      <>
        <path d="M10 10.5V6a3 3 0 0 0-3-3H2.5" {...S} strokeLinecap="butt" />
        <path d="M4.5 1L2.5 3l2 2" {...S} />
      </>
    ),
  },
  caught: {
    label: 'CAUGHT',
    body: (
      <>
        <rect x="1.75" y="1.75" width="8.5" height="8.5" {...S} />
        <path d="M4 4l4 4M8 4l-4 4" {...S} />
      </>
    ),
  },
  fueling: {
    label: 'LOADING',
    body: (
      <>
        <rect x="1.75" y="1.75" width="8.5" height="8.5" {...S} />
        <path d="M4.5 4v4M7.5 4v4" {...S} />
      </>
    ),
  },
  stacked: { label: 'STACKED', body: <path d="M4 1.5v9M8 1.5v9" {...S} /> },
  build: {
    label: 'UNDER CONSTRUCTION',
    body: (
      <>
        <rect x="1.75" y="1.75" width="8.5" height="8.5" {...S} />
        <path d="M6 2v8M2 6h8" {...S} />
      </>
    ),
  },
  offline: {
    label: 'OFFLINE',
    body: (
      <>
        <circle cx="6" cy="6" r="4.25" {...S} />
        <path d="M3 9l6-6" {...S} />
      </>
    ),
  },
  warn: {
    label: 'WARNING',
    body: (
      <>
        <path d="M6 1.6l4.6 8.65H1.4z" {...S} style={ACCENT_STROKE} />
        {exclam}
      </>
    ),
  },
  danger: {
    label: 'DANGER',
    body: (
      <>
        <path d="M6 1l5.5 10H.5z" style={ACCENT} stroke="currentColor" strokeWidth="1" strokeLinejoin="miter" />
        {exclam}
      </>
    ),
  },
  selected: {
    label: 'SELECTED',
    body: <path d="M6 1l5 5-5 5-5-5z" style={ACCENT} stroke="currentColor" strokeWidth="1" />,
  },
  crosshair: { label: '', body: <path d="M6 1.5v9M1.5 6h9" fill="none" stroke="currentColor" strokeWidth="1" /> },
  pause: { label: 'PAUSE', body: <path d="M2.5 1.5h2.5v9H2.5zM7 1.5h2.5v9H7z" {...F} /> },
  skip: { label: 'SKIP', body: <path d="M1 2l5 4-5 4zM6 2l5 4-5 4z" {...F} /> },
  close: { label: 'CLOSE', body: <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" {...S} /> },
  caret: { label: '', body: <path d="M2.5 4.5h7L6 8.5z" {...F} /> },
  check: { label: 'CONFIRMED', body: <path d="M2 6.3l2.7 2.7L10 3.5" {...S} /> },
  search: {
    label: 'SEARCH',
    body: (
      <>
        <rect x="1.75" y="1.75" width="6" height="6" {...S} />
        <path d="M8 8l2.5 2.5" {...S} />
      </>
    ),
  },
  plus: { label: 'MORE', body: <path d="M6 2v8M2 6h8" {...S} /> },
  minus: { label: 'LESS', body: <path d="M2 6h8" {...S} /> },
};

/** Mount once per document (HUD root, `/design`). */
export function GlyphSprite() {
  return (
    <svg className={styles.sprite} aria-hidden="true" focusable="false">
      <defs>
        {Object.entries(GLYPHS).map(([id, g]) => (
          <symbol key={id} id={`g-${id}`} viewBox="0 0 12 12">
            {g.body}
          </symbol>
        ))}
      </defs>
    </svg>
  );
}

export interface GlyphProps {
  id: GlyphId;
  large?: boolean;
  /** Accessible name; omit when an adjacent word carries the meaning (the usual case). */
  label?: string;
  className?: string;
}

export function Glyph({ id, large = false, label, className }: GlyphProps) {
  return (
    <svg
      className={cx(styles.glyph, large && styles.lg, className)}
      viewBox="0 0 12 12"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <use href={`#g-${id}`} />
    </svg>
  );
}
