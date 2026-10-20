import { projectionStore, session } from '@bridge/index';
import { useEffect, useId, useRef } from 'react';
import { useStore } from 'zustand';
import { Button, Glyph, HazardBand, SegmentedProgress, StatusChip, Value } from '../../components';
import type { ActionVM, DebriefVM, ValueVM } from '../../types';
import { isPlainKey } from '../tabs/keys';
import {
  collapseDebrief,
  debriefActionId,
  debriefActions,
  debriefUi,
  isDebriefOpen,
  reopenDebrief,
  type DebriefActionId,
} from './debrief-ui';
import styles from './Debrief.module.css';

// §6.29 debrief sheet (GDD §4.9, §9, AC 22): outcome, money / reputation deltas, booster wear and flights, tower,
// ledger and the timestamped decision log, plus the exit actions. Every number is projected; no client maths.

/** Handlers of the exit actions (the HUD container binds them to the `session` port). */
export type DebriefHandlers = Partial<Record<DebriefActionId, () => void>>;

const negative = (v: ValueVM): boolean => v.text.startsWith('−');

/** Decision code column: the projected `code` (`D1`…`D3B`); fixtures without it fall back to a spec-shaped `id`. */
export const decisionCode = (x: { id: string; code?: string }): string =>
  x.code ?? (/^D\d[A-Z]?$/i.test(x.id) ? x.id.toUpperCase() : '');

function Delta({ label, d }: { label: string; d: DebriefVM['money'] }) {
  return (
    <div className={styles.cell}>
      <span className={styles.label}>{label}</span>
      <span className={styles.delta}>
        {negative(d.delta) ? <Glyph id="danger" label="LOSS" /> : null}
        <Value v={d.delta} />
      </span>
      <span className={styles.fromTo}>
        <Value v={d.from} /> → <Value v={d.to} />
      </span>
    </div>
  );
}

/** Disabled reason of an exit action: the projected one, or `NOT AVAILABLE YET` while the app has no handler. */
export function actionBlock(a: ActionVM, handlers: DebriefHandlers): string | null {
  if (!a.enabled) return a.reason ?? 'UNAVAILABLE';
  const k = debriefActionId(a.id);
  return k && handlers[k] ? null : 'NOT AVAILABLE YET';
}

export interface DebriefProps {
  d: DebriefVM;
  handlers?: DebriefHandlers;
  /** Render in flow (gallery) instead of a modal `<dialog>`. */
  inline?: boolean;
}

export function Debrief({ d, handlers = {}, inline = false }: DebriefProps) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const head = useRef<HTMLHeadingElement | null>(null);
  const id = useId();
  useEffect(() => {
    const el = ref.current;
    if (!el || inline) return;
    if (!el.open) el.showModal();
    head.current?.focus();
    return () => {
      if (el.open) el.close();
    };
  }, [inline]);
  const actions = debriefActions(d);
  const run = (a: ActionVM): void => {
    const k = debriefActionId(a.id);
    if (actionBlock(a, handlers) || !k) return;
    handlers[k]?.();
  };
  const danger = d.state === 'danger';
  return (
    <dialog
      ref={ref}
      className={inline ? `${styles.sheet} ${styles.inline}` : styles.sheet}
      data-state={d.state}
      data-outcome={d.outcome}
      data-testid="debrief"
      aria-labelledby={id}
      open={inline ? true : undefined}
      onCancel={(e) => {
        e.preventDefault();
        handlers.VIEW_SITE?.();
      }}
    >
      <header className={styles.head}>
        {danger ? <HazardBand /> : null}
        {danger ? <Glyph id="danger" /> : null}
        <h2 id={id} ref={head} tabIndex={-1} className={styles.title}>
          <span aria-hidden="true">[ </span>
          {d.title}
          <span aria-hidden="true"> ]</span>
        </h2>
        {d.meta || (d.stamp && d.stamp !== d.outcomeLabel) ? (
          <span className={styles.meta}>{d.meta ?? d.stamp}</span>
        ) : null}
      </header>

      <div className={styles.rowTop}>
        <div className={styles.stampCell}>
          {d.outcome === 'CATCH_FAILED' ? <HazardBand orientation="horizontal" wide /> : null}
          <p className={styles.stamp} data-outcome={d.outcome}>
            {d.outcomeLabel}
          </p>
        </div>
        <dl className={styles.facts}>
          {d.facts.map((f) => (
            <div key={f.label} className={styles.fact}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className={styles.rowMid}>
        <Delta label="MONEY Δ" d={d.money} />
        <Delta label="REPUTATION Δ" d={d.reputation} />
        <div className={styles.cell}>
          <span className={styles.label}>
            {d.booster.callSign} · {d.booster.state}
          </span>
          <span className={styles.line}>FLIGHTS {d.booster.flights}</span>
          <span className={styles.line}>
            WEAR {d.booster.wear.text} <SegmentedProgress seg={d.booster.wear} showText={false} />
          </span>
          <span className={styles.line}>
            <StatusChip
              glyph={d.tower.state === 'danger' ? 'danger' : 'ok'}
              label={d.tower.label}
              state={d.tower.state}
            />
          </span>
          <span className={styles.line}>
            TURNAROUND <Value v={d.turnaround} />
          </span>
        </div>
      </div>

      <div className={styles.rowLow}>
        <div className={styles.ledgerCell}>
          <table className={styles.ledger}>
            <caption className={styles.label}>LEDGER</caption>
            <thead>
              <tr>
                <th scope="col">ITEM</th>
                <th scope="col" className={styles.num}>
                  AMOUNT
                </th>
                <th scope="col" className={styles.num}>
                  REP
                </th>
              </tr>
            </thead>
            <tbody>
              {d.ledger.map((l) => (
                <tr key={l.label}>
                  <th scope="row">{l.label}</th>
                  <td className={styles.num}>
                    <Value v={l.amount} />
                  </td>
                  <td className={styles.num}>{l.reputation ? <Value v={l.reputation} /> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.cell}>
          <span className={styles.label}>DECISION LOG</span>
          {d.decisions.length ? (
            <ol className={styles.decisions}>
              {d.decisions.map((x) => (
                <li key={`${x.id}-${x.time}`}>
                  <samp className={styles.samp}>
                    <time>{x.time}</time>
                    <span className={styles.code}>{decisionCode(x)}</span>
                    <span>{x.detail}</span>
                    <span className={styles.by} data-by={x.by}>
                      {x.by}
                    </span>
                  </samp>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.line}>NO DECISIONS TAKEN</p>
          )}
          <p className={styles.anomalies}>
            ANOMALIES {d.anomalies.length ? d.anomalies.map((a) => `${a.id} ${a.label} ${a.time}`).join(' · ') : 'NONE'}
          </p>
        </div>
      </div>

      <footer className={styles.actions}>
        {[
          actions.filter((a) => debriefActionId(a.id) !== 'VIEW_SITE'),
          actions.filter((a) => debriefActionId(a.id) === 'VIEW_SITE'),
        ].map((group, i) => (
          <span key={i} className={styles.actionGroup}>
            {group.map((a) => (
              <Button
                key={a.id}
                variant={a.variant}
                {...(a.key ? { kbd: a.key } : {})}
                disabledReason={actionBlock(a, handlers)}
                onClick={() => run(a)}
              >
                {a.label}
              </Button>
            ))}
          </span>
        ))}
      </footer>
    </dialog>
  );
}

/** Collapsed state: the `[■ DEBRIEF READY B]` badge that reopens the sheet. */
export function DebriefReadyBadge({ onOpen }: { onOpen: () => void }) {
  return (
    <div className={styles.readyWrap}>
      <button type="button" className={styles.ready} onClick={onOpen} data-testid="debrief-ready">
        <Glyph id="parked" />
        DEBRIEF READY
        <kbd className={styles.kbd}>B</kbd>
      </button>
    </div>
  );
}

/**
 * Store-connected debrief for the HUD `overlay` slot: modal sheet while open, ready badge once collapsed (`B`
 * reopens). `handlers` wires REPLAY / NEW SEED / EXPORT LOG; VIEW SITE (Esc) always collapses.
 */
/** The app's session commands (GDD §13.2.3, AC 32) behind the exit actions. */
export const SESSION_DEBRIEF_HANDLERS: DebriefHandlers = {
  REPLAY: () => session.replaySameSeed(),
  NEW_SEED: () => session.newSeed(),
  EXPORT_LOG: () => session.exportLog(),
};

export function DebriefContainer({ handlers = SESSION_DEBRIEF_HANDLERS }: { handlers?: DebriefHandlers }) {
  const d = useStore(projectionStore, (p) => p.debrief);
  const ui = useStore(debriefUi);
  const open = isDebriefOpen(d, ui);
  useEffect(() => {
    if (!d || open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || !isPlainKey(e, 'b')) return;
      e.preventDefault();
      reopenDebrief();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [d, open]);
  if (!d) return null;
  if (!open) return <DebriefReadyBadge onOpen={reopenDebrief} />;
  return (
    <Debrief
      d={d}
      handlers={{
        ...handlers,
        VIEW_SITE: () => {
          collapseDebrief(d);
          session.viewSite();
        },
      }}
    />
  );
}
