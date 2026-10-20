import { forwardRef, useId, type KeyboardEvent } from 'react';
import { Button, DeadlineBar, Glyph, HazardBand, SegmentedProgress, StatusChip, Value } from '../../components';
import type {
  CatchDecisionVM,
  ConsequenceVM,
  DecisionOptionVM,
  DecisionVM,
  LeakDecisionVM,
  PollDecisionVM,
  PropMarginDecisionVM,
} from '../../types';
import { BAND_STATE, collapsedLine, KIND_CODE, queuedLabel, stripState } from './decision';
import styles from './DecisionStrip.module.css';

function Consequences({ items, className }: { items: readonly ConsequenceVM[]; className?: string | undefined }) {
  if (items.length === 0) return null;
  return (
    <dl className={[styles.cq, className].filter(Boolean).join(' ')}>
      {items.map((c) => (
        <div key={c.label} className={styles.cqRow} data-state={c.state}>
          <dt>
            {c.state === 'warn' || c.state === 'danger' ? <Glyph id={c.state} /> : null}
            {c.label}
          </dt>
          <dd>
            <Value v={c.value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function CatchEvidence({ d }: { d: CatchDecisionVM }) {
  const p = Math.max(0, Math.min(1, d.p.value ?? 0));
  const state = BAND_STATE[d.band];
  return (
    <div className={styles.evidence} data-testid="evidence-catch">
      <div className={styles.pLine}>
        <span className={styles.label}>P(CATCH)</span>
        <output className={styles.pValue}>
          <Value v={d.p} />
        </output>
        <StatusChip
          glyph={state === 'danger' ? 'danger' : state === 'warn' ? 'warn' : state === 'ok' ? 'ok' : 'pending'}
          label={d.band}
          state={state}
        />
      </div>
      <div className={styles.pBar} aria-hidden="true">
        <span className={styles.pFill} style={{ width: `${p * 100}%` }} />
        <span className={styles.pTick} style={{ left: `${d.breakEven * 100}%` }} />
      </div>
      <span className={styles.label}>
        BREAK-EVEN {d.breakEven.toFixed(3)}
        {d.sigma ? (
          <>
            {' · '}
            <span className={styles.sigma}>σ</span> <Value v={d.sigma} />
          </>
        ) : null}
      </span>
      {d.forcedDivert ? (
        <span className={styles.forced}>
          <Glyph id="danger" />
          {d.forcedDivert}
        </span>
      ) : null}
    </div>
  );
}

function PollEvidence({ d }: { d: PollDecisionVM }) {
  return (
    <div className={styles.evidence} data-testid="evidence-poll">
      <ul className={styles.stations} aria-label="Stations">
        {d.stations.map((s) => (
          <li key={s.id}>
            <StatusChip
              glyph={s.glyph ?? (s.state === 'ok' ? 'ok' : s.state === 'danger' ? 'danger' : 'warn')}
              label={`${s.code} ${s.status.replace('_', '-')}`}
              state={s.state}
            />
          </li>
        ))}
      </ul>
      {d.result ? <span className={styles.body}>{d.result}</span> : null}
      {d.blocker ? (
        <span className={styles.forced}>
          <Glyph id="danger" />
          {d.blocker}
        </span>
      ) : null}
      {d.riskNote ? <span className={styles.note}>{d.riskNote}</span> : null}
      {d.evidence ? <Consequences items={d.evidence} className={styles.cqInline} /> : null}
    </div>
  );
}

function LeakEvidence({ d }: { d: LeakDecisionVM }) {
  return (
    <div className={styles.evidence} data-testid="evidence-leak">
      <span className={styles.label}>LOAD COMPLETE AT</span>
      <dl className={styles.cq}>
        {d.loadEta.map((e) => (
          <div key={e.label} className={styles.cqRow} data-state={e.state}>
            <dt>
              {e.state === 'warn' || e.state === 'danger' ? <Glyph id={e.state} /> : null}
              {e.label}
            </dt>
            <dd>
              <Value v={e.at} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function PropEvidence({ d }: { d: PropMarginDecisionVM }) {
  return (
    <div className={styles.evidence} data-testid="evidence-prop">
      <dl className={styles.cq}>
        {d.reserves.map((r) => (
          <div key={r.key} className={styles.cqRow} data-state={r.state}>
            <dt>
              {r.state === 'warn' || r.state === 'danger' ? <Glyph id={r.state} /> : null}
              {r.label}
            </dt>
            <dd>
              <Value v={r.value} />
            </dd>
          </div>
        ))}
        {d.orders.map((o) => (
          <div key={o.label} className={styles.cqRow} data-state="neutral">
            <dt>{o.label}</dt>
            <dd>
              <Value v={o.eta} />
            </dd>
          </div>
        ))}
      </dl>
      <span className={styles.fleet}>
        <span className={styles.label}>TRUCKS</span>
        <SegmentedProgress seg={d.fleet} />
      </span>
    </div>
  );
}

function Evidence({ d }: { d: DecisionVM }) {
  switch (d.kind) {
    case 'CATCH':
      return <CatchEvidence d={d} />;
    case 'POLL':
      return <PollEvidence d={d} />;
    case 'LEAK':
      return <LeakEvidence d={d} />;
    case 'PROP_MARGIN':
      return <PropEvidence d={d} />;
  }
}

function OptionCell({
  o,
  pending,
  onPress,
}: {
  o: DecisionOptionVM;
  pending: string | null;
  onPress?: ((o: DecisionOptionVM) => void) | undefined;
}) {
  const busy = pending === o.id;
  return (
    <div className={styles.option} data-testid={`option-${o.id}`}>
      <div className={styles.optionHead}>
        <Button
          variant={o.variant}
          {...(o.variant === 'danger' ? { glyph: 'danger' as const } : {})}
          {...(o.key ? { kbd: o.key } : {})}
          disabledReason={pending !== null && !busy ? 'SENT' : o.enabled ? null : (o.reason ?? 'UNAVAILABLE')}
          busy={busy}
          {...(onPress ? { onClick: () => onPress(o) } : {})}
        >
          {busy ? `SENT · ${o.label}` : o.label}
        </Button>
        {o.auto ? <span className={styles.auto}>AUTO</span> : null}
      </div>
      {!o.enabled && o.reason ? <span className={styles.reason}>⊘ {o.reason}</span> : null}
      <Consequences items={o.consequences} />
      {o.ev ? (
        <div className={styles.ev}>
          <span>EV</span>
          <Value v={o.ev} />
        </div>
      ) : null}
    </div>
  );
}

export interface DecisionStripViewProps {
  d: DecisionVM;
  /** Rate drop chip (`1× · DECISION OPEN`) from the time-scale VM. */
  dropLabel?: string | null;
  /** Option id sent, awaiting projection confirmation (UI-local). */
  pending?: string | null;
  /** D1 only: collapsed to one line. */
  collapsed?: boolean;
  onToggle?: () => void;
  onPress?: (o: DecisionOptionVM) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
}

/**
 * §6.28 decision strip: the only command surface for D1–D3b. Header (kind, title, queued, rate drop) · question +
 * auto policy · decision evidence · deadline · D3 drivers · one column per option with its consequences and EV.
 * Severity: info frame / warn = accent frame / danger = hazard band on top.
 */
export const DecisionStripView = forwardRef<HTMLElement, DecisionStripViewProps>(function DecisionStripView(
  { d, dropLabel, pending = null, collapsed = false, onToggle, onPress, onKeyDown },
  ref,
) {
  const id = useId();
  const state = stripState(d);
  const queued = queuedLabel(d);
  return (
    <section
      ref={ref}
      tabIndex={-1}
      className={styles.strip}
      data-state={state}
      data-kind={d.kind}
      data-collapsed={collapsed || undefined}
      data-testid="decision-strip"
      aria-labelledby={`${id}-q`}
      aria-describedby={`${id}-auto`}
      onKeyDown={onKeyDown}
    >
      {state === 'danger' ? <HazardBand orientation="horizontal" className={styles.band} /> : null}
      <header className={styles.head}>
        <span className={styles.kind}>{KIND_CODE[d.kind]}</span>
        <span className={styles.title}>[ DECISION · {d.title} ]</span>
        <span className={styles.fill} />
        {queued ? <span className={styles.queued}>{queued}</span> : null}
        {dropLabel ? (
          <span className={styles.drop}>
            <Glyph id="offline" />
            {dropLabel}
          </span>
        ) : null}
        {d.kind === 'PROP_MARGIN' ? (
          <Button small kbd="O" {...(onToggle ? { onClick: onToggle } : {})} aria-expanded={!collapsed}>
            {collapsed ? 'ORDER ▸' : 'COLLAPSE'}
          </Button>
        ) : null}
      </header>
      {collapsed && d.kind === 'PROP_MARGIN' ? (
        <p id={`${id}-q`} className={styles.line}>
          <span className={styles.lineText}>{collapsedLine(d)}</span>
          <span id={`${id}-auto`} className={styles.note}>
            {d.question}
          </span>
        </p>
      ) : (
        <>
          <div className={styles.body}>
            <div className={styles.question}>
              <h2 id={`${id}-q`} className={styles.q}>
                {d.question}
              </h2>
              <p id={`${id}-auto`} className={styles.note}>
                {d.autoNote || 'NO AUTO ACTION'}
              </p>
            </div>
            <Evidence d={d} />
            <div className={styles.deadline}>
              <DeadlineBar d={d.deadline} />
            </div>
          </div>
          {d.kind === 'CATCH' && d.drivers.length > 0 ? (
            <ul className={styles.drivers} aria-label="Drivers">
              <li className={styles.label}>DRIVERS</li>
              {d.drivers.map((r) => (
                <li key={r.label} className={styles.driver} data-state={r.state}>
                  {r.state === 'warn' || r.state === 'danger' ? <Glyph id={r.state} /> : null}
                  <span>{r.label}</span>
                  <Value v={r.value} />
                  <span className={styles.effect}>{r.effect}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div
            className={styles.options}
            style={{ gridTemplateColumns: `repeat(${Math.max(1, d.options.length)}, minmax(0, 1fr))` }}
          >
            {d.options.map((o) => (
              <OptionCell key={o.id} o={o} pending={pending ?? d.pending} onPress={onPress} />
            ))}
          </div>
        </>
      )}
    </section>
  );
});
