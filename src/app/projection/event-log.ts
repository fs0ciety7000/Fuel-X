// Events tab / toasts source (DESIGN_SYSTEM §6.23): drained SimEvents → formatted log rows, newest first, capped.
// Fed from the bus once per frame; names are resolved at log time (despawned entities keep their call-sign).
// Low-signal bookkeeping events (ledger postings, tower mechanism steps, clock FSM echoes) are not logged.
import type { EventVM, GlyphId, Severity } from '@bridge/projection-types';
import type { SimEvent, SimEventType, World } from '@sim/types';
import { DT_S } from '@sim/index';
import { credits, fixed, tClock, tonnes, utc, words } from './format';
import { ANOMALY_LABEL, DRIVER_LABEL, GO_LABEL, PHASE_LABEL, POLL_LABEL, STATION_LABEL, reasonLabel } from './labels';
import type { StationDriver } from '@sim/types';

export const EVENT_LOG_MAX = 200;

/** Events that trigger an immediate projection (ARCHITECTURE §8) besides the 10 Hz cadence. */
export const SALIENT_EVENTS: ReadonlySet<SimEventType> = new Set<SimEventType>([
  'PhaseChanged',
  'ClockChanged',
  'HoldStarted',
  'HoldReleased',
  'PollOpened',
  'PollPassed',
  'Recycled',
  'WindowMissed',
  'StationChanged',
  'DecisionRequired',
  'AnomalyFired',
  'LeakResponded',
  'LeakCleared',
  'Spawned',
  'Despawned',
  'RecoveryCommitted',
  'RecoveryOutcome',
  'DebriefReady',
  'CommandRejected',
]);

interface RowText {
  text: string;
  severity: Severity;
  glyph: GlyphId;
  entityId: string | null;
  /** Exact T-clock (ticks) carried by the event. */
  tClockTicks?: number;
}

const row = (text: string, severity: Severity, glyph: GlyphId, entityId: string | null = null): RowText => ({
  text,
  severity,
  glyph,
  entityId,
});

/** Event → log line; null = not logged. */
export function describeEvent(e: SimEvent): RowText | null {
  switch (e.t) {
    case 'PhaseChanged':
      return row(`${PHASE_LABEL[e.to]} STARTED`, e.to === 'Scrubbed' ? 'danger' : 'info', 'current');
    case 'HoldStarted':
      return {
        ...row(`HOLD · ${words(e.reason)}${e.poll ? ` · ${POLL_LABEL[e.poll]}` : ''}`, 'warn', 'warn'),
        tClockTicks: e.tClockTicks,
      };
    case 'HoldReleased':
      return { ...row(`COUNT RESUMED · ${e.by}`, 'ok', 'ok'), tClockTicks: e.tClockTicks };
    case 'PollOpened':
      return row(`${POLL_LABEL[e.poll]} OPEN`, 'info', 'pending');
    case 'PollPassed':
      return row(
        `${POLL_LABEL[e.poll]} PASSED${e.auto ? ' · AUTO' : ''}${e.marginal.length ? ` · GO ON MARGINAL ${e.marginal.map((s) => STATION_LABEL[s]).join(', ')}` : ''}`,
        e.marginal.length ? 'warn' : 'ok',
        e.marginal.length ? 'warn' : 'ok',
      );
    case 'Recycled':
      return { ...row(`RECYCLE TO ${tClock(e.toTClockTicks)}`, 'warn', 'warn'), tClockTicks: e.toTClockTicks };
    case 'WindowMissed': {
      const p = credits(e.penaltyCr);
      return row(`WINDOW MISSED · ${e.contractId} · PENALTY ${p.text} ${p.unit}`, 'danger', 'danger');
    }
    case 'StationChanged': {
      const sev: Severity = e.status === 'GO' ? 'ok' : e.status === 'MARGINAL' ? 'warn' : 'danger';
      const driver = DRIVER_LABEL[e.driver as StationDriver] ?? words(e.driver);
      return row(
        `${STATION_LABEL[e.station]} ${GO_LABEL[e.status]}${e.status === 'GO' ? '' : ` · ${driver}`}`,
        sev,
        sev === 'ok' ? 'ok' : sev === 'warn' ? 'warn' : 'danger',
      );
    }
    case 'DecisionRequired':
      return row(
        `DECISION · ${e.decision === 'POLL' ? (e.poll ? POLL_LABEL[e.poll] : 'GO / NO-GO') : e.decision === 'CATCH' ? 'CATCH OR DIVERT' : 'GSE LEAK RESPONSE'}`,
        'warn',
        'warn',
      );
    case 'AnomalyFired':
      return row(`${ANOMALY_LABEL[e.anomaly]} · ${e.source}`, 'danger', 'danger', e.entityId);
    case 'LeakResponded':
      return row(`LEAK RESPONSE · ${words(e.choice)}`, 'info', 'current');
    case 'LeakCleared':
      return row(`LEAK CLEARED · ${e.by}`, 'ok', 'ok');
    case 'ContractUpdated':
      return row(`CONTRACT ${e.contractId} ${words(e.status)}`, e.status === 'FULFILLED' ? 'ok' : 'danger', e.status === 'FULFILLED' ? 'ok' : 'danger');
    case 'DebriefReady':
      return row(`DEBRIEF READY · ${words(e.outcome)}`, 'info', 'done');
    case 'EntityStateChanged':
      return row(`${words(e.to)}`, 'neutral', 'current', e.id);
    case 'Spawned':
      return row(`${e.callSign} ON SITE`, 'info', 'pending', e.id);
    case 'Despawned':
      return row(`${e.callSign} LEFT`, 'neutral', 'offline', e.id);
    case 'Milestone':
      return row(words(e.name), 'info', 'done');
    case 'CommandRejected':
      return row(`${words(e.cmd)} REJECTED · ${reasonLabel(e.reason)}`, 'warn', 'warn');
    case 'DeliveryOrdered': {
      const fee = credits(e.feeCr);
      return row(
        `ORDER ${e.orderId} · ${e.fluid} ${e.rush ? 'RUSH' : 'STANDARD'} · FEE ${fee.text} ${fee.unit}`,
        'info',
        'pending',
        e.tankerId,
      );
    }
    case 'DeliveryCompleted': {
      const m = tonnes(e.deliveredKg);
      return row(`DELIVERED ${m.text} ${m.unit} ${e.fluid}${e.aborted ? ' · CUT SHORT' : ''}`, e.aborted ? 'warn' : 'ok', 'ok', e.tankerId);
    }
    case 'RoadClosureChanged':
      return row(e.closed ? 'ROAD CLOSED · PAD HAZARD AREA' : 'ROAD OPEN', 'info', e.closed ? 'offline' : 'ok');
    case 'ArmsChanged':
      return row(`CATCH ARMS ${e.to}`, 'neutral', 'current', e.id);
    case 'FlightEvent':
      return row(`${words(e.event)} · ${fixed(e.altitudeM / 1000, 1)} KM`, 'active', e.kind === 'ship' ? 'ascent' : 'current', e.id);
    case 'EnginesChanged':
      return e.failed > 0
        ? row(`ENGINE OUT · ${e.lit} LIT · ${e.failed} OUT`, 'danger', 'danger', e.id)
        : row(`${e.lit} ENGINES LIT`, 'neutral', 'current', e.id);
    case 'RecoveryCommitted':
      return row(`${e.mode === 'CATCH' ? 'GO FOR CATCH' : 'DIVERT'} · ${e.by} · P ${fixed(e.p, 2)}`, 'active', 'current', e.boosterId);
    case 'RecoveryOutcome':
      return row(
        words(e.result),
        e.result === 'CAUGHT' ? 'ok' : e.result === 'DIVERTED' ? 'warn' : 'danger',
        e.result === 'CAUGHT' ? 'caught' : e.result === 'DIVERTED' ? 'warn' : 'danger',
        e.boosterId,
      );
    case 'DetankCompleted':
      return row('DETANK COMPLETE', 'info', 'done');
    default:
      return null;
  }
}

/** Newest-first event rows; the array keeps identity until a row is added. */
export class EventLog {
  private rows: EventVM[] = [];
  private nextKey = 1;
  /** Bumped when rows change. */
  version = 0;

  clear(): void {
    this.rows = [];
    this.version++;
  }

  add(world: Readonly<World>, batch: readonly SimEvent[], utcAtTick0S: number): void {
    let added: EventVM[] | null = null;
    for (const e of batch) {
      const d = describeEvent(e);
      if (!d) continue;
      const ent = d.entityId ? world.entities.byId[d.entityId] : undefined;
      const callSign =
        e.t === 'Spawned' || e.t === 'Despawned' ? e.callSign : ent ? ent.callSign : d.entityId ? '' : 'LC-1';
      (added ??= []).push({
        id: String(this.nextKey++),
        time: utc(utcAtTick0S + e.tick * DT_S),
        tClock: d.tClockTicks !== undefined ? tClock(d.tClockTicks) : '',
        tick: e.tick,
        code: e.t,
        state: d.severity,
        glyph: d.glyph,
        entityId: d.entityId,
        entityCode: callSign || null,
        message: d.text,
        acked: false,
      });
    }
    if (!added) return;
    added.reverse();
    this.rows = [...added, ...this.rows].slice(0, EVENT_LOG_MAX);
    this.version++;
  }

  list(): EventVM[] {
    return this.rows;
  }
}
