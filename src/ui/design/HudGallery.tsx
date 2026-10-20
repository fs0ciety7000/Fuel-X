import { useState, type ReactNode } from 'react';
import { projectionStore } from '@bridge/index';
import * as fx from '../fixtures';
import { HudRoot } from '../hud/HudRoot';
import { CountdownTimelineView, type TimelineHeadVM } from '../hud/timeline/CountdownTimeline';
import { RateControlView } from '../hud/topbar/RateControl';
import { SiteSwitcher } from '../hud/topbar/SiteSwitcher';
import { TopBarView } from '../hud/topbar/TopBar';
import { DecisionStripView, PollPanelView } from '../hud/decision';
import { PhaseStampView } from '../hud/stamp';
import type {
  ActionVM,
  AlertsVM,
  CountdownVM,
  DecisionOptionVM,
  LeakDecisionVM,
  PropMarginDecisionVM,
  RangeVM,
  SiteVM,
  StationVM,
  TimeScaleVM,
} from '../types';
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
const polls: NonNullable<CountdownVM['polls']> = [
  { id: 'load', at: 'T−01:20:00', position: 0.42, label: 'LOAD POLL', state: 'passed' },
  { id: 'terminal', at: 'T−00:10:00', position: 0.54, label: 'TERMINAL POLL', state: 'open' },
  { id: 'final', at: 'T−00:00:40', position: 0.548, label: 'FINAL POLL', state: 'pending' },
];
const counting: CountdownVM = {
  ...fx.countdown,
  holding: false,
  actions: [holdAction],
  playhead: 0.6,
  polls,
};
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
const v = (text: string, value: number | null, unit?: string) => ({ text, value, ...(unit ? { unit } : {}) });
const o = (x: Partial<DecisionOptionVM> & Pick<DecisionOptionVM, 'id' | 'label'>): DecisionOptionVM => ({
  key: '',
  variant: 'secondary',
  enabled: true,
  consequences: [],
  auto: false,
  confirm: false,
  ...x,
});
const d1: PropMarginDecisionVM = {
  ...fx.decisionProp,
  title: 'D1 PROPELLANT MARGIN · LOX 0.60 H RESERVE',
  question: 'ORDER EXTRA DELIVERIES BEFORE THE ROAD CLOSES?',
  autoNote: 'NO ANSWER: NOTHING ORDERED',
  deadline: { ...fx.decisionProp.deadline, label: 'ROAD CLOSURE' },
  queued: 0,
  reserves: [
    { key: 'lox', label: 'LOX RESERVE', value: v('0.60', 2160, 'H'), state: 'warn' },
    { key: 'ch4', label: 'CH4 RESERVE', value: v('0.90', 3240, 'H'), state: 'neutral' },
  ],
  options: [
    o({
      id: 'ORDER_LOX_STANDARD',
      label: 'LX STANDARD',
      variant: 'primary',
      consequences: [
        { label: 'COST', value: v('−0.41', -0.41e6, 'M CR'), state: 'neutral' },
        { label: 'HOLD-MIN BOUGHT', value: v('38', 2280, 'MIN'), state: 'ok' },
        { label: 'AT GATE', value: v('T−01:52:00', -6720), state: 'neutral' },
      ],
    }),
    o({
      id: 'ORDER_LOX_RUSH',
      label: 'LX RUSH',
      consequences: [
        { label: 'COST', value: v('−0.52', -0.52e6, 'M CR'), state: 'neutral' },
        { label: 'HOLD-MIN BOUGHT', value: v('38', 2280, 'MIN'), state: 'ok' },
        { label: 'AT GATE', value: v('T−02:41:00', -9660), state: 'neutral' },
      ],
    }),
    o({
      id: 'ORDER_CH4_STANDARD',
      label: 'MX STANDARD',
      enabled: false,
      reason: 'ARRIVES AFTER ROAD CLOSURE',
      consequences: [{ label: 'AT GATE', value: v('T−00:31:00', -1860), state: 'warn' }],
    }),
    o({
      id: 'NO_ORDER',
      label: 'NO ORDER',
      key: 'Esc',
      auto: true,
      consequences: [{ label: 'LOX RESERVE STAYS', value: v('0.60', 2160, 'HOLD-H'), state: 'warn' }],
    }),
  ],
};
const d3b: LeakDecisionVM = {
  ...fx.decisionLeak,
  autoNote: 'AUTO AT DEADLINE: CONTINUE DEGRADED',
  pending: null,
  options: [
    o({
      id: 'DEGRADED',
      label: 'CONTINUE DEGRADED',
      key: 'C',
      variant: 'primary',
      auto: true,
      consequences: [
        { label: 'LOAD COMPLETE', value: v('T−00:02:10', -130), state: 'danger' },
        { label: 'AUTO-HOLD AT', value: v('T−00:03:00', -180), state: 'warn' },
      ],
    }),
    o({
      id: 'FIX',
      label: 'HOLD 20 MIN TO FIX',
      key: 'H',
      consequences: [
        { label: 'LOAD COMPLETE', value: v('T−00:12:40', -760), state: 'ok' },
        { label: 'WINDOW AFTER FIX', value: v('00:41:00', 2460), state: 'warn' },
      ],
    }),
  ],
};
const d2 = {
  ...fx.decisionPoll,
  queuedKinds: ['PROP_MARGIN' as const],
  result: '1 MARGINAL · 1 NO-GO · 3 OF 5 GO',
  blocker: 'RANGE NO-GO · UNK-01 IN AREA BRAVO',
  evidence: [
    { label: 'WINDOW LEFT', value: v('00:41:00', 2460), state: 'warn' as const },
    { label: 'EARLIEST LIFTOFF', value: v('14:31:00', 52260, 'UTC'), state: 'neutral' as const },
    { label: 'LOX RESERVE', value: v('36', 2160, 'HOLD-MIN'), state: 'warn' as const },
    { label: 'COST / 10 MIN HELD', value: v('−0.08', -0.08e6, 'M CR'), state: 'neutral' as const },
  ],
};
const allGo: StationVM[] = fx.stations.map((st) => ({ ...st, status: 'GO', state: 'ok', glyph: 'ok' }));
const polling: StationVM[] = fx.stations.map((st, i) =>
  i < 2 ? st : { ...st, status: 'PENDING', state: 'neutral', glyph: 'pending' },
);

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
          <Specimen caption="RUN ENDED · DEBRIEF COLLAPSED (VIEW SITE) · DEBRIEF READY B">
            <div className={styles.bar}>
              <TopBarView
                utc="14:31:12"
                timeScale={ended}
                range={rangeGo}
                alerts={alertsNone}
                sites={sites}
                onDebrief={() => undefined}
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

      <Section id="hud-strip" title="DECISION STRIP" refs="§6.28 · D3 > D3B > D2 > D1 · AC 19 · 30 · 31">
        <div className={styles.stack}>
          <Specimen caption="D3 RECOVERY · LEAN · DROP TO 1× · EV ON BOTH OPTIONS">
            <div className={styles.wide}>
              <DecisionStripView d={fx.decisionCatch} dropLabel="1× · DECISION OPEN" />
            </div>
          </Specimen>
          <Specimen caption="D3 · SENT (AWAITING PROJECTION)">
            <div className={styles.wide}>
              <DecisionStripView d={fx.decisionCatch} pending="catch" />
            </div>
          </Specimen>
          <Specimen caption="D3B GSE LEAK · AUTO CONTINUE DEGRADED">
            <div className={styles.wide}>
              <DecisionStripView d={d3b} />
            </div>
          </Specimen>
          <Specimen caption="D2 GO / NO-GO · HOLDING · NO-GO BLOCKS GO · D1 QUEUED">
            <div className={styles.wide}>
              <DecisionStripView d={d2} dropLabel="1× · NO-GO" />
            </div>
          </Specimen>
          <Specimen caption="D1 PROPELLANT MARGIN · ADVISORY · COLLAPSED">
            <div className={styles.wide}>
              <DecisionStripView d={d1} collapsed />
            </div>
          </Specimen>
          <Specimen caption="D1 · EXPANDED (O) · STANDARD MX PAST ITS CUT-OFF">
            <div className={styles.wide}>
              <DecisionStripView d={d1} />
            </div>
          </Specimen>
        </div>
      </Section>

      <Section id="hud-poll" title="GO / NO-GO POLL PANEL" refs="§6.24 · EVIDENCE ONLY · AC 28">
        <div className={styles.row}>
          <Specimen caption="NO-GO · HOLD">
            <div className={styles.col}>
              <PollPanelView
                vm={{
                  stations: fx.stations,
                  pollLabel: 'TERMINAL POLL',
                  tClock: 'T−00:10:00',
                  result: d2.result,
                  open: true,
                }}
              />
            </div>
          </Specimen>
          <Specimen caption="POLLING">
            <div className={styles.col}>
              <PollPanelView
                vm={{ stations: polling, pollLabel: 'LOAD POLL', tClock: 'T−01:20:00', result: '', open: true }}
              />
            </div>
          </Specimen>
          <Specimen caption="ALL GO · COLLAPSED (COUNTING)">
            <div className={styles.col}>
              <PollPanelView vm={{ stations: allGo, pollLabel: '', tClock: 'T−00:31:07', result: '', open: false }} />
            </div>
          </Specimen>
        </div>
      </Section>

      <Section id="hud-stamp" title="PHASE STAMP" refs="§6.26 · OVERLAY SLOT · 640 MS / STILL 1 S">
        <div className={styles.stack}>
          <Specimen caption="LIFTOFF (STILL, AS UNDER REDUCED MOTION)">
            <PhaseStampView still stamp={{ id: 'Liftoff', label: 'LIFTOFF', header: 'PHASE 05 / 08' }} />
          </Specimen>
          <Specimen caption="TOWER CATCH (STILL)">
            <PhaseStampView still stamp={{ id: 'TowerCatch', label: 'TOWER CATCH', header: 'PHASE 07 / 08' }} />
          </Specimen>
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
