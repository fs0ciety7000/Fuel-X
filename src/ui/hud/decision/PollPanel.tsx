import { useState } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { projectionStore, view } from '@bridge/index';
import { Glyph, HazardBand } from '../../components';
import type { GlyphId, StationVM } from '../../types';
import styles from './PollPanel.module.css';

const STATUS_WORD: Record<StationVM['status'], string> = {
  GO: 'GO',
  MARGINAL: 'MARGINAL',
  NO_GO: 'NO-GO',
  PENDING: 'POLLING…',
};
const STATUS_GLYPH: Record<StationVM['status'], GlyphId> = {
  GO: 'ok',
  MARGINAL: 'warn',
  NO_GO: 'danger',
  PENDING: 'pending',
};

export interface PollPanelVM {
  stations: StationVM[];
  /** `TERMINAL POLL` (open D2) or ''. */
  pollLabel: string;
  tClock: string;
  /** `1 MARGINAL · 1 NO-GO · 3 OF 5 GO` or the GO count. */
  result: string;
  /** Expanded while a poll is open and during any hold (§6.24). */
  open: boolean;
}

/** Result line: the poll's own result, else `n OF m GO`. */
export function pollResult(stations: readonly StationVM[], result?: string | null): string {
  if (result) return result;
  const go = stations.filter((s) => s.status === 'GO').length;
  return `${go} OF ${stations.length} GO`;
}

/** Panel severity: danger if any NO-GO, warn if any MARGINAL, else neutral. Uses the projected station states. */
export function pollState(stations: readonly StationVM[]): 'neutral' | 'warn' | 'danger' {
  if (stations.some((s) => s.state === 'danger')) return 'danger';
  if (stations.some((s) => s.state === 'warn')) return 'warn';
  return 'neutral';
}

export interface PollPanelViewProps {
  vm: PollPanelVM;
  /** Expanded by the player while no poll is open. */
  expanded?: boolean;
  onToggle?: () => void;
  onSource?: (id: string) => void;
}

/**
 * §6.24 Go / No-Go poll panel: evidence only, no count buttons (those live in the D2 strip, AC 28). Station table
 * (code, status glyph + word, driver), result line. Expanded during polls and holds; otherwise collapsed to its header.
 */
export function PollPanelView({ vm, expanded = false, onToggle, onSource }: PollPanelViewProps) {
  const open = vm.open || expanded;
  const state = pollState(vm.stations);
  const title = open
    ? `GO / NO-GO POLL${vm.tClock ? ` · ${vm.tClock}` : ''}${vm.pollLabel ? ` ${vm.pollLabel}` : ''}`
    : 'GO / NO-GO POLL';
  return (
    <section className={styles.panel} data-state={state} data-open={open || undefined} data-testid="poll-panel">
      {state === 'danger' ? <HazardBand orientation="horizontal" className={styles.band} /> : null}
      <header className={styles.head}>
        {state !== 'neutral' ? <Glyph id={state} /> : null}
        <h2 className={styles.title}>[ {title} ]</h2>
        {vm.open ? null : (
          <button type="button" className={styles.toggle} aria-expanded={open} onClick={onToggle}>
            {open ? '▾' : '▸'} {pollResult(vm.stations, vm.result)}
          </button>
        )}
      </header>
      {open ? (
        <>
          <table className={styles.table}>
            <caption className={styles.sr}>Station status</caption>
            <thead>
              <tr>
                <th scope="col">STATION</th>
                <th scope="col">STATUS</th>
                <th scope="col">DRIVER</th>
              </tr>
            </thead>
            <tbody>
              {vm.stations.map((s) => (
                <tr key={s.id} data-state={s.state}>
                  <th scope="row">
                    {s.sourceId ? (
                      <button
                        type="button"
                        className={styles.code}
                        title={`Select ${s.sourceCode ?? s.sourceId}`}
                        onClick={() => s.sourceId && onSource?.(s.sourceId)}
                      >
                        {s.code}
                      </button>
                    ) : (
                      <span className={styles.code}>{s.code}</span>
                    )}
                  </th>
                  <td className={styles.status}>
                    <Glyph id={s.glyph ?? STATUS_GLYPH[s.status]} />
                    {STATUS_WORD[s.status]}
                  </td>
                  <td className={styles.driver}>{s.detail ?? s.driver}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.result}>
            <span className={styles.label}>RESULT</span>
            <output aria-live="polite">{pollResult(vm.stations, vm.result)}</output>
          </p>
        </>
      ) : null}
    </section>
  );
}

/** Live poll panel: shown once a countdown exists and before liftoff (stations are projected). */
export function PollPanel() {
  const vm = useStore(
    projectionStore,
    useShallow((p) => {
      const d = p.decision?.kind === 'POLL' ? p.decision : null;
      return {
        stations: p.range.stations,
        pollLabel: d?.pollLabel ?? '',
        tClock: p.countdown?.tClock ?? '',
        result: d?.result ?? '',
        open: d !== null || p.clock.holding,
        show: p.countdown !== null && (p.countdown.actions?.length ?? 0) > 0,
      };
    }),
  );
  const [expanded, setExpanded] = useState(false);
  if (!vm.show || vm.stations.length === 0) return null;
  return (
    <PollPanelView
      vm={vm}
      expanded={expanded}
      onToggle={() => setExpanded((e) => !e)}
      onSource={(id) => view.select(id)}
    />
  );
}
