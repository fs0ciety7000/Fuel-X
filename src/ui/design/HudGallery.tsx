import { useState, type ReactNode } from 'react';
import { projectionStore } from '@bridge/index';
import * as fx from '../fixtures';
import { HudRoot } from '../hud/HudRoot';
import { CountdownTimelineView, type TimelineHeadVM } from '../hud/timeline/CountdownTimeline';
import { RateControlView } from '../hud/topbar/RateControl';
import { SiteSwitcher } from '../hud/topbar/SiteSwitcher';
import { TopBarView } from '../hud/topbar/TopBar';
import type { ActionVM, AlertsVM, RangeVM, SiteVM, TimeScaleVM } from '../types';
import styles from './HudGallery.module.css';

// /design HUD section (DESIGN_SYSTEM §9.8–9.9, 6.3+): top bar, site switcher, rate control and countdown band in
// every state from fixtures, then the full frame over the fixture projection at 1920×1080 and 1280×720.

function Section({ id, title, refs, children }: { id: string; title: string; refs: string; children: ReactNode }) {
  return (
    <section id={id} className={styles.section} data-testid={`gallery-${id}`} aria-labelledby={`${id}-h`}>
      <header className={styles.sectionHead}>
        <h2 id={`${id}-h`} className={styles.sectionTitle}>
          [ {title} ]
        </h2>
        <span className={styles.ref}>{refs}</span>
      </header>
      {children}
    </section>
  );
}

function Specimen({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className={styles.specimen}>
      <span className={styles.caption}>{caption}</span>
      {children}
    </div>
  );
}

const ts = fx.timeScales;
const sites: SiteVM[] = [
  {
    id: 'LC-1',
    code: 'LC-1',
    name: 'BRACKWATER',
    kind: 'ORBITAL PAD',
    status: 'ACTIVE',
    state: 'ok',
    glyph: 'ok',
    interactive: true,
    current: true,
    alertCount: 2,
  },
  {
    id: 'LC-2',
    code: 'LC-2',
    name: 'COBBLE REACH',
    kind: 'ORBITAL PAD',
    status: 'UNDER CONSTRUCTION',
    state: 'disabled',
    glyph: 'build',
    interactive: false,
    current: false,
    alertCount: 0,
  },
  {
    id: 'TS-1',
    code: 'TS-1',
    name: 'FLINT HOLLOW',
    kind: 'SUBORBITAL TEST STAND',
    status: 'OPERATIONAL',
    state: 'disabled',
    glyph: 'offline',
    interactive: false,
    current: false,
    alertCount: 0,
  },
  {
    id: 'BY-1',
    code: 'BY-1',
    name: 'KILNMOOR WORKS',
    kind: 'BUILD YARD',
    status: 'OPERATIONAL',
    state: 'disabled',
    glyph: 'offline',
    interactive: false,
    current: false,
    alertCount: 0,
  },
];
const rangeGo: RangeVM = { ...fx.range, aggregate: 'GO', state: 'ok', label: 'RANGE GO', reason: null, goCount: 5 };
const rangeMarginal: RangeVM = {
  ...fx.range,
  aggregate: 'MARGINAL',
  state: 'warn',
  label: 'RANGE MARGINAL',
  reason: 'PROPELLANT · LOX 0.60 H RESERVE',
};
const rangeNone: RangeVM = { ...fx.range, aggregate: 'NONE', state: 'neutral', label: 'RANGE —', reason: null };
const alertsNone: AlertsVM = { open: 0, fresh: 0, state: 'neutral', label: '0 ALERTS', items: [] };
const alertsWarn: AlertsVM = { open: 1, fresh: 1, state: 'warn', label: '1 ALERT · 1 NEW', items: [fx.event.warn] };
const alertsDanger: AlertsVM = { ...fx.alerts, open: 3, fresh: 2, label: '3 ALERTS · 2 NEW' };
const withReadout = (t: TimeScaleVM, readout: string): TimeScaleVM => ({ ...t, readout });
const ended: TimeScaleVM = {
  ...ts.paused,
  runEnded: true,
  maxAllowed: 0,
  lockReason: 'RUN ENDED',
  lockLabel: 'RUN ENDED',
  readout: 'SIM PAUSED',
  skip: { enabled: false, target: null, reason: 'RUN ENDED', active: false },
};

const holdAction: ActionVM = {
  id: 'HOLD',
  label: 'HOLD',
  key: 'H',
  enabled: true,
  variant: 'secondary',
  command: { t: 'Hold', countdownId: 'cd-1' },
};
const counting = { ...fx.countdown, holding: false, actions: [holdAction] };
const heads: [string, TimelineHeadVM][] = [
  [
    'COUNTING · HOLD IS THE ONLY COUNT BUTTON',
    { countdown: counting, tClock: 'T−00:10:00', holding: false, holdLabel: '', paused: false },
  ],
  [
    'HOLDING · NO BUTTONS (GO / RECYCLE / SCRUB IN THE D2 STRIP)',
    {
      countdown: { ...counting, holding: true, state: 'warn' },
      tClock: 'T−00:10:00',
      holding: true,
      holdLabel: 'HOLD · POLL',
      paused: false,
    },
  ],
  ['PAUSED', { countdown: counting, tClock: 'T−01:54:12', holding: false, holdLabel: '', paused: true }],
  [
    'SCRUBBED',
    {
      countdown: { ...counting, scrubbed: true, state: 'danger' },
      tClock: 'T−00:31:07',
      holding: false,
      holdLabel: '',
      paused: false,
    },
  ],
  [
    'T+ AFTER LIFTOFF · NO COUNT BUTTONS',
    { countdown: { ...counting, actions: [] }, tClock: 'T+00:01:45', holding: false, holdLabel: '', paused: false },
  ],
];

/** A viewport-sized HUD (data: the specimen's viewport), scaled down to fit the page. */
function FullFrame({ w, h, scale, outline }: { w: number; h: number; scale: number; outline: boolean }) {
  return (
    <div className={styles.scaled} style={{ width: `${w * scale}px`, height: `${h * scale}px` }}>
      <div
        className={styles.frameBox}
        data-testid={`hud-frame-${w}x${h}`}
        style={{ width: `${w}px`, height: `${h}px`, transform: `scale(${scale})` }}
      >
        <div className={styles.frameBg} aria-hidden="true" />
        <HudRoot contained outline={outline} />
      </div>
    </div>
  );
}

export function HudGallery() {
  // The full-frame specimens render the live (connected) slots: feed them the fixture projection once.
  useState(() => {
    projectionStore.setState(fx.projection, true);
    return true;
  });
  const [outline, setOutline] = useState(true);
  return (
    <div className={styles.gallery}>
      <Section id="hud-topbar" title="TOP BAR" refs="§6.1 · §6.4 · §6.5 · 6.3">
        <div className={styles.stack}>
          <Specimen caption="NOMINAL · RANGE GO · NO ALERTS · SIM 10×">
            <div className={styles.bar}>
              <TopBarView
                utc="13:41:54"
                timeScale={withReadout(ts.running, 'SIM 10×')}
                range={rangeGo}
                alerts={alertsNone}
                sites={sites}
              />
            </div>
          </Specimen>
          <Specimen caption="WARN · RANGE MARGINAL · 1 ALERT · LAGGING">
            <div className={styles.bar}>
              <TopBarView
                utc="14:02:31"
                timeScale={withReadout(ts.lagging, 'SIM 7.4× OF 100×')}
                range={rangeMarginal}
                alerts={alertsWarn}
                sites={sites}
              />
            </div>
          </Specimen>
          <Specimen caption="DANGER · RANGE NO-GO · 3 ALERTS · PAUSED">
            <div className={styles.bar}>
              <TopBarView
                utc="14:22:09"
                timeScale={withReadout(ts.paused, 'SIM PAUSED')}
                range={fx.range}
                alerts={alertsDanger}
                sites={sites}
              />
            </div>
          </Specimen>
          <Specimen caption="NO LAUNCH SCHEDULED · RANGE — (DISABLED)">
            <div className={styles.bar}>
              <TopBarView utc="07:15:00" timeScale={ts.running} range={rangeNone} alerts={alertsNone} sites={sites} />
            </div>
          </Specimen>
        </div>
      </Section>

      <Section id="hud-sites" title="SITE SWITCHER" refs="§6.2 · OTHER SITES DISABLED WITH REASON">
        <div className={styles.row}>
          <Specimen caption="OPEN · CURRENT ACTIVE">
            <SiteSwitcher sites={sites} open />
          </Specimen>
          <Specimen caption="OPEN · KEYBOARD ON A LOCKED SITE">
            <SiteSwitcher sites={sites} open activeIndex={1} />
          </Specimen>
          <Specimen caption="CLOSED">
            <SiteSwitcher sites={sites} />
          </Specimen>
        </div>
      </Section>

      <Section
        id="hud-rate"
        title="RATE CONTROL"
        refs="§6.25 · REQUESTED SELECTED · EFFECTIVE UNDERLINED · CAP HATCHED"
      >
        <div className={styles.stack}>
          <Specimen caption="DEFAULT · 10×">
            <RateControlView ts={withReadout(ts.running, 'SIM 10×')} ended={false} />
          </Specimen>
          <Specimen caption="PAUSED">
            <RateControlView ts={withReadout(ts.paused, 'SIM PAUSED')} ended={false} />
          </Specimen>
          <Specimen caption="LOCKED 1× · TERMINAL COUNT">
            <RateControlView ts={withReadout(ts.locked, 'SIM 1×')} ended={false} />
          </Specimen>
          <Specimen caption="CAPPED · 100× REQUESTED (QUEUED), 10× RUNNING">
            <RateControlView ts={withReadout(ts.capped, 'SIM 10×')} ended={false} />
          </Specimen>
          <Specimen caption="LAGGING">
            <RateControlView ts={withReadout(ts.lagging, 'SIM 7.4× OF 100×')} ended={false} />
          </Specimen>
          <Specimen caption="DROPPED TO 1× · DECISION OPEN (NOT A CAP: 10× STAYS SELECTABLE)">
            <RateControlView
              ts={{
                ...ts.running,
                requested: 1,
                effective: 1,
                maxAllowed: 10,
                lockReason: 'HOLD',
                lockLabel: 'MAX 10× · HOLD',
                readout: 'SIM 1×',
                drop: { code: 'DECISION_OPEN', label: '1× · DECISION OPEN', tick: 0 },
              }}
              ended={false}
            />
          </Specimen>
          <Specimen caption="SKIPPING">
            <RateControlView
              ts={{
                ...ts.running,
                readout: 'SIM SKIP',
                skip: { enabled: true, target: 'T−01:20:00 LOAD POLL', reason: null, active: true },
              }}
              ended={false}
            />
          </Specimen>
          <Specimen caption="RUN ENDED (DEBRIEF)">
            <RateControlView ts={ended} ended />
          </Specimen>
        </div>
      </Section>

      <Section id="hud-countdown" title="COUNTDOWN BAND" refs="§6.17 · §6.18 · AC 28">
        <div className={styles.stack}>
          {heads.map(([caption, head]) => (
            <Specimen key={caption} caption={caption}>
              <div className={styles.band}>
                <CountdownTimelineView head={head} rate={<RateControlView ts={ts.locked} ended={false} compact />} />
              </div>
            </Specimen>
          ))}
        </div>
      </Section>

      <Section id="hud-frame" title="FULL HUD FRAME" refs="§3 · §9.9 · FIXTURE PROJECTION · EMPTY SLOTS OUTLINED">
        <label className={styles.toggle}>
          <input type="checkbox" checked={outline} onChange={(e) => setOutline(e.target.checked)} /> OUTLINE SLOTS
        </label>
        <Specimen caption="1920 × 1080 · STANDARD (SHOWN AT 50 %)">
          <FullFrame w={1920} h={1080} scale={0.5} outline={outline} />
        </Specimen>
        <Specimen caption="1280 × 720 · COMPACT (SHOWN AT 75 %)">
          <FullFrame w={1280} h={720} scale={0.75} outline={outline} />
        </Specimen>
      </Section>
    </div>
  );
}
