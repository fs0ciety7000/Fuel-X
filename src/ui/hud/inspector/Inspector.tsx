import { commands, projectionStore, view } from '@bridge/index';
import { useEffect, useId, useState } from 'react';
import { useStore } from 'zustand';
import {
  Button,
  Dialog,
  Glyph,
  HazardBand,
  LabelTag,
  LinearProgress,
  Sparkline,
  StatusChip,
  Value,
} from '../../components';
import type { ActionVM, InspectorVM, MetricVM } from '../../types';
import { isPlainKey } from '../tabs/keys';
import styles from './Inspector.module.css';
import { compactMetricKeys } from './priority';

// §6.11 inspector card for any selected entity (booster, ship, vessel, transporter, tanker, …): the metric set is
// data-driven (projected per class), so this component has no per-class branches. Serves D3 (landing prop, engines,
// tower wind, catch P) and monitoring.

export interface InspectorProps {
  vm: InspectorVM;
  /** Follow / unfollow (FOLLOW F). */
  onFollow?: (id: string | null) => void;
  /** Frame the selection with the camera. */
  onFrame?: () => void;
  /** Enabled entity action (after its confirm dialog when it has one). */
  onAction?: (a: ActionVM) => void;
  /**
   * Force the compact rules (§3.3: 6 metrics by class priority, chart behind `▸ CHART`) outside the HUD, e.g. on
   * `/design`. In the game the `hud` container query applies the same rules, so the container never passes it.
   */
  compact?: boolean;
  /** A go/no-go poll is open: below 900 px of HUD height the card collapses to its header (§3.3). */
  pollActive?: boolean;
  /** Force the collapsed header (name + chip) outside the HUD, e.g. on `/design`. */
  headerOnly?: boolean;
}

/** Alert = the status chip or any metric is in danger (§6.11 "header gets danger band"). */
export function inspectorAlert(vm: InspectorVM): boolean {
  return vm.status.state === 'danger' || vm.metrics.some((m) => m.state === 'danger');
}

function MetricCell({ m, drop }: { m: MetricVM; drop: boolean }) {
  return (
    <div className={styles.cell} data-state={m.state} data-compact-drop={drop || undefined}>
      <dt className={styles.label}>
        {m.state === 'warn' || m.state === 'danger' ? <Glyph id={m.state} /> : null}
        {m.label}
      </dt>
      <dd className={styles.value}>
        <Value v={m.value} />
      </dd>
    </div>
  );
}

export function Inspector({
  vm,
  onFollow,
  onFrame,
  onAction,
  compact = false,
  pollActive = false,
  headerOnly = false,
}: InspectorProps) {
  const headId = useId();
  const chartId = useId();
  const [confirm, setConfirm] = useState<ActionVM | null>(null);
  const [chartOpen, setChartOpen] = useState(false);
  const keep = compactMetricKeys(vm);
  const trimmed = keep.size < vm.metrics.length;
  const alert = !vm.lost && inspectorAlert(vm);
  const state = vm.lost ? 'disabled' : alert ? 'danger' : 'neutral';
  const run = (a: ActionVM): void => {
    if (!a.enabled) return;
    if (a.confirm && a.confirm.length) setConfirm(a);
    else onAction?.(a);
  };
  return (
    <aside
      className={styles.inspector}
      aria-labelledby={headId}
      data-state={state}
      data-kind={vm.kind}
      data-compact={compact || undefined}
      data-poll={pollActive || undefined}
      data-collapsed={headerOnly || undefined}
      data-testid="inspector"
    >
      <header className={styles.head}>
        {alert ? <HazardBand orientation="horizontal" /> : null}
        <div className={styles.identity}>
          <h2 id={headId} className={vm.following ? styles.callSignHero : styles.callSign}>
            {vm.callSign}
          </h2>
          <LabelTag
            callSign={vm.callSign}
            glyph={vm.lost ? 'offline' : 'selected'}
            state={vm.lost ? 'disabled' : alert ? 'selected-alert' : 'selected'}
          />
        </div>
        <p className={styles.sub}>{vm.sub}</p>
        <StatusChip
          glyph={vm.lost ? 'offline' : vm.status.glyph}
          label={vm.lost ? 'LOST' : vm.status.label}
          meta={vm.status.meta ?? (vm.following ? 'FOLLOWING' : 'SELECTED')}
          state={vm.lost ? 'disabled' : vm.status.state}
          full
          live
        />
      </header>
      {vm.metrics.length ? (
        <dl className={styles.metrics} aria-label={`${vm.callSign} metrics`} data-trimmed={trimmed || undefined}>
          {vm.metrics.map((m) => (
            <MetricCell key={m.key} m={m} drop={!keep.has(m.key)} />
          ))}
        </dl>
      ) : null}
      {vm.progress ? (
        <div className={styles.section}>
          <LinearProgress p={vm.progress} />
        </div>
      ) : null}
      {vm.chart ? (
        <div className={styles.disclosure}>
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={chartOpen}
            aria-controls={chartId}
            onClick={() => setChartOpen((o) => !o)}
          >
            {chartOpen ? '▾' : '▸'} CHART
          </button>
        </div>
      ) : null}
      {vm.chart ? (
        <figure id={chartId} className={styles.chart} data-open={chartOpen || undefined}>
          <figcaption className={styles.label}>{vm.chart.label}</figcaption>
          <Sparkline series={vm.chart.series} label={`${vm.chart.label}, last ${vm.chart.series.length} samples`} />
        </figure>
      ) : null}
      <div className={styles.actions} role="toolbar" aria-label={`${vm.callSign} actions`}>
        <Button
          small
          variant={vm.following ? 'primary' : 'secondary'}
          kbd="F"
          disabledReason={vm.lost ? 'LOST' : null}
          onClick={() => onFollow?.(vm.following ? null : vm.id)}
        >
          {vm.following ? 'UNFOLLOW' : 'FOLLOW'}
        </Button>
        <Button small disabledReason={vm.lost ? 'LOST' : null} onClick={() => onFrame?.()}>
          FRAME
        </Button>
        {vm.actions.map((a) => (
          <Button
            key={a.id}
            small
            variant={a.variant}
            {...(a.variant === 'danger' ? { glyph: 'danger' as const } : {})}
            {...(a.key ? { kbd: a.key } : {})}
            disabledReason={a.enabled ? null : (a.reason ?? 'UNAVAILABLE')}
            onClick={() => run(a)}
          >
            {a.confirm && a.confirm.length ? `${a.label}…` : a.label}
          </Button>
        ))}
      </div>
      {confirm ? (
        <Dialog
          title={`${confirm.label} ${vm.callSign}`}
          open
          danger={confirm.variant === 'danger'}
          consequences={confirm.confirm ?? []}
          onCancel={() => setConfirm(null)}
          actions={
            <>
              <Button onClick={() => setConfirm(null)}>CANCEL</Button>
              <Button
                variant={confirm.variant === 'danger' ? 'danger' : 'primary'}
                onClick={() => {
                  onAction?.(confirm);
                  setConfirm(null);
                }}
              >
                CONFIRM {confirm.label}
              </Button>
            </>
          }
        />
      ) : null}
    </aside>
  );
}

/** Sends an action's sim command (UI-only actions without a command are ignored here). */
export function sendAction(a: ActionVM): void {
  if (a.enabled && a.command) commands.send(a.command);
}

/** Store-connected inspector for the HUD `right` slot. Hidden without a selection; `F` toggles follow. */
export function InspectorContainer({ compact = false }: { compact?: boolean }) {
  const vm = useStore(projectionStore, (p) => p.inspector);
  // Same condition that opens the poll panel (§6.24): a POLL decision or a hold, while the countdown has actions.
  const pollActive = useStore(
    projectionStore,
    (p) =>
      p.countdown !== null &&
      (p.countdown.actions?.length ?? 0) > 0 &&
      p.range.stations.length > 0 &&
      (p.decision?.kind === 'POLL' || p.clock.holding),
  );
  const id = vm?.id ?? null;
  const following = vm?.following ?? false;
  const lost = vm?.lost ?? false;
  useEffect(() => {
    if (!id || lost) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || !isPlainKey(e, 'f')) return;
      e.preventDefault();
      view.follow(following ? null : id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, following, lost]);
  if (!vm) return null;
  return (
    <Inspector
      vm={vm}
      compact={compact}
      pollActive={pollActive}
      onFollow={(next) => view.follow(next)}
      onFrame={() => view.camera({ kind: 'frame' })}
      onAction={sendAction}
    />
  );
}
