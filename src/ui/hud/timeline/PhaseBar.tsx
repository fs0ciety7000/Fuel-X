import type { CSSProperties } from 'react';
import { Glyph } from '../../components';
import type { CountdownVM, GlyphId, PhaseVM } from '../../types';
import { barSegments, mapFraction, segmentFill } from './bar';
import styles from './CountdownTimeline.module.css';

const PHASE_GLYPH: Record<PhaseVM['state'], GlyphId> = {
  done: 'done',
  current: 'current',
  held: 'holding',
  pending: 'pending',
  skipped: 'offline',
};

const pct = (f: number): string => `${Math.round(f * 10000) / 100}%`;

export interface PhaseBarProps {
  cd: CountdownVM;
  /** Click on a phase (→ Tasks tab). */
  onPhase?: (p: PhaseVM) => void;
}

/**
 * §6.17 phase bar + labels: done = ink, current = ink up to progress then paper-3, pending = hatch (future),
 * skipped = hatch + ⊘, held = accent hold block at the playhead. Playhead = 2 px accent line + ink caret; poll ticks
 * (passed ink, open accent, pending ink-4); window open / close = ink brackets under the bar.
 */
export function PhaseBar({ cd, onPhase }: PhaseBarProps) {
  const segs = barSegments(cd.phases);
  const at = (f: number | null | undefined): number | null =>
    f === null || f === undefined ? null : mapFraction(f, segs);
  const head = at(cd.playhead);
  const wOpen = at(cd.windowOpen);
  const wClose = at(cd.windowClose);
  const cols: CSSProperties = { gridTemplateColumns: segs.map((s) => `${s.w}fr`).join(' ') };
  return (
    <div className={styles.barBlock} data-scrubbed={cd.scrubbed || undefined}>
      <div className={styles.bar} style={cols} aria-hidden="true" data-testid="phase-bar">
        {cd.phases.map((p) => (
          <span key={p.id} className={styles.seg} data-state={p.state}>
            <span className={styles.segFill} style={{ width: pct(segmentFill(p)) }} />
          </span>
        ))}
        {wOpen !== null && wClose !== null ? (
          <span
            className={styles.window}
            style={{ left: pct(Math.min(wOpen, wClose)), width: pct(Math.abs(wClose - wOpen)) }}
            data-testid="window-marks"
          />
        ) : null}
        {(cd.polls ?? []).map((m) => (
          <span
            key={m.id}
            className={styles.pollMark}
            data-state={m.state}
            style={{ left: pct(at(m.position) ?? 0) }}
          />
        ))}
        {cd.holding && head !== null ? <span className={styles.holdBlock} style={{ left: pct(head) }} /> : null}
        {head !== null && !cd.scrubbed ? (
          <span className={styles.playhead} style={{ left: pct(head) }} data-testid="playhead" />
        ) : null}
      </div>
      <ol className={styles.phases} style={cols}>
        {cd.phases.map((p) => (
          <li
            key={p.id}
            className={styles.phase}
            data-state={p.state}
            aria-current={p.state === 'current' || p.state === 'held' ? 'step' : undefined}
          >
            <button
              type="button"
              className={styles.phaseButton}
              title={`${p.label} · ${p.state.toUpperCase()}`}
              onClick={() => onPhase?.(p)}
            >
              <Glyph id={p.glyph ?? PHASE_GLYPH[p.state]} />
              <span className={styles.phaseLong}>{p.label}</span>
              <span className={styles.phaseShort}>{p.short}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
