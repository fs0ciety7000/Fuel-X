import { useEffect, useRef, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { commands, projectionStore, view } from '@bridge/index';
import { Button, Glyph } from '../../components';
import type { ActionVM, CountdownVM, PhaseVM, Severity } from '../../types';
import { ownedByTarget } from '../frame/keys';
import { announce } from '../frame/live';
import { crossedMilestone } from './bar';
import { PhaseBar } from './PhaseBar';
import { RateControl } from '../topbar/RateControl';
import styles from './CountdownTimeline.module.css';

export interface TimelineHeadVM {
  countdown: CountdownVM | null;
  tClock: string;
  holding: boolean;
  /** `HOLD · POLL` while holding. */
  holdLabel: string;
  paused: boolean;
}

/**
 * The single count button while counting (GDD §4.5 "one command surface", AC 28): HOLD, in the timeline header.
 * While holding there is none here (GO / RECYCLE / SCRUB live in the D2 strip).
 */
export function headerAction(cd: CountdownVM | null): ActionVM | null {
  if (!cd || cd.holding || cd.scrubbed) return null;
  return cd.actions?.find((a) => a.id === 'HOLD') ?? null;
}

/** HOLD is deliberate (GDD §4.5: high stakes): Shift+H, global outside text fields; plain H = camera home (§8). */
export const HOLD_KEY_HINT = '⇧H';
export function isHoldKey(e: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>): boolean {
  return e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'h';
}

/** Clock box state: scrub = danger plate, hold = warn frame, paused = warn plate; else ink. */
export function clockState(h: TimelineHeadVM): { state: Severity; word: string | null } {
  if (h.countdown?.scrubbed) return { state: 'danger', word: 'SCRUB' };
  if (h.holding) return { state: 'warn', word: 'HOLD' };
  if (h.paused) return { state: 'warn', word: 'PAUSED' };
  return { state: 'neutral', word: null };
}

export interface CountdownTimelineViewProps {
  head: TimelineHeadVM;
  /** Rate control node (live `RateControl` in the game, a fixture view in `/design`). */
  rate?: ReactNode;
  onAction?: (a: ActionVM) => void;
  /** Click on a phase label (→ Tasks tab). */
  onPhase?: (p: PhaseVM) => void;
}

/** §6.17 countdown band: `[ COUNTDOWN ]` + context, rate control, HOLD (counting only), big T-clock. */
export function CountdownTimelineView({ head, rate, onAction, onPhase }: CountdownTimelineViewProps) {
  const cd = head.countdown;
  const hold = headerAction(cd);
  const cs = clockState(head);
  return (
    <section className={styles.band} aria-label="Countdown" data-testid="countdown" data-state={cd?.state ?? 'neutral'}>
      <div className={styles.main}>
        <header className={styles.head}>
          <h2 className={styles.title}>[ COUNTDOWN ]</h2>
          <span className={styles.context}>{cd?.title ?? 'NO COUNT SCHEDULED'}</span>
          <span className={styles.fill} />
          {rate}
          {hold ? (
            <Button
              kbd={HOLD_KEY_HINT}
              small
              disabledReason={hold.enabled ? null : (hold.reason ?? 'UNAVAILABLE')}
              onClick={() => onAction?.(hold)}
            >
              {hold.label}
            </Button>
          ) : head.holding ? (
            <span className={styles.holdTag} data-testid="hold-tag">
              <Glyph id="holding" />
              {head.holdLabel || 'HOLD'}
            </span>
          ) : null}
        </header>
        {cd ? (
          <PhaseBar cd={cd} {...(onPhase ? { onPhase } : {})} />
        ) : (
          <p className={styles.empty}>NO COUNT SCHEDULED</p>
        )}
      </div>
      <div className={styles.clock} data-state={cs.state} data-testid="t-clock">
        <time className={styles.clockDigits} aria-live="off">
          {head.tClock || '—'}
        </time>
        {cs.word ? <span className={styles.clockWord}>{cs.word}</span> : null}
      </div>
    </section>
  );
}

/** Live countdown band. */
export function CountdownTimeline() {
  const head = useStore(
    projectionStore,
    useShallow((p): TimelineHeadVM => ({
      countdown: p.countdown,
      tClock: p.countdown?.tClock ?? p.clock.tClock,
      holding: p.clock.holding,
      holdLabel: p.clock.holdLabel ?? '',
      paused: p.timeScale.paused,
    })),
  );
  // The T-clock is not live; phase changes and T−10 / T−5 / T−0 are announced politely (§6.17).
  const cd = head.countdown;
  const phase = cd?.phases.find((p) => p.state === 'current' || p.state === 'held')?.label ?? null;
  const last = useRef<{ phase: string | null; t: number | null | undefined }>({ phase, t: cd?.tClockS });
  useEffect(() => {
    const prev = last.current;
    if (phase && prev.phase !== null && phase !== prev.phase) announce(`PHASE: ${phase}`);
    const m = crossedMilestone(prev.t, cd?.tClockS);
    if (m !== null) announce(m === 0 ? 'T-ZERO' : `T MINUS ${-m}`);
    last.current = { phase, t: cd?.tClockS };
  }, [phase, cd?.tClockS]);
  const hold = headerAction(cd);
  useEffect(() => {
    if (!hold) return;
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.defaultPrevented || !isHoldKey(e) || ownedByTarget(e.target, e.key)) return;
      e.preventDefault();
      if (hold.enabled && hold.command) {
        commands.send(hold.command);
        announce('HOLD SENT');
      } else announce(`HOLD UNAVAILABLE${hold.reason ? `, ${hold.reason}` : ''}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hold]);
  return (
    <CountdownTimelineView
      head={head}
      rate={<RateControl compact />}
      onPhase={() => view.tab('tasks')}
      onAction={(a) => {
        if (a.enabled && a.command) commands.send(a.command);
      }}
    />
  );
}
