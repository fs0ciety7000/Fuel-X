import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { projectionStore, view } from '@bridge/index';
import { Badge, Glyph } from '../../components';
import type { AlertsVM, GlyphId, RangeVM, SiteVM, TimeScaleVM } from '../../types';
import { debriefUi, DebriefReadyBadge, isDebriefOpen, reopenDebrief } from '../debrief';
import { announce } from '../frame/live';
import { readout } from './rate';
import { SiteSwitcher } from './SiteSwitcher';
import styles from './TopBar.module.css';

/** Lore crumbs (GDD §12). Org / region are not in the projection (MVP: one org, one region). */
export const ORG = 'CALDER';
export const REGION = 'VARNE COAST';
export const ROLE = 'LAUNCH DIRECTOR';

const RANGE_WORD: Record<RangeVM['aggregate'], string> = { GO: 'GO', MARGINAL: 'MARGINAL', NO_GO: 'NO-GO', NONE: '—' };
const RANGE_GLYPH: Record<RangeVM['aggregate'], GlyphId> = {
  GO: 'ok',
  MARGINAL: 'warn',
  NO_GO: 'danger',
  NONE: 'offline',
};

/** Badge parts of the range aggregate: `RANGE` + `GO | MARGINAL | NO-GO | —`, disabled without a launch. */
export function rangeBadge(r: RangeVM): { value: string; glyph: GlyphId; state: RangeVM['state'] } {
  const value = r.label ? r.label.replace(/^RANGE\s*/, '') || RANGE_WORD[r.aggregate] : RANGE_WORD[r.aggregate];
  return {
    value,
    glyph: r.glyph ?? RANGE_GLYPH[r.aggregate],
    state: r.aggregate === 'NONE' ? 'disabled' : r.state,
  };
}

/** Alert counter parts: fixed 2-digit count + `ALERT(S) · n NEW` note (from the projector's label). */
export function alertBadge(a: AlertsVM): { value: string; note: string; glyph: GlyphId } {
  const note = a.label
    ? a.label.replace(/^\d+\s*/, '')
    : `${a.open === 1 ? 'ALERT' : 'ALERTS'}${a.fresh > 0 ? ` · ${a.fresh} NEW` : ''}`;
  const glyph: GlyphId = a.state === 'danger' ? 'danger' : a.state === 'warn' ? 'warn' : 'pending';
  return { value: String(a.open), note, glyph };
}

export interface TopBarViewProps {
  utc: string;
  timeScale: TimeScaleVM;
  range: RangeVM;
  alerts: AlertsVM;
  sites: SiteVM[];
  onSite?: (id: string) => void;
  onRange?: () => void;
  onAlerts?: () => void;
  /** Gallery: force the site list open. */
  sitesOpen?: boolean;
  /** Collapsed debrief (§6.29): `DEBRIEF READY B` cell that reopens the sheet. */
  onDebrief?: (() => void) | null;
}

/**
 * §6.1 top bar: mark · breadcrumb + site switcher · sim UTC · SIM rate readout (replaces telemetry latency, GDD §10)
 * · RANGE badge (→ Range tab) · alert counter (→ Events tab) · role label. 40 px, heavy bottom rule, never scrolls.
 */
export function TopBarView({
  utc,
  timeScale,
  range,
  alerts,
  sites,
  onSite,
  onRange,
  onAlerts,
  sitesOpen,
  onDebrief,
}: TopBarViewProps) {
  const rb = rangeBadge(range);
  const ab = alertBadge(alerts);
  // Paused after the run ended is the normal state, not a warning.
  const warn = !timeScale.runEnded && (timeScale.lagging || timeScale.paused);
  return (
    <header className={styles.bar} data-testid="topbar">
      <span className={styles.mark} title="FUEL-X · REV 0.6 · UNIT LC-1" aria-label="Fuel-X">
        FX
      </span>
      <nav aria-label="Site" className={styles.cell}>
        <ol className={styles.crumbs}>
          <li className={styles.crumbStatic}>{ORG}</li>
          <li className={styles.crumbStatic}>{REGION}</li>
          <li>
            <SiteSwitcher
              sites={sites}
              {...(onSite ? { onSelect: onSite } : {})}
              {...(sitesOpen ? { open: true } : {})}
            />
          </li>
        </ol>
      </nav>
      <time className={styles.cell} data-testid="topbar-utc">
        <span className={styles.digits}>{utc || '—'}</span>
        <span className={styles.unit}>UTC</span>
      </time>
      <output className={styles.cell} data-state={warn ? 'warn' : undefined} data-testid="topbar-sim">
        {timeScale.lagging ? <Glyph id="warn" /> : null}
        {readout(timeScale)}
      </output>
      <span className={styles.spacer} />
      {onDebrief ? (
        <div className={styles.cell}>
          <DebriefReadyBadge inline onOpen={onDebrief} />
        </div>
      ) : null}
      <div className={styles.cell}>
        <Badge
          label="RANGE"
          value={rb.value}
          glyph={rb.glyph}
          state={rb.state}
          {...(range.reason ? { tooltip: range.reason } : {})}
          {...(onRange ? { onClick: onRange } : {})}
        />
      </div>
      <div className={styles.cell}>
        <Badge
          label=""
          value={ab.value}
          note={ab.note}
          glyph={ab.glyph}
          state={alerts.state}
          live="off"
          {...(onAlerts ? { onClick: onAlerts } : {})}
        />
      </div>
      <span className={styles.role}>{ROLE}</span>
    </header>
  );
}

/** Live top bar: narrow selectors over the throttled projection (structural sharing keeps re-renders rare). */
export function TopBar() {
  const [utc, timeScale, range, alerts, sites, debrief] = useStore(
    projectionStore,
    useShallow((p) => [p.clock.utc, p.timeScale, p.range, p.alerts, p.sites, p.debrief] as const),
  );
  const debriefCollapsed = useStore(debriefUi, (u) => debrief !== null && !isDebriefOpen(debrief, u));
  // Assertive announcement only when a new danger alert arrives (§6.5).
  const fresh = useRef(alerts.fresh);
  useEffect(() => {
    if (alerts.state === 'danger' && alerts.fresh > fresh.current) {
      const top = alerts.items.find((a) => !a.acked && a.state === 'danger');
      announce(`ALERT: ${top ? `${top.entityCode ?? ''} ${top.message}`.trim() : (alerts.label ?? '')}`, 'assertive');
    }
    fresh.current = alerts.fresh;
  }, [alerts]);
  return (
    <TopBarView
      utc={utc}
      timeScale={timeScale}
      range={range}
      alerts={alerts}
      sites={sites}
      onSite={(id) => view.site(id)}
      onRange={() => view.tab('range')}
      onAlerts={() => view.tab('events')}
      onDebrief={debriefCollapsed ? reopenDebrief : null}
    />
  );
}
