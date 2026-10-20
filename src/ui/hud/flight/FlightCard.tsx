import { projectionStore, view } from '@bridge/index';
import { useStore } from 'zustand';
import { MetricTile, Panel, SegmentedProgress, Value } from '../../components';
import type { FlightCardVM } from '../../types';
import styles from './FlightCard.module.css';

// §6.7 flight card: the four tiles that carry D1 (propellant margin + farm reserve tick) and D2 (stations GO, range
// trend). Renders the projection verbatim; the only local maths is clamping the reserve gauge to its track.

export interface FlightCardProps {
  card: FlightCardVM;
  /** Hide sparklines (compact mode, §3.3). */
  compact?: boolean;
  /** Header shortcut to the Tasks tab (§6.7 "click card = open Tasks"). */
  onOpenTasks?: () => void;
}

export function FlightCard({ card, compact = false, onOpenTasks }: FlightCardProps) {
  const reserve = card.farmReserve;
  const reservePct = reserve === null ? 0 : Math.round(Math.min(1, Math.max(0, reserve)) * 1000) / 10;
  return (
    <Panel
      title={card.title}
      className={styles.card}
      bodyClassName={styles.body ?? ''}
      meta={
        onOpenTasks ? (
          <button type="button" className={styles.link} onClick={onOpenTasks}>
            TASKS ›
          </button>
        ) : undefined
      }
    >
      <MetricTile metric={card.nextLaunch} noSpark={compact} className={styles.tile}>
        <span className={styles.vehicles}>
          {card.vehicles}
          {card.contract ? ` · ${card.contract.id}` : ''}
        </span>
      </MetricTile>
      <MetricTile metric={card.propellant} noSpark={compact} className={styles.tile}>
        {reserve !== null ? (
          <span className={styles.reserve} data-testid="farm-reserve">
            <span className={styles.sub}>
              FARM {card.farmReserveFluid ?? ''}
              {card.farmReserveTime ? <Value v={card.farmReserveTime} /> : null}
            </span>
            <span className={styles.gauge} aria-hidden="true">
              <span className={styles.gaugeFill} style={{ width: `${reservePct}%` }} />
            </span>
          </span>
        ) : null}
      </MetricTile>
      <MetricTile metric={card.stations} noSpark={compact} className={styles.tile}>
        <SegmentedProgress seg={card.stations.segments} showText={false} />
      </MetricTile>
      <MetricTile metric={card.range} noSpark={compact} className={styles.tile} />
    </Panel>
  );
}

/** Store-connected card for the HUD `left` slot; hidden when there is no countdown. */
export function FlightCardContainer({ compact = false }: { compact?: boolean }) {
  const card = useStore(projectionStore, (p) => p.flightCard);
  if (!card) return null;
  return <FlightCard card={card} compact={compact} onOpenTasks={() => view.tab('tasks')} />;
}
