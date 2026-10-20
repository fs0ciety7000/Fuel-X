import { useStore } from 'zustand';
import { projectionStore } from '@bridge/index';
import type { UiProjection } from '../../types';
import { ALTITUDE_TICKS, DOM } from './dom-contract';
import styles from './AltitudeScale.module.css';

// Altitude scale (DESIGN_SYSTEM §6.21, task 6.6). Static structure only: tick marks, numeral slots, the marker rail
// and the readout. The render WorldOverlaySystem writes the numerals (stepped re-scale), the rail offset, the readout
// and the aria-label every frame, and shows / hides the scale (data-mode) by the followed entity's class. React only
// adds the danger state (accent marker) from the projection.

/** Labelled ticks bottom → top as fractions of the scale, plus the minor ticks between them. */
const MAJOR = Array.from({ length: ALTITUDE_TICKS }, (_, i) => i / (ALTITUDE_TICKS - 1));
const MINOR = MAJOR.slice(1).map((f) => f - 1 / (2 * (ALTITUDE_TICKS - 1)));

/** The followed entity is in danger (its label state, ≤ 10 Hz). */
export function followDanger(p: UiProjection): boolean {
  const id = p.view?.followId;
  if (!id) return false;
  return p.labels.some((l) => l.id === id && l.state === 'danger');
}

const pct = (f: number): string => `${(f * 100).toFixed(3)}%`;

export function AltitudeScale() {
  const danger = useStore(projectionStore, followDanger);
  return (
    <div
      className={styles.root}
      {...{ [DOM.altitude]: '' }}
      role="img"
      aria-label="Altitude"
      data-danger={danger || undefined}
    >
      <div className={styles.track}>
        {MINOR.map((f) => (
          <span key={`m${f}`} className={styles.minor} style={{ bottom: pct(f) }} />
        ))}
        {MAJOR.map((f, i) => (
          <span key={`t${f}`} className={styles.tick} style={{ bottom: pct(f) }}>
            <span className={styles.num} {...{ [DOM.altitudeTick]: i }}>
              {i === 0 ? '00' : ''}
            </span>
            <span className={styles.mark} />
          </span>
        ))}
        <div className={styles.rail} {...{ [DOM.altitudeRail]: '' }}>
          <span className={styles.marker} />
        </div>
      </div>
      <span className={styles.readout} {...{ [DOM.altitudeReadout]: '' }}>
        —
      </span>
    </div>
  );
}
