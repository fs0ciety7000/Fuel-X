import { Button, Glyph, HazardBand, List, Value } from '../../components';
import type { ActionVM, ListRowVM, StationVM, TankRowVM, TaskRowVM } from '../../types';
import styles from './TabbedPanel.module.css';

// Row variants of the tabbed panel (§6.13–6.16). Every value is printed from the projection; bars only map a
// projected 0–1 fraction onto their track.

const pct = (f: number): string => `${Math.round(Math.min(1, Math.max(0, f)) * 1000) / 10}%`;

/** §6.15 inline tank bar: ink fill on paper-3, reserve tick (ink-2), % value and boil-off rate. */
export function TankTrail({ row }: { row: TankRowVM }) {
  return (
    <span className={styles.tankTrail}>
      <span className={styles.bar} aria-hidden="true">
        <span className={styles.barFill} style={{ width: pct(row.fill) }} />
        {row.reserve !== null ? <span className={styles.reserveTick} style={{ left: pct(row.reserve) }} /> : null}
      </span>
      <Value v={row.keyValue} />
      <Value v={row.rate} className={styles.rate} />
    </span>
  );
}

export function TankList({ rows, onSelect }: { rows: TankRowVM[]; onSelect?: (id: string) => void }) {
  return (
    <List<TankRowVM>
      label="Tanks"
      rows={rows}
      emptyText="NO TANKS ON SITE"
      trail={(r) => <TankTrail row={r} />}
      {...(onSelect ? { onSelect } : {})}
    />
  );
}

/** §6.16 task rows: progress + ETA + the row's action buttons (Tasks = the D1 order surface, GDD §10). */
export function TaskList({
  rows,
  onAction,
  onSelect,
}: {
  rows: TaskRowVM[];
  onAction?: (a: ActionVM) => void;
  onSelect?: (id: string) => void;
}) {
  if (!rows.length) return <p className={styles.empty}>NO TASKS</p>;
  return (
    <ul className={styles.rows} aria-label="Tasks">
      {rows.map((r) => (
        <li key={r.id} className={styles.task} data-state={r.state}>
          {r.state === 'danger' ? (
            <span className={styles.edge}>
              <HazardBand />
            </span>
          ) : null}
          <Glyph id={r.state === 'danger' ? 'danger' : r.state === 'warn' ? 'warn' : r.glyph} />
          <span className={styles.names}>
            <span className={styles.name}>{r.name}</span>
            {r.assigneeId && onSelect ? (
              <button type="button" className={styles.subLink} onClick={() => onSelect(r.assigneeId as string)}>
                {r.sub}
              </button>
            ) : (
              <span className={styles.sub}>{r.sub}</span>
            )}
          </span>
          <span className={styles.taskMeta}>
            <Value v={r.keyValue} />
            <span className={styles.eta}>
              ETA <Value v={r.eta} />
            </span>
          </span>
          <span className={styles.bar} aria-hidden="true" data-span="row">
            <span className={styles.barFill} style={{ width: pct(r.progress ?? 0) }} />
          </span>
          {r.actions.length ? (
            <span className={styles.taskActions}>
              {r.actions.map((a) => (
                <Button
                  key={a.id}
                  small
                  variant={a.variant}
                  {...(a.key ? { kbd: a.key } : {})}
                  disabledReason={a.enabled ? null : (a.reason ?? 'UNAVAILABLE')}
                  onClick={() => onAction?.(a)}
                >
                  {a.label}
                </Button>
              ))}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

const STATION_WORD: Record<StationVM['status'], string> = {
  GO: 'GO',
  MARGINAL: 'MARGINAL',
  NO_GO: 'NO-GO',
  PENDING: 'POLLING',
};

const stationGlyph = (s: StationVM) =>
  s.glyph ?? (s.state === 'ok' ? 'ok' : s.state === 'warn' ? 'warn' : s.state === 'danger' ? 'danger' : 'pending');

/** Range tab (§6.14, D2 evidence): one row per poll station, then the boats / weather stations behind them. */
export function RangeList({
  stations,
  assets,
  onSelect,
  onFollow,
}: {
  stations: StationVM[];
  assets: ListRowVM[];
  onSelect?: (id: string) => void;
  onFollow?: (id: string) => void;
}) {
  return (
    <div className={styles.stack}>
      <table className={styles.stations}>
        <caption className={styles.caption}>POLL STATIONS</caption>
        <thead>
          <tr>
            <th scope="col">STATION</th>
            <th scope="col">STATUS</th>
            <th scope="col">DRIVER</th>
            <th scope="col" className={styles.num}>
              VALUE
            </th>
          </tr>
        </thead>
        <tbody>
          {stations.map((s) => (
            <tr key={s.id} data-state={s.state}>
              <th scope="row">
                {s.sourceId && onSelect ? (
                  <button type="button" className={styles.subLink} onClick={() => onSelect(s.sourceId as string)}>
                    {s.code}
                  </button>
                ) : (
                  s.code
                )}
              </th>
              <td>
                <span className={styles.status}>
                  <Glyph id={stationGlyph(s)} />
                  {STATION_WORD[s.status]}
                </span>
              </td>
              <td className={styles.driver}>{s.detail ?? s.driver}</td>
              <td className={styles.num}>
                <Value v={s.value} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <List
        label="Range assets"
        rows={assets}
        emptyText="NO RANGE ASSETS"
        {...(onSelect ? { onSelect } : {})}
        {...(onFollow ? { onFollow } : {})}
      />
    </div>
  );
}
