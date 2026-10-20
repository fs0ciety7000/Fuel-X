import { useState, type ReactNode } from 'react';
import * as fx from '../fixtures';
import * as px from '../fixtures/panels';
import { Debrief, DebriefReadyBadge } from '../hud/debrief';
import { EventLog, ToastView, type ToastItem } from '../hud/events';
import { FlightCard } from '../hud/flight';
import { Inspector } from '../hud/inspector';
import { TabbedPanel, TAB_ORDER } from '../hud/tabs';
import type { HudTab, InspectorVM } from '../types';
import g from './ComponentGallery.module.css';
import styles from './PanelsGallery.module.css';

// /design composites of 6.4 (flight card, inspector per class, tabbed panel) and 6.7 (events log, toasts, debrief),
// fixtures only (DESIGN_SYSTEM §9.8). The HUD mounts the store-connected containers of the same components.

function Section({ id, title, refs, children }: { id: string; title: string; refs: string; children: ReactNode }) {
  return (
    <section id={id} className={g.section} data-testid={`gallery-${id}`} aria-labelledby={`${id}-h`}>
      <header className={g.sectionHead}>
        <h2 id={`${id}-h`} className={g.sectionTitle}>
          [ {title} ]
        </h2>
        <span className={g.ref}>{refs}</span>
      </header>
      {children}
    </section>
  );
}

function Specimen({ caption, children, className }: { caption: string; children: ReactNode; className?: string }) {
  return (
    <div className={[g.specimen, g.stretch, className].filter(Boolean).join(' ')}>
      <span className={g.caption}>{caption}</span>
      {children}
    </div>
  );
}

const INSPECTORS: [string, InspectorVM][] = [
  ['BOOSTER · FOLLOWING · ENGINE OUT (ALERT)', px.inspectorBooster],
  ['SHIP · SELECTED', px.inspectorShip],
  ['RECOVERY VESSEL · FOLLOWING', px.inspectorVessel],
  ['TRANSPORTER · WIND HOLD (WARN)', px.inspectorTransporter],
  ['TANKER · INBOUND', px.inspectorTanker],
  ['LOST', px.inspectorLost],
];

const noop = (): void => undefined;
const HANDLERS = { REPLAY: noop, NEW_SEED: noop, EXPORT_LOG: noop, VIEW_SITE: noop };

const toast = (key: string, e: (typeof fx.events)[number], source: ToastItem['source']): ToastItem => ({
  key,
  source,
  event: e,
  expiresAt: e.state === 'danger' ? null : 0,
});

const TOASTS: ToastItem[] = [
  toast('alert:e1', fx.event.danger, 'alert'),
  toast('alert:e2', fx.event.warn, 'alert'),
  toast('log:e4', fx.event.info, 'log'),
];

export function PanelsGallery() {
  const [tab, setTab] = useState<HudTab>('vehicles');
  return (
    <>
      <Section id="flight" title="FLIGHT CARD" refs="§6.7 · D1 margin + farm reserve tick · D2 stations / range">
        <div className={styles.flights}>
          <Specimen caption="COUNTING · RESERVE TICK · CONTRACT">
            <div className={styles.flightBox}>
              <FlightCard card={px.flightCardCounting} onOpenTasks={() => setTab('tasks')} />
            </div>
          </Specimen>
          <Specimen caption="ALERT · RESERVE LOW · RANGE NO-GO">
            <div className={styles.flightBox}>
              <FlightCard card={px.flightCardAlert} />
            </div>
          </Specimen>
          <Specimen caption="FLOWN · COMPACT (NO SPARKLINES)">
            <div className={styles.flightBox}>
              <FlightCard card={px.flightCardFlown} compact />
            </div>
          </Specimen>
        </div>
      </Section>

      <Section id="inspector" title="INSPECTOR" refs="§6.11 · metric set per class (projected) · FOLLOW F">
        <div className={styles.inspectors}>
          {INSPECTORS.map(([caption, vm]) => (
            <Specimen key={vm.id} caption={caption}>
              <Inspector vm={vm} />
            </Specimen>
          ))}
        </div>
      </Section>

      <Section id="tabbed" title="TABBED PANEL" refs="§6.14 · ALT 1…5 · badges ▲ danger / △ warn">
        <div className={styles.tabsRow}>
          <Specimen caption="INTERACTIVE">
            <div className={styles.tabsBox}>
              <TabbedPanel lists={px.lists} tab={tab} onTab={setTab} />
            </div>
          </Specimen>
          {TAB_ORDER.filter((t) => t !== 'vehicles').map((t) => (
            <Specimen key={t} caption={t.toUpperCase()}>
              <div className={styles.tabsBox}>
                <TabbedPanel lists={px.lists} tab={t} />
              </div>
            </Specimen>
          ))}
        </div>
      </Section>

      <Section id="events" title="EVENTS LOG + TOASTS" refs="§6.23 · danger sticky + ACK · +N MORE → EVENTS">
        <div className={g.specimens}>
          <Specimen caption="LOG · ALL">
            <EventLog events={px.eventLog} onSelect={() => undefined} />
          </Specimen>
          <Specimen caption="LOG · WARN +">
            <EventLog events={px.eventLog} filter="warn" />
          </Specimen>
          <Specimen caption="TOAST STACK · OVERFLOW">
            <ToastView items={TOASTS} overflow={2} onFollow={() => undefined} onAck={() => undefined} />
          </Specimen>
        </div>
      </Section>

      <Section id="debrief" title="DEBRIEF" refs="§6.29 · AC 22 · REPLAY / NEW SEED / EXPORT LOG / VIEW SITE">
        <div className={styles.debriefs}>
          <Specimen caption="CAUGHT">
            <Debrief d={px.debriefCaught} inline handlers={HANDLERS} />
          </Specimen>
          <Specimen caption="DIVERTED">
            <Debrief d={px.debriefDiverted} inline handlers={HANDLERS} />
          </Specimen>
          <Specimen caption="CATCH FAILED">
            <Debrief d={px.debriefFailed} inline handlers={HANDLERS} />
          </Specimen>
          <Specimen caption="SCRUBBED">
            <Debrief d={px.debriefScrubbed} inline handlers={HANDLERS} />
          </Specimen>
          <Specimen caption="COLLAPSED (VIEW SITE) · B REOPENS">
            <div className={styles.badgeBox}>
              <DebriefReadyBadge onOpen={() => undefined} />
            </div>
          </Specimen>
        </div>
      </Section>
    </>
  );
}
