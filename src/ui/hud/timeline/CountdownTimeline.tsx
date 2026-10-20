import type { KeyboardEvent, ReactNode } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { commands, projectionStore } from '@bridge/index';
import { Button, Glyph } from '../../components';
import type { ActionVM, CountdownVM, Severity } from '../../types';
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
}

/** §6.17 countdown band: `[ COUNTDOWN ]` + context, rate control, HOLD (counting only), big T-clock. */
export function CountdownTimelineView({ head, rate, onAction }: CountdownTimelineViewProps) {
  const cd = head.countdown;
  const hold = headerAction(cd);
  const cs = clockState(head);
  const onKey = (e: KeyboardEvent<HTMLElement>): void => {
    // Option keys are scoped to the band (H is the camera's home key elsewhere, §8).
    if (e.key.toLowerCase() === 'h' && hold?.enabled && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT') return;
      e.preventDefault();
      onAction?.(hold);
    }
  };
  return (
    <section
      className={styles.band}
      aria-label="Countdown"
      data-testid="countdown"
      data-state={cd?.state ?? 'neutral'}
      onKeyDown={onKey}
    >
      <div className={styles.main}>
        <header className={styles.head}>
          <h2 className={styles.title}>[ COUNTDOWN ]</h2>
          <span className={styles.context}>{cd?.title ?? 'NO COUNT SCHEDULED'}</span>
          <span className={styles.fill} />
          {rate}
          {hold ? (
            <Button
              kbd="H"
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
  return (
    <CountdownTimelineView
      head={head}
      rate={<RateControl compact />}
      onAction={(a) => {
        if (a.enabled && a.command) commands.send(a.command);
      }}
    />
  );
}
