import { useState, type ReactNode } from 'react';
import {
  Badge,
  Button,
  DeadlineBar,
  Dialog,
  Glyph,
  GLYPHS,
  HazardBand,
  LabelTag,
  LinearProgress,
  List,
  MetricTile,
  Panel,
  Popover,
  SegmentedControl,
  SegmentedProgress,
  Sparkline,
  StatusChip,
  Tabs,
  Toast,
  ToastStack,
  Tooltip,
  Value,
  val,
  type SegmentOption,
  type TagState,
} from '../components';
import * as fx from '../fixtures';
import type { GlyphId, ListRowVM, MetricVM, Rate, Severity, TimeScaleVM } from '../types';
import styles from './ComponentGallery.module.css';

// /design components (DESIGN_SYSTEM §9.8): every 6.2 primitive in every state, from fixtures only.

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

function Specimen({
  caption,
  children,
  stretch = false,
  span = false,
}: {
  caption: string;
  children: ReactNode;
  stretch?: boolean;
  span?: boolean;
}) {
  return (
    <div className={[styles.specimen, stretch && styles.stretch, span && styles.span2].filter(Boolean).join(' ')}>
      <span className={styles.caption}>{caption}</span>
      {children}
    </div>
  );
}

const STATE_GLYPH: Record<Severity | 'selected', GlyphId> = {
  neutral: 'idle',
  info: 'pending',
  ok: 'ok',
  active: 'ascent',
  warn: 'warn',
  danger: 'danger',
  disabled: 'offline',
  selected: 'selected',
};
const STATE_WORD: Record<Severity | 'selected', string> = {
  neutral: 'PARKED',
  info: 'QUEUED',
  ok: 'GO',
  active: 'ASCENT',
  warn: 'MARGINAL',
  danger: 'NO-GO',
  disabled: 'OFFLINE',
  selected: 'SELECTED',
};
const STATES: (Severity | 'selected')[] = ['neutral', 'info', 'ok', 'active', 'warn', 'danger', 'disabled', 'selected'];
const TAG_FOR: Record<Severity | 'selected', TagState> = {
  neutral: 'default',
  info: 'default',
  ok: 'default',
  active: 'default',
  warn: 'alert',
  danger: 'alert',
  disabled: 'disabled',
  selected: 'selected',
};

function StatesMatrix() {
  return (
    <div className={styles.matrix} role="table" aria-label="Semantic states">
      <div role="row" className={styles.matrixRow}>
        <span className={styles.matrixHead} role="columnheader">
          STATE
        </span>
        {['CHIP', 'BADGE', 'ROW', 'TILE', 'TAG'].map((h) => (
          <span key={h} className={styles.matrixHead} role="columnheader">
            {h}
          </span>
        ))}
      </div>
      {STATES.map((s) => {
        const sev: Severity = s === 'selected' ? 'active' : s;
        const row: ListRowVM = {
          id: s,
          glyph: STATE_GLYPH[s],
          name: 'B-09',
          sub: STATE_WORD[s],
          keyValue: val('68.5', 0.685, '%'),
          state: sev,
          selected: s === 'selected',
          following: false,
        };
        const tile: MetricVM = { key: s, label: 'PROPELLANT', value: val('68.5', 0.685, '%'), state: sev };
        return (
          <div key={s} role="row" className={styles.matrixRow}>
            <span className={styles.matrixHead} role="rowheader">
              {s.toUpperCase()}
            </span>
            <span role="cell">
              <StatusChip glyph={STATE_GLYPH[s]} label={STATE_WORD[s]} state={s} />
            </span>
            <span role="cell">
              <Badge label="RANGE" value={STATE_WORD[s]} glyph={STATE_GLYPH[s]} state={s} live="off" />
            </span>
            <span role="cell" className={styles.box}>
              <span className={styles.box}>
                <List label={`Row ${s}`} rows={[row]} />
              </span>
            </span>
            <span role="cell" className={styles.box}>
              <MetricTile metric={tile} className={styles.box} />
            </span>
            <span role="cell">
              <LabelTag callSign="B-09" glyph="ascent" state={TAG_FOR[s]} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Glyphs() {
  return (
    <div className={styles.glyphs}>
      {(Object.keys(GLYPHS) as GlyphId[]).map((id) => (
        <div key={id} className={styles.glyphCell}>
          <span className={styles.caption}>
            g-{id} {GLYPHS[id].label ? `· ${GLYPHS[id].label}` : ''}
          </span>
          <div className={styles.glyphRow}>
            <span>
              <Glyph id={id} />
            </span>
            <span>
              <Glyph id={id} large />
            </span>
            <span className={styles.onPaper2}>
              <Glyph id={id} large />
            </span>
            <span className={styles.onTint}>
              <Glyph id={id} large />
            </span>
            <span className={styles.onAccent}>
              <Glyph id={id} large />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

const RATE_LABEL: Record<Rate, ReactNode> = {
  0: <Glyph id="pause" label="Pause" />,
  1: '1×',
  10: '10×',
  100: '100×',
};

function rateOptions(t: TimeScaleVM): SegmentOption<Rate>[] {
  return ([0, 1, 10, 100] as Rate[]).map((r) => ({
    value: r,
    label: RATE_LABEL[r],
    ariaLabel: r === 0 ? 'Pause' : `${r} times`,
    capReason: r > t.maxAllowed ? t.lockReason : null,
  }));
}

/** Rate control states composed from primitives (the real control is built in 6.3, §6.25). */
function RateSpecimen({ t, interactive = false }: { t: TimeScaleVM; interactive?: boolean }) {
  const [requested, setRequested] = useState<Rate>(t.paused ? 0 : t.requested);
  const effective: Rate = requested === 0 ? 0 : (Math.min(requested, t.maxAllowed) as Rate);
  const value = interactive ? requested : t.paused ? 0 : t.requested;
  return (
    <div className={styles.row}>
      <SegmentedControl
        label="Time rate"
        options={rateOptions(t)}
        value={value}
        effective={interactive ? effective : t.effective}
        {...(interactive ? { onChange: setRequested } : {})}
      />
      <Button glyph="skip" kbd="N" small disabledReason={t.skip.enabled ? null : t.skip.reason} busy={t.skip.active}>
        <span className={styles.sr}>{t.skip.target ? 'Skip to ' : 'Skip to next milestone · '}</span>
        {t.skip.target ?? 'SKIP'}
      </Button>
      <output className={styles.readout} data-state={t.lagging || t.paused ? 'warn' : undefined}>
        {t.lagging ? <Glyph id="warn" /> : null} SIM {t.effectiveRate}
      </output>
      {t.lockReason ? (
        <span className={styles.reason}>
          <Glyph id="offline" />
          {t.lockReason}
        </span>
      ) : null}
    </div>
  );
}

function InteractiveTabs() {
  const [tab, setTab] = useState('vehicles');
  return (
    <Tabs
      label="Panels"
      active={tab}
      onChange={setTab}
      tabs={[
        { id: 'vehicles', label: 'VEHICLES' },
        { id: 'tanks', label: 'TANKS', badge: { count: 1, state: 'warn' } },
        { id: 'tasks', label: 'TASKS' },
        { id: 'range', label: 'RANGE', badge: { count: 1, state: 'danger' } },
        { id: 'events', label: 'EVENTS', badge: { count: 2, state: 'danger' } },
      ]}
    >
      {tab === 'vehicles' ? (
        <List label="Vehicles" rows={fx.vehicles.slice(0, 3)} />
      ) : (
        <p className={styles.tabBody}>{tab.toUpperCase()} PANEL (6.4)</p>
      )}
    </Tabs>
  );
}

function ModalDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="danger" glyph="danger" onClick={() => setOpen(true)}>
        SCRUB…
      </Button>
      <Dialog
        title="SCRUB LC-1 FLIGHT 7?"
        danger
        open={open}
        onCancel={() => setOpen(false)}
        consequences={fx.decisionPoll.options[3]?.consequences ?? []}
        actions={
          <>
            <Button onClick={() => setOpen(false)}>CANCEL</Button>
            <Button variant="danger" glyph="danger" onClick={() => setOpen(false)}>
              SCRUB
            </Button>
          </>
        }
      >
        <p>DETANK AND STAND DOWN. NEXT ATTEMPT +24 H.</p>
      </Dialog>
    </>
  );
}

export function ComponentGallery() {
  const [popOpen, setPopOpen] = useState(false);
  const p = fx.metrics.prop;
  const sections: [string, string][] = [
    ['states', 'STATES'],
    ['glyphs', 'GLYPHS'],
    ['value', 'VALUE'],
    ['panel', 'PANEL'],
    ['metric', 'METRIC TILE'],
    ['progress', 'PROGRESS'],
    ['chip', 'STATUS CHIP'],
    ['badge', 'BADGE'],
    ['list', 'LIST ROW'],
    ['tabs', 'TABS'],
    ['button', 'BUTTON'],
    ['rate', 'SEGMENTED / RATE'],
    ['tag', 'LABEL TAG'],
    ['deadline', 'DEADLINE BAR'],
    ['band', 'HAZARD BAND'],
    ['overlay', 'TOOLTIP / POPOVER'],
    ['toast', 'TOAST'],
    ['dialog', 'DIALOG'],
  ];
  return (
    <>
      <nav aria-label="Components" className={styles.nav}>
        {sections.map(([id, t]) => (
          <a key={id} href={`#${id}`}>
            {t}
          </a>
        ))}
      </nav>

      <Section id="states" title="SEMANTIC STATES" refs="§2.3 · glyph + word + mass, one hue">
        <StatesMatrix />
      </Section>

      <Section id="glyphs" title="GLYPH SET" refs="§7 · 12 / 16 px on paper, paper-2, tint, accent">
        <Glyphs />
      </Section>

      <Section id="value" title="VALUE CELL" refs="§6.36 · <data> + unit, fixed slot">
        <div className={styles.specimens}>
          <Specimen caption="DEFAULT">
            <Value v={val('47', 13.06, 'KM/H', { width: 5 })} />
          </Specimen>
          <Specimen caption="NEGATIVE (TRUE MINUS)">
            <Value v={val('−40.0', -40e6, 'M CR', { width: 6 })} />
          </Specimen>
          <Specimen caption="MISSING">
            <Value v={val('', null, 'KM')} />
          </Specimen>
          <Specimen caption="STALE">
            <Value v={val('8.3', 8300, 'KM', { stale: true })} />
          </Specimen>
        </div>
      </Section>

      <Section id="panel" title="PANEL / CARD FRAME" refs="§4 · [ TITLE ] header, 1 px grid-gap body">
        <div className={styles.specimens}>
          {(['neutral', 'warn', 'danger', 'disabled'] as const).map((s) => (
            <Specimen key={s} caption={s.toUpperCase()} stretch>
              <Panel title="LC-1 FLIGHT 7" state={s} level={3} meta={<span>REV 07</span>}>
                <div className={styles.panelBody}>B-09 + S-21</div>
                <div className={styles.panelBody}>NRL-3 · WINDOW 90 MIN</div>
              </Panel>
            </Specimen>
          ))}
        </div>
      </Section>

      <Section id="metric" title="METRIC TILE + SPARKLINE" refs="§6.8">
        <div className={styles.specimens}>
          <Specimen caption="OK · SPARK + THRESHOLD" stretch>
            <MetricTile metric={p} />
          </Specimen>
          <Specimen caption="WARN" stretch>
            <MetricTile metric={fx.metrics.propWarn} />
          </Specimen>
          <Specimen caption="DANGER" stretch>
            <MetricTile metric={fx.metrics.engines} />
          </Specimen>
          <Specimen caption="STALE" stretch>
            <MetricTile metric={fx.metrics.stale} />
          </Specimen>
          <Specimen caption="EMPTY (MISSING)" stretch>
            <MetricTile metric={fx.metrics.missing} />
          </Specimen>
          <Specimen caption="DISABLED" stretch>
            <MetricTile metric={fx.metrics.disabled} />
          </Specimen>
          <Specimen caption="FLIGHT CARD 2×2 (COMPOSED)" stretch span>
            <div className={styles.tileGrid}>
              <MetricTile metric={fx.flightCard.nextLaunch}>
                <span className={styles.caption}>{fx.flightCard.vehicles}</span>
              </MetricTile>
              <MetricTile metric={fx.flightCard.propellant} />
              <MetricTile metric={fx.flightCard.stations}>
                <SegmentedProgress seg={fx.flightCard.stations.segments} showText={false} />
              </MetricTile>
              <MetricTile metric={fx.flightCard.range} />
            </div>
          </Specimen>
          <Specimen caption="SPARKLINE · GAPS / EMPTY">
            <Sparkline series={[1, 2, 3, null, null, 4, 3, 5, 6, null, 7, 8]} label="With gaps" />
            <Sparkline series={[]} label="Empty" />
          </Specimen>
        </div>
      </Section>

      <Section id="progress" title="SEGMENTED + LINEAR PROGRESS" refs="§6.9 · §6.10">
        <div className={styles.specimens}>
          <Specimen caption="SEGMENTED · 3 OF 5">
            <SegmentedProgress seg={{ value: 3, max: 5, label: 'Stages ready' }} />
          </Specimen>
          <Specimen caption="SEGMENTED · IN WORK">
            <SegmentedProgress seg={{ value: 2, max: 5, current: 2, label: 'Stack' }} />
          </Specimen>
          <Specimen caption="SEGMENTED · EMPTY / FULL">
            <SegmentedProgress seg={{ value: 0, max: 5, label: 'None' }} />
            <SegmentedProgress seg={{ value: 5, max: 5, label: 'All' }} />
          </Specimen>
          <Specimen caption="SEGMENTED · ENGINES 32 OF 33">
            <SegmentedProgress seg={{ value: 32, max: 33, label: 'Engines lit' }} />
          </Specimen>
          <Specimen caption="LINEAR · INK" stretch>
            <LinearProgress
              p={fx.inspector.progress ?? { label: '', value: val('', null), fraction: 0, tone: 'ink' }}
            />
          </Specimen>
          <Specimen caption="LINEAR · HAZARD" stretch>
            <LinearProgress
              p={{ label: 'ABORT WINDOW', value: val('70.0', 0.7, '%'), fraction: 0.7, tone: 'hazard' }}
            />
          </Specimen>
          <Specimen caption="LINEAR · STALE" stretch>
            <LinearProgress
              p={{ label: 'LOAD', value: val('41.0', 0.41, '%', { stale: true }), fraction: 0.41, tone: 'ink' }}
            />
          </Specimen>
          <Specimen caption="LINEAR · 0 / 100" stretch>
            <LinearProgress p={{ label: 'TASK', value: val('0.0', 0, '%'), fraction: 0, tone: 'ink' }} />
            <LinearProgress p={{ label: 'TASK', value: val('100.0', 1, '%'), fraction: 1, tone: 'ink' }} />
          </Specimen>
        </div>
      </Section>

      <Section id="chip" title="STATUS CHIP" refs="§6.12">
        <div className={styles.specimens}>
          <Specimen caption="NOMINAL STATES">
            <StatusChip glyph="ascent" label="ASCENT" meta="FOLLOWING" state="active" />
            <StatusChip glyph="descent" label="LANDING BURN" state="ok" />
            <StatusChip glyph="caught" label="CAUGHT, SAFING" state="ok" />
            <StatusChip glyph="holding" label="ON STATION, HOLDING" state="neutral" />
          </Specimen>
          <Specimen caption="ALERT STATES">
            <StatusChip glyph="warn" label="LOW PROP" state="warn" />
            <StatusChip glyph="danger" label="ENGINE OUT" state="danger" />
            <StatusChip glyph="offline" label="LOST" state="disabled" />
          </Specimen>
          <Specimen caption="FULL WIDTH (INSPECTOR)" stretch>
            <StatusChip glyph="ascent" label="ASCENT" meta="FOLLOWING" state="active" full live />
          </Specimen>
        </div>
      </Section>

      <Section id="badge" title="BADGE · RANGE / ALERTS" refs="§6.4 · §6.5">
        <div className={styles.specimens}>
          <Specimen caption="RANGE">
            <Badge label="RANGE" value="GO" glyph="ok" state="ok" tooltip="ALL STATIONS GO" />
            <Badge label="RANGE" value="MARGINAL" glyph="warn" state="warn" tooltip="PRP LOX RESERVE 0.6 HOLD-H" />
            <Badge label="RANGE" value="NO-GO" glyph="danger" state="danger" tooltip="UNK-01 IN AREA BRAVO" />
            <Badge label="RANGE" value="—" glyph="offline" state="disabled" />
          </Specimen>
          <Specimen caption="ALERTS">
            <Badge label="ALERTS" value="0" glyph="pending" state="neutral" />
            <Badge label="ALERT" value="1" glyph="warn" state="warn" />
            <Badge label="ALERTS" value="3" note="·2 NEW" glyph="danger" state="danger" live="assertive" />
          </Specimen>
          <Specimen caption="HOVER / FOCUS">
            <Badge label="RANGE" value="GO" glyph="ok" state="ok" demo="hover" />
            <Badge label="RANGE" value="GO" glyph="ok" state="ok" demo="focus" />
          </Specimen>
        </div>
      </Section>

      <Section id="list" title="LIST ROW" refs="§6.13 · listbox, ↑↓ Enter F">
        <div className={styles.specimens}>
          <Specimen caption="SELECTED · NEUTRAL · WARN · DANGER · DISABLED · HOVER · FOCUS" stretch>
            <List label="Vehicles" rows={fx.vehicles} demo={{ 'LX-02': 'hover', 'RV-1': 'focus' }} />
          </Specimen>
          <Specimen caption="TANK ROWS (VALUE + WARN)" stretch>
            <List label="Tanks" rows={fx.tanks} />
          </Specimen>
          <Specimen caption="EMPTY" stretch>
            <List label="Tasks" rows={[]} emptyText="NO OPEN TASKS" />
          </Specimen>
        </div>
      </Section>

      <Section id="tabs" title="TABS" refs="§6.34 · ←/→ Home End">
        <div className={styles.specimens}>
          <Specimen caption="INTERACTIVE · BADGES · 400 PX HUD COLUMN" span>
            <div className={styles.hudColumn}>
              <InteractiveTabs />
            </div>
          </Specimen>
          <Specimen caption="HOVER · FOCUS · DISABLED" stretch>
            <Tabs
              label="Demo tabs"
              active="a"
              demo={{ id: 'b', state: 'hover' }}
              tabs={[
                { id: 'a', label: 'ACTIVE' },
                { id: 'b', label: 'HOVER' },
                { id: 'c', label: 'OFF', disabledReason: 'POST-MVP' },
              ]}
            >
              <p className={styles.tabBody}>PANEL</p>
            </Tabs>
            <Tabs
              label="Focus tabs"
              active="a"
              demo={{ id: 'b', state: 'focus' }}
              tabs={[
                { id: 'a', label: 'ACTIVE' },
                { id: 'b', label: 'FOCUS' },
              ]}
            >
              <p className={styles.tabBody}>PANEL</p>
            </Tabs>
          </Specimen>
        </div>
      </Section>

      <Section id="button" title="BUTTON" refs="§6.33 · primary / secondary / danger">
        <div className={styles.specimens}>
          {(['primary', 'secondary', 'danger'] as const).map((v) => (
            <Specimen key={v} caption={v.toUpperCase()}>
              <div className={styles.row}>
                <Button variant={v} kbd="H">
                  DEFAULT
                </Button>
                <Button variant={v} demo="hover">
                  HOVER
                </Button>
              </div>
              <div className={styles.row}>
                <Button variant={v} demo="focus">
                  FOCUS
                </Button>
                <Button variant={v} demo="pressed">
                  PRESSED
                </Button>
              </div>
              <div className={styles.row}>
                <Button variant={v} disabledReason="RANGE NO-GO">
                  DISABLED
                </Button>
                <Button variant={v} busy>
                  SENT
                </Button>
              </div>
            </Specimen>
          ))}
          <Specimen caption="SMALL · WITH GLYPH">
            <div className={styles.row}>
              <Button small glyph="plus" ariaLabel="LX · one more truck">
                LX
              </Button>
              <Button small glyph="minus" ariaLabel="LX · one less truck">
                LX
              </Button>
              <Button small glyph="ok" variant="primary" kbd="⏎">
                GO
              </Button>
            </div>
          </Specimen>
        </div>
      </Section>

      <Section id="rate" title="SEGMENTED CONTROL · RATE STATES" refs="§6.25 · §6.33">
        <div className={[styles.specimens, styles.wide].join(' ')}>
          <Specimen caption="INTERACTIVE (CAP 10×)">
            <RateSpecimen t={fx.timeScales.capped} interactive />
          </Specimen>
          <Specimen caption="RUNNING 10×">
            <RateSpecimen t={fx.timeScales.running} />
          </Specimen>
          <Specimen caption="PAUSED">
            <RateSpecimen t={fx.timeScales.paused} />
          </Specimen>
          <Specimen caption="LOCKED 1× · TERMINAL COUNT">
            <RateSpecimen t={fx.timeScales.locked} />
          </Specimen>
          <Specimen caption="CAPPED · 100× REQUESTED, 10× RUNNING">
            <RateSpecimen t={fx.timeScales.capped} />
          </Specimen>
          <Specimen caption="LAGGING">
            <RateSpecimen t={fx.timeScales.lagging} />
          </Specimen>
          <Specimen caption="SKIPPING">
            <RateSpecimen t={{ ...fx.timeScales.running, skip: { ...fx.timeScales.running.skip, active: true } }} />
          </Specimen>
        </div>
      </Section>

      <Section id="tag" title="LABEL TAG" refs="§6.20 · §6.35">
        <div className={styles.specimens}>
          <Specimen caption="DEFAULT · HOVER · FOCUS">
            <div className={styles.row}>
              <LabelTag callSign="TOWER-1" glyph="current" onSelect={() => undefined} />
              <LabelTag callSign="PK-03" glyph="patrol" demo="hover" onSelect={() => undefined} />
              <LabelTag callSign="RV-1" glyph="holding" demo="focus" onSelect={() => undefined} />
            </div>
          </Specimen>
          <Specimen caption="SELECTED · ALERT · SEL+ALERT · DISABLED">
            <div className={styles.row}>
              <LabelTag callSign="B-09" glyph="ascent" state="selected" onSelect={() => undefined} />
              <LabelTag callSign="WX-1" glyph="current" state="alert" onSelect={() => undefined} />
              <LabelTag callSign="B-09" glyph="ascent" state="selected-alert" onSelect={() => undefined} />
              <LabelTag callSign="LC-2" glyph="build" state="disabled" />
            </div>
          </Specimen>
        </div>
      </Section>

      <Section id="deadline" title="DEADLINE BAR" refs="§6.30">
        <div className={[styles.specimens, styles.wide].join(' ')}>
          {Object.entries(fx.deadlines).map(([k, d]) => (
            <Specimen key={k} caption={k.toUpperCase()} stretch>
              <DeadlineBar d={d} />
            </Specimen>
          ))}
        </div>
      </Section>

      <Section id="band" title="HAZARD BAND" refs="§6.31">
        <div className={styles.specimens}>
          <Specimen caption="VERTICAL · WIDE">
            <div className={styles.row}>
              <span className={styles.bandV}>
                <HazardBand />
              </span>
              <span className={styles.bandV}>
                <HazardBand wide />
              </span>
            </div>
          </Specimen>
          <Specimen caption="HORIZONTAL · WIDE" stretch>
            <HazardBand orientation="horizontal" />
            <HazardBand orientation="horizontal" wide />
          </Specimen>
        </div>
      </Section>

      <Section id="overlay" title="TOOLTIP / POPOVER" refs="§6.32">
        <div className={styles.specimens}>
          <Specimen caption="TOOLTIP (FORCED OPEN)">
            <div className={styles.tooltipSpace}>
              <Tooltip text="GO IS DISABLED: RANGE NO-GO (UNK-01 IN AREA BRAVO)" open>
                {(d) => (
                  <span aria-describedby={d}>
                    <Badge label="RANGE" value="NO-GO" glyph="danger" state="danger" live="off" />
                  </span>
                )}
              </Tooltip>
            </div>
          </Specimen>
          <Specimen caption="TOOLTIP (HOVER / FOCUS)">
            <Tooltip text="SKIP TO T−01:20:00 LOAD POLL">
              {(d) => (
                <span aria-describedby={d}>
                  <Button glyph="skip" kbd="N">
                    SKIP
                  </Button>
                </span>
              )}
            </Tooltip>
          </Specimen>
          <Specimen caption="POPOVER (INLINE OPEN)" stretch>
            <Popover
              label="Sites"
              open
              inline
              trigger={(t) => (
                <Button glyph="caret" {...t}>
                  LC-1
                </Button>
              )}
            >
              <Panel title="SITES" level={3}>
                <List
                  label="Sites"
                  rows={fx.sites.map((s) => ({
                    id: s.id,
                    glyph: s.state === 'disabled' ? 'build' : 'ok',
                    name: s.code,
                    sub: s.kind,
                    keyValue: val(s.status, null),
                    state: s.state,
                    selected: s.current,
                    following: false,
                  }))}
                />
              </Panel>
            </Popover>
          </Specimen>
          <Specimen caption="POPOVER (INTERACTIVE, ESC CLOSES)">
            <Popover
              label="User"
              open={popOpen}
              onOpenChange={setPopOpen}
              trigger={(t) => (
                <Button glyph="caret" {...t}>
                  LAUNCH DIRECTOR
                </Button>
              )}
            >
              <Panel title="LAUNCH DIRECTOR" level={3}>
                <p className={styles.panelBody}>SHIFT 06:10 H LEFT</p>
                <p className={styles.panelBody}>SHORTCUTS ?</p>
              </Panel>
            </Popover>
          </Specimen>
        </div>
      </Section>

      <Section id="toast" title="TOAST" refs="§6.23 · max 3, danger sticky">
        <div className={[styles.specimens, styles.wide].join(' ')}>
          <Specimen caption="STACK · DANGER / WARN / OK + OVERFLOW">
            <ToastStack overflow={2}>
              <Toast
                event={fx.event.danger}
                actions={
                  <>
                    <Button small>FOLLOW</Button>
                    <Button small variant="primary" kbd="⇧A">
                      ACK
                    </Button>
                  </>
                }
              />
              <Toast event={fx.event.warn} onDismiss={() => undefined} />
              <Toast event={fx.event.ok} onDismiss={() => undefined} />
            </ToastStack>
          </Specimen>
          <Specimen caption="INFO">
            <ToastStack>
              <Toast event={fx.event.info} onDismiss={() => undefined} />
            </ToastStack>
          </Specimen>
        </div>
      </Section>

      <Section id="dialog" title="DIALOG" refs="§6.27 · native <dialog>, CANCEL default">
        <div className={[styles.specimens, styles.wide].join(' ')}>
          <Specimen caption="DANGER (INLINE)">
            <Dialog
              title="DIVERT B-09?"
              danger
              open
              inline
              consequences={fx.decisionCatch.options[1]?.consequences ?? []}
              actions={
                <>
                  <Button>CANCEL</Button>
                  <Button variant="danger" glyph="danger">
                    DIVERT
                  </Button>
                </>
              }
            >
              <p>B-09 FLIES TO THE OFFSHORE POINT AND IS EXPENDED. P(CATCH) 0.62 LEAN.</p>
            </Dialog>
          </Specimen>
          <Specimen caption="NEUTRAL (INLINE)">
            <Dialog
              title="RECYCLE TO T−00:10:00?"
              open
              inline
              consequences={fx.decisionPoll.options[2]?.consequences ?? []}
              actions={
                <>
                  <Button>CANCEL</Button>
                  <Button variant="primary">RECYCLE</Button>
                </>
              }
            />
          </Specimen>
          <Specimen caption="MODAL">
            <ModalDemo />
          </Specimen>
        </div>
      </Section>
    </>
  );
}
