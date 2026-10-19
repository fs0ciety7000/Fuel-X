// Showcase page (docs/SHOWCASE.md §2, direction A "Launch dossier"). Pure DOM: the 3D stage arrives as a node from
// src/app/showcase; story progress arrives as a feed. Rendered at build time (ADR 0009), then hydrated.
import { useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { CHAPTERS, chapterAnchor } from '@data/showcase';
import type { StoryFeed } from '@data/showcase';
import { CREDIT, DOSSIER, FACTS, ORG, PITCH } from './content';
import { publicUrl } from './env';
import { FlightCard, PhaseBar, StageReadout, StoryClock, useChapter } from './Live';
import { Built, FourCalls, Hardware, Sites } from './Sections';
import styles from './page.module.css';

export const PLAY_HREF = publicUrl('play');

interface Props {
  story: StoryFeed;
  /** Ref callback for the dossier sheets container (the scroll driver measures it). */
  onDossier: (el: HTMLElement) => () => void;
  reduced: boolean;
  stage: ReactNode;
}

function OpenThePad({ variant }: { variant: 'bar' | 'hero' | 'band' }) {
  return (
    <a className={styles.cta} data-variant={variant} href={PLAY_HREF}>
      <span>Open the pad</span>
      <span aria-hidden="true">&gt;&gt;&gt;</span>
    </a>
  );
}

function TopBar({ story }: { story: StoryFeed }) {
  return (
    <header className={styles.bar}>
      <a className={styles.wordmark} href="#top" aria-label="Fuel-X, back to top">
        Fuel-X
      </a>
      <p className={styles.crumbs}>
        <span>{ORG.org}</span>
        <span aria-hidden="true">/</span>
        <span>{ORG.region}</span>
        <span aria-hidden="true">/</span>
        <span className={styles.crumbSite}>{ORG.site}</span>
      </p>
      <StoryClock story={story} className={styles.barClock} />
      <OpenThePad variant="bar" />
    </header>
  );
}

function scrollToProgress(el: HTMLElement | null, p: number, reduced: boolean): void {
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: top + p * el.offsetHeight - window.innerHeight / 2, behavior: reduced ? 'auto' : 'smooth' });
}

export function ShowcasePage({ story, onDossier, reduced, stage }: Props) {
  const chapter = useChapter(story);
  const sheets = useRef<HTMLElement | null>(null);
  const dossierRef = useCallback(
    (el: HTMLElement | null) => {
      sheets.current = el;
      return el ? onDossier(el) : undefined;
    },
    [onDossier],
  );
  const jump = (p: number): void => scrollToProgress(sheets.current, p, reduced);
  return (
    <>
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <TopBar story={story} />
      <main id="main" className={styles.page}>
        <div className={styles.story} id="top">
          <section className={styles.hero} aria-labelledby="hero-title">
            <p className={styles.kicker}>[ {PITCH.kicker} ]</p>
            <h1 id="hero-title" className={styles.heroTitle}>
              Fuel-X
            </h1>
            <p className={styles.pitch}>{PITCH.line}</p>
            <p className={styles.never}>{PITCH.never}</p>
            <p className={styles.lede}>{PITCH.body}</p>
            <div className={styles.heroActions}>
              <OpenThePad variant="hero" />
              <a className={styles.secondary} href="#dossier">
                Scroll to count down ↓
              </a>
            </div>
            <FlightCard reduced={reduced} />
            <dl className={styles.facts}>
              {FACTS.map(([value, label]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div className={styles.stage} data-reduced={reduced}>
            <div className={styles.stageSlot}>{stage}</div>
            <div className={styles.stageTop}>
              <StageReadout story={story} />
            </div>
            <div className={styles.stageBottom}>
              <PhaseBar story={story} onJump={jump} />
            </div>
          </div>

          <div id="dossier" className={styles.sheets} ref={dossierRef}>
            <h2 className={styles.visuallyHidden}>Launch dossier: one flight in six sheets</h2>
            {DOSSIER.map((c, i) => (
              <article
                key={c.id}
                className={styles.sheet}
                data-active={i === chapter}
                aria-labelledby={`sheet-${c.id}`}
              >
                <header className={styles.sheetHead}>
                  <p className={styles.sheetStamp} aria-hidden="true">
                    §0{i + 1}
                  </p>
                  <div>
                    <h3 id={`sheet-${c.id}`} className={styles.sheetTitle}>
                      {c.title}
                    </h3>
                    <p className={styles.sheetClock}>
                      <time>{c.clock}</time> · Sheet {i + 1} of {CHAPTERS.length}
                    </p>
                  </div>
                </header>
                <p className={styles.lede}>{c.body}</p>
                <div className={styles.decision}>
                  <p className={styles.decisionLabel}>[ Decision ] {c.decision.question}</p>
                  <ul>
                    {c.decision.options.map(([label, cost], k) => (
                      <li key={label} data-primary={k === 0}>
                        <span className={styles.option}>{label}</span>
                        <span>{cost}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <dl className={styles.sheetData}>
                  {c.data.map(([term, value]) => (
                    <div key={term}>
                      <dt>{term}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <button type="button" className={styles.replay} onClick={() => jump(chapterAnchor(i))}>
                  Frame sheet {i + 1}
                </button>
              </article>
            ))}
          </div>
        </div>

        <FourCalls />
        <Hardware />
        <Sites />
        <Built />

        <section className={styles.band} aria-labelledby="band-title">
          <p className={styles.hazard} aria-hidden="true" />
          <div className={styles.bandBody}>
            <p className={styles.kicker}>[ Pre-alpha · Brackwater LC-1 · Browser, no install ]</p>
            <h2 id="band-title" className={styles.bandTitle}>
              The window is open.
            </h2>
            <p className={styles.lede}>
              The pad runs in your browser today: the scene, the clock and the logistics. The full director’s chair is
              being built in the open.
            </p>
            <OpenThePad variant="band" />
          </div>
          <p className={styles.hazard} aria-hidden="true" />
        </section>
      </main>

      <footer className={styles.colophon}>
        <div className={styles.brands}>
          <img
            src={publicUrl('showcase/brand/interactive.svg')}
            alt="CM Interactive"
            width={123}
            height={100}
            loading="lazy"
          />
          <img
            src={publicUrl('showcase/brand/cardor-emblem.svg')}
            alt="Cardor Media"
            width={123}
            height={100}
            loading="lazy"
          />
        </div>
        <p className={styles.credit}>{CREDIT}</p>
        <nav className={styles.footNav} aria-label="Footer">
          <a href={PLAY_HREF}>Play</a>
          <a href={publicUrl('design.html')}>Design system</a>
          <a href="#top">Top ↑</a>
        </nav>
        <p className={styles.stamp}>Rev 0.5 · Varne Coast · Cadence is the score · © Cardor Media</p>
      </footer>
    </>
  );
}
