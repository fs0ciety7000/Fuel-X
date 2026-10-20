import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { projectionStore, view } from '@bridge/index';
import { Button, Glyph, SegmentedControl, type SegmentOption } from '../../components';
import type { Rate, TimeScaleVM } from '../../types';
import { announce } from '../frame/live';
import { capLabel, rateAnnouncement, rateSegments, readout, runEnded, selectedRate } from './rate';
import styles from './RateControl.module.css';

export interface RateControlViewProps {
  ts: TimeScaleVM;
  ended: boolean;
  onRate?: (r: Rate) => void;
  /** Skip to next milestone; absent → the SKIP button is disabled with the VM reason. */
  onSkip?: () => void;
  /** Hide the SIM readout (the top bar already prints it). */
  compact?: boolean;
}

/**
 * §6.25 rate control: radiogroup II · 1× · 10× · 100× (requested rate selected; an accent underline marks the
 * effective one when lower; capped steps hatched but selectable), SKIP button naming its milestone, SIM readout and
 * the reason chip (cap, one-shot drop, RUN ENDED).
 */
export function RateControlView({ ts, ended, onRate, onSkip, compact = false }: RateControlViewProps) {
  const options: SegmentOption<Rate>[] = rateSegments(ts, ended).map((s) => ({
    value: s.value,
    label: s.value === 0 ? <Glyph id="pause" /> : s.text,
    ariaLabel: s.ariaLabel,
    disabledReason: s.disabledReason,
    capReason: s.capReason,
  }));
  const cap = ended ? ts.lockLabel || 'RUN ENDED' : capLabel(ts);
  const drop = !ended && ts.drop ? ts.drop.label : null;
  const skipReason = ended ? 'RUN ENDED' : ts.skip.enabled && onSkip ? null : (ts.skip.reason ?? 'NO MILESTONE');
  const warn = !ended && (ts.lagging || ts.paused);
  return (
    <div className={styles.rate} data-testid="rate-control" data-ended={ended || undefined}>
      <SegmentedControl
        label="Time rate"
        options={options}
        value={selectedRate(ts)}
        effective={ts.effective}
        {...(onRate && !ended ? { onChange: onRate } : {})}
      />
      <Button
        glyph="skip"
        kbd="N"
        small
        disabledReason={ts.skip.active ? null : skipReason}
        busy={ts.skip.active}
        ariaLabel={`Skip to ${ts.skip.target ?? 'next milestone'}`}
        {...(onSkip ? { onClick: onSkip } : {})}
      >
        <span className={styles.skipText}>{ts.skip.active ? 'SKIPPING…' : (ts.skip.target ?? 'SKIP')}</span>
      </Button>
      {compact ? null : (
        <output className={styles.readout} data-state={warn ? 'warn' : undefined} data-testid="rate-readout">
          {ts.lagging ? <Glyph id="warn" /> : null}
          {readout(ts)}
        </output>
      )}
      {cap ? (
        <span className={styles.reason} data-testid="rate-reason">
          <Glyph id="offline" />
          {cap}
        </span>
      ) : null}
      {drop ? (
        <span className={styles.reason} data-testid="rate-drop">
          <Glyph id="offline" />
          {drop}
        </span>
      ) : null}
    </div>
  );
}

/** Live rate control (throttled projection; a request goes through `view.timeScale`). */
export function RateControl({ compact = false }: { compact?: boolean }) {
  const [ts, debriefOpen] = useStore(
    projectionStore,
    useShallow((p) => [p.timeScale, p.debrief !== null] as const),
  );
  const ended = runEnded(ts, debriefOpen);
  return (
    <RateControlView
      ts={ts}
      ended={ended}
      compact={compact}
      onRate={(r) => {
        view.timeScale(r);
        announce(rateAnnouncement(r, ts));
      }}
    />
  );
}
