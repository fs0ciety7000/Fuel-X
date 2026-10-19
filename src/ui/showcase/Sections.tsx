// Below-the-story sections: four calls (tabs), hardware catalogue, Varne Coast sites, how it's built.
import { useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { BUILT, CALLS, PLATES, SITES } from './content';
import type { Family, SiteInfo } from './content';
import { publicUrl } from './env';
import styles from './sections.module.css';

/** Arrow/Home/End roving focus for a horizontal list of buttons (tabs, site selector, filters). */
function useRoving(count: number, select: (i: number) => void) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent, i: number): void => {
    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? (i + 1) % count
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? (i - 1 + count) % count
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? count - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    select(next);
    refs.current[next]?.focus();
  };
  return { refs, onKeyDown };
}

function SectionHead({ index, title, kicker, id }: { index: string; title: string; kicker: string; id: string }) {
  return (
    <header className={styles.head}>
      <p className={styles.index}>{index}</p>
      <h2 id={id} className={styles.title}>
        {title}
      </h2>
      <p className={styles.kicker}>{kicker}</p>
    </header>
  );
}

export function FourCalls() {
  const [active, setActive] = useState(0);
  const base = useId();
  const roving = useRoving(CALLS.length, setActive);
  const call = CALLS[active] ?? CALLS[0];
  return (
    <section className={styles.section} aria-labelledby={`${base}-t`}>
      <SectionHead
        index="02"
        title="Four calls per flight"
        kicker="Every alert is a choice with a cost on both sides."
        id={`${base}-t`}
      />
      <div className={styles.calls}>
        <div role="tablist" aria-label="Decision points" className={styles.tabs} aria-orientation="vertical">
          {CALLS.map((c, i) => (
            <button
              key={c.id}
              ref={(el) => {
                roving.refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${c.id}`}
              aria-selected={i === active}
              aria-controls={`${base}-panel`}
              tabIndex={i === active ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={(e) => roving.onKeyDown(e, i)}
              className={styles.tab}
            >
              <span className={styles.tabIndex}>0{i + 1}</span>
              <span className={styles.tabTitle}>{c.title}</span>
              <span className={styles.tabWhen}>{c.when}</span>
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${call.id}`} className={styles.panel}>
          <p className={styles.panelStamp} key={call.id}>
            {call.title}
          </p>
          <p className={styles.lede}>{call.body}</p>
          <dl className={styles.tradeoff}>
            <div>
              <dt>[ Push ]</dt>
              <dd>{call.lean}</dd>
            </div>
            <div>
              <dt>[ Protect ]</dt>
              <dd>{call.safe}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}

const FAMILIES: readonly ('All' | Family)[] = ['All', 'Vehicles', 'Pad', 'Logistics', 'Fleet'];

export function Hardware() {
  const [family, setFamily] = useState<(typeof FAMILIES)[number]>('All');
  const base = useId();
  const shown = PLATES.filter((p) => family === 'All' || p.family === family);
  return (
    <section className={styles.section} aria-labelledby={`${base}-t`}>
      <SectionHead
        index="03"
        title="Hardware"
        kicker="Every machine on the coast, modelled from a script. Hover or focus a plate for its sheet."
        id={`${base}-t`}
      />
      <div className={styles.filters} role="group" aria-label="Filter hardware">
        {FAMILIES.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={f === family}
            onClick={() => setFamily(f)}
            className={styles.filter}
          >
            {f}
          </button>
        ))}
        <p className={styles.count} aria-live="polite">
          {String(shown.length).padStart(2, '0')} / {String(PLATES.length).padStart(2, '0')}
        </p>
      </div>
      <ul className={styles.plates}>
        {shown.map((p) => (
          <li key={p.asset} className={styles.plate}>
            <figure tabIndex={0} aria-labelledby={`${base}-${p.asset}`} aria-describedby={`${base}-${p.asset}-sheet`}>
              <img
                src={publicUrl(`showcase/plates/${p.asset}.webp`)}
                alt=""
                width={480}
                height={480}
                loading="lazy"
                decoding="async"
              />
              <figcaption id={`${base}-${p.asset}`}>
                <span className={styles.callSign}>{p.callSign}</span>
                <span className={styles.plateName}>{p.name}</span>
              </figcaption>
              <dl className={styles.sheet} id={`${base}-${p.asset}-sheet`}>
                <div>
                  <dt>Class</dt>
                  <dd>{p.name}</dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd>{p.size}</dd>
                </div>
                <div>
                  <dt>Role</dt>
                  <dd>{p.role}</dd>
                </div>
              </dl>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Sites() {
  const [active, setActive] = useState(0);
  const base = useId();
  const roving = useRoving(SITES.length, setActive);
  const site = SITES[active] ?? (SITES[0] as SiteInfo);
  return (
    <section className={styles.section} aria-labelledby={`${base}-t`}>
      <SectionHead
        index="04"
        title="Varne Coast"
        kicker="One region, four sites, one clock. Expansion is the long game."
        id={`${base}-t`}
      />
      <div className={styles.sites}>
        <div role="tablist" aria-label="Sites" className={styles.siteList}>
          {SITES.map((s, i) => (
            <button
              key={s.code}
              ref={(el) => {
                roving.refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-site-${s.code}`}
              aria-selected={i === active}
              aria-controls={`${base}-site-panel`}
              tabIndex={i === active ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={(e) => roving.onKeyDown(e, i)}
              className={styles.site}
              data-state={s.state === 'Under construction' ? 'building' : 'ready'}
            >
              <span className={styles.siteCode}>{s.code}</span>
              <span className={styles.siteName}>{s.name}</span>
              <span className={styles.siteState}>{s.state}</span>
            </button>
          ))}
        </div>
        <div className={styles.map} aria-hidden="true">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={styles.mapSvg}>
            <path
              className={styles.sea}
              d="M82 0 L100 0 L100 100 L60 100 C66 86 74 78 72 66 C70 56 80 50 78 38 C76 26 86 14 82 0 Z"
            />
            <path className={styles.coast} d="M82 0 C86 14 76 26 78 38 C80 50 70 56 72 66 C74 78 66 86 60 100" />
            <path className={styles.road} d="M18 70 L44 40 L70 58 M44 40 L76 22" />
          </svg>
          {SITES.map((s, i) => (
            <span
              key={s.code}
              className={styles.marker}
              data-active={i === active}
              style={{ left: `${s.at[0]}%`, top: `${s.at[1]}%` }}
            >
              {s.code}
            </span>
          ))}
          <span className={styles.compass}>N ↑ · 211° wind</span>
        </div>
        <div
          role="tabpanel"
          id={`${base}-site-panel`}
          aria-labelledby={`${base}-site-${site.code}`}
          className={styles.siteSheet}
        >
          <p className={styles.siteStamp}>{site.name}</p>
          <p className={styles.siteRole}>
            {site.code} · {site.role} · {site.state}
          </p>
          <p className={styles.lede}>{site.body}</p>
        </div>
      </div>
    </section>
  );
}

export function Built() {
  const base = useId();
  return (
    <section className={styles.section} aria-labelledby={`${base}-t`}>
      <SectionHead
        index="05"
        title="How it's built"
        kicker="A game made like a launch site: reproducible, measured, boring in the right places."
        id={`${base}-t`}
      />
      <ol className={styles.built}>
        {BUILT.map(([title, body, code], i) => (
          <li key={title}>
            <p className={styles.tabIndex}>0{i + 1}</p>
            <h3 className={styles.builtTitle}>{title}</h3>
            <p className={styles.lede}>{body}</p>
            <samp className={styles.code}>&gt;&gt;&gt; {code}</samp>
          </li>
        ))}
      </ol>
    </section>
  );
}
