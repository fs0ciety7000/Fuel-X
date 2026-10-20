import { COMPASS_TAPE_FROM_DEG, COMPASS_TAPE_SPAN_DEG, DOM } from './dom-contract';
import styles from './CompassTape.module.css';

// Compass tape (DESIGN_SYSTEM §6.22, task 6.6). A static tape from −180° to 540° (numerals every 30°, cardinal letters
// at 0/90/180/270, minor ticks every 10°); the render WorldOverlaySystem slides it every frame (camera heading, or the
// followed ground / sea vehicle's heading) and writes the readout and aria-label. No React updates while it moves.

const CARDINAL: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };

export function compassLabel(deg: number): string {
  const d = ((deg % 360) + 360) % 360;
  return CARDINAL[d] ?? String(d);
}

interface Mark {
  deg: number;
  label: string | null;
}

const MARKS: readonly Mark[] = Array.from({ length: COMPASS_TAPE_SPAN_DEG / 10 + 1 }, (_, i) => {
  const deg = COMPASS_TAPE_FROM_DEG + i * 10;
  return { deg, label: deg % 30 === 0 ? compassLabel(deg) : null };
});

const at = (deg: number): string => `${(((deg - COMPASS_TAPE_FROM_DEG) / COMPASS_TAPE_SPAN_DEG) * 100).toFixed(4)}%`;

export function CompassTape() {
  return (
    <div className={styles.root} {...{ [DOM.compass]: '' }} role="img" aria-label="Heading">
      <div className={styles.window}>
        <div className={styles.tape} {...{ [DOM.compassTape]: '' }}>
          {MARKS.map((m) =>
            m.label ? (
              <span key={m.deg} className={styles.major} style={{ left: at(m.deg) }}>
                {m.label}
              </span>
            ) : (
              <span key={m.deg} className={styles.minor} style={{ left: at(m.deg) }} />
            ),
          )}
        </div>
      </div>
      <span className={styles.caret} aria-hidden="true" />
      <span className={styles.readout} {...{ [DOM.compassReadout]: '' }}>
        000°
      </span>
    </div>
  );
}
