// Live HUD fragments of the showcase. Scroll-driven values are written straight into the DOM from the story feed's
// listener (no React render per scroll frame); React re-renders only when the chapter or phase changes.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';
import { chapterAt, formatMissionTime, missionTimeAt, PHASES } from '@data/showcase';
import type { StoryFeed } from '@data/showcase';
import styles from './live.module.css';

export function useChapter(story: StoryFeed): number {
  return useSyncExternalStore(
    story.subscribe,
    () => chapterAt(story.p),
    () => 0,
  );
}

function phaseAt(p: number): number {
  return PHASES.findIndex((ph) => p >= ph.from && p < ph.to);
}

export function usePhase(story: StoryFeed): number {
  return useSyncExternalStore(
    story.subscribe,
    () => (story.p >= 1 ? PHASES.length - 1 : phaseAt(story.p)),
    () => -1,
  );
}

/** Writes `format(p)` into `ref` on every story change. */
function useStoryText<E extends HTMLElement>(
  story: StoryFeed,
  ref: RefObject<E | null>,
  format: (p: number) => string,
): void {
  useEffect(() => {
    const write = (): void => {
      if (ref.current) ref.current.textContent = format(story.p);
    };
    write();
    return story.subscribe(write);
  }, [story, ref, format]);
}

const clockText = (p: number): string => formatMissionTime(missionTimeAt(p));

/** Story mission clock (T-clock follows the scroll). */
export function StoryClock({ story, className }: { story: StoryFeed; className?: string | undefined }) {
  const ref = useRef<HTMLOutputElement>(null);
  useStoryText(story, ref, clockText);
  return (
    <output ref={ref} className={className} aria-label="Mission clock">
      {clockText(0)}
    </output>
  );
}

// Simulated telemetry for the stage readout: a plausible flight profile keyed on story progress (display only).
const smooth = (x: number): number => x * x * (3 - 2 * x);
const span = (p: number, a: number, b: number): number => Math.min(1, Math.max(0, (p - a) / (b - a)));

export function telemetryAt(p: number): { altKm: number; velKmh: number; prop: number; engines: number } {
  const up = smooth(span(p, 0.5, 0.62));
  const down = smooth(span(p, 0.64, 0.8));
  const altKm = p < 0.5 ? 0 : p < 0.63 ? up * 71.4 : (1 - down) * 71.4 * (1 - span(p, 0.62, 0.64)) + 0.06 * down;
  const velKmh = p < 0.5 ? 0 : p < 0.62 ? 5_900 * up : p < 0.8 ? 1_200 * (1 - down) + 6 : 0;
  const load = span(p, 1 / 3, 0.49) * 100;
  const prop = p < 0.5 ? load : Math.max(4.2, 100 - span(p, 0.5, 0.6) * 88 - span(p, 0.64, 0.8) * 7.8);
  const engines = p < 0.497 || p >= 0.8 ? 0 : p < 0.6 ? 33 : p < 0.66 ? 13 : 3;
  return { altKm: p >= 0.8 ? 0.06 : altKm, velKmh, prop, engines };
}

const fmt = (v: number, digits: number): string => v.toFixed(digits);

/** Telemetry block over the stage: altitude, velocity, propellant, engines. */
export function StageReadout({ story }: { story: StoryFeed }) {
  const alt = useRef<HTMLDataElement>(null);
  const vel = useRef<HTMLDataElement>(null);
  const prop = useRef<HTMLDataElement>(null);
  const eng = useRef<HTMLDataElement>(null);
  useEffect(() => {
    const write = (): void => {
      const t = telemetryAt(story.p);
      if (alt.current) alt.current.textContent = fmt(t.altKm, 1);
      if (vel.current) vel.current.textContent = fmt(t.velKmh, 0);
      if (prop.current) prop.current.textContent = fmt(t.prop, 1);
      if (eng.current) eng.current.textContent = `${t.engines} of 33`;
    };
    write();
    return story.subscribe(write);
  }, [story]);
  const chapter = useChapter(story);
  const phase = usePhase(story);
  return (
    <div className={styles.readout}>
      <p className={styles.readoutHead}>
        <span>[ LC-1 Flight 7 ]</span>
        <span>B-09 / S-21</span>
      </p>
      <StoryClock story={story} className={styles.clock} />
      <p className={styles.phase} aria-live="polite">
        {phase >= 0 ? (PHASES[phase]?.label ?? '') : chapter === 0 ? 'Contract accepted' : ''}
      </p>
      <dl className={styles.metrics}>
        <div>
          <dt>Alt km</dt>
          <dd>
            <data ref={alt} value="0">
              0.0
            </data>
          </dd>
        </div>
        <div>
          <dt>Vel km/h</dt>
          <dd>
            <data ref={vel} value="0">
              0
            </data>
          </dd>
        </div>
        <div>
          <dt>Prop %</dt>
          <dd>
            <data ref={prop} value="0">
              0.0
            </data>
          </dd>
        </div>
        <div>
          <dt>Engines</dt>
          <dd>
            <data ref={eng} value="0">
              0 of 33
            </data>
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** Countdown timeline of the game HUD: phase segments, done checks, current half glyph, playhead. */
export function PhaseBar({ story, onJump }: { story: StoryFeed; onJump: (p: number) => void }) {
  const head = useRef<HTMLSpanElement>(null);
  const phase = usePhase(story);
  useEffect(() => {
    const write = (): void => {
      const first = PHASES[0].from;
      const x = Math.min(1, Math.max(0, (story.p - first) / (1 - first)));
      if (head.current) head.current.style.transform = `translateX(${(x * 100).toFixed(2)}cqw)`;
    };
    write();
    return story.subscribe(write);
  }, [story]);
  return (
    <nav className={styles.phaseBar} aria-label="Launch phases">
      <ol className={styles.phases}>
        {PHASES.map((ph, i) => {
          const state = i < phase ? 'done' : i === phase ? 'current' : 'next';
          return (
            <li key={ph.id} data-state={state} style={{ flexGrow: Math.round((ph.to - ph.from) * 100) }}>
              <button type="button" onClick={() => onJump((ph.from + ph.to) / 2)} aria-current={state === 'current'}>
                <span className={styles.glyph} aria-hidden="true" />
                <span className={styles.phaseName}>{ph.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <span className={styles.track} aria-hidden="true">
        <span ref={head} className={styles.head} />
      </span>
    </nav>
  );
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Hero flight card: a live-looking T-minus that ticks once a second (frozen with reduced motion). */
export function FlightCard({ reduced }: { reduced: boolean }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [reduced]);
  const left = 23 * 60 + 41 - (tick % 600);
  const load = Math.min(100, 87.4 + tick * 0.05);
  const segments = 20;
  const filled = Math.round((load / 100) * segments);
  return (
    <section className={styles.card} aria-label="Next launch">
      <header className={styles.cardHead}>
        <span>[ LC-1 Flight 7 ]</span>
        <span className={styles.chip}>
          <span className={styles.dot} aria-hidden="true" />
          Live
        </span>
      </header>
      <div className={styles.cardRow}>
        <span className={styles.label}>Next launch</span>
        <output className={styles.cardClock}>
          T-00:{pad(Math.floor(left / 60))}:{pad(left % 60)}
        </output>
      </div>
      <div className={styles.cardRow}>
        <span className={styles.label}>Propellant loaded</span>
        <data className={styles.value} value={load.toFixed(1)}>
          {load.toFixed(1)} %
        </data>
        <span className={styles.segments} aria-hidden="true">
          {Array.from({ length: segments }, (_, i) => (
            <span key={i} data-on={i < filled} />
          ))}
        </span>
      </div>
      <div className={styles.cardGrid}>
        <div>
          <span className={styles.label}>Stations</span>
          <span className={styles.value}>4 of 5 GO</span>
        </div>
        <div>
          <span className={styles.label}>Range</span>
          <span className={styles.value}>GO</span>
        </div>
        <div>
          <span className={styles.label}>Window</span>
          <span className={styles.value}>90 min</span>
        </div>
        <div>
          <span className={styles.label}>Weather</span>
          <span className={styles.warn}>▲ Marginal</span>
        </div>
      </div>
    </section>
  );
}
