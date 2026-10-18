import type { ReactNode } from 'react';
import styles from './VitrinePage.module.css';

const DECISIONS = [
  ['01', 'Propellant margin', 'How much to stock, and when the tankers arrive.'],
  ['02', 'Go / No-Go', 'Commit, hold, recycle, or scrub against a closing window.'],
  ['03', 'Catch or divert', 'Bet the booster on the tower arms, or give the booster up.'],
  ['04', 'Reinvest', 'Where the money goes once the pad is safe.'],
] as const;

const LOOP = [
  ['01', 'Contract', 'Payload, window, price'],
  ['02', 'Prepare', 'Rollout, stack, propellant'],
  ['03', 'Count down', 'Go, hold, recycle, scrub'],
  ['04', 'Fly', 'Ascent, then the catch call'],
  ['05', 'Recover', 'Catch or divert, then safing'],
  ['06', 'Turn around', 'Refurbish, restock, reinvest'],
] as const;

export function VitrinePage({ stage }: { stage: ReactNode }) {
  return (
    <main className={styles.page}>
      <header className={styles.bar}>
        <p>Calder Orbital · Varne Coast · Brackwater LC-1</p>
        <nav className={styles.nav} aria-label="Site">
          <a className={styles.play} href="./play.html">
            Open the pad
          </a>
          <a href="./design.html">Design system</a>
        </nav>
      </header>

      <section className={styles.hero} aria-label="Fuel-X">
        <div className={styles.copy}>
          <p className={styles.kicker}>Launch director</p>
          <h1 className={styles.title}>Fuel-X</h1>
          <p className={styles.lede}>
            A calm, readable strategy game about cadence and risk, set in a live rocket launch site.
          </p>
          <p>
            You are the launch director of a growing coastal spaceport. You never fly the rocket. You decide when,
            whether, and how much risk — then turn the vehicle around faster than last time.
          </p>
        </div>
        <div className={styles.stageFrame}>
          <div className={styles.stageSlot} role="img" aria-label="Tower-1, launch mount OLM-1, and a booster">
            {stage}
          </div>
          <p className={styles.stageCaption}>Tower-1 · Olm-1 · Live model · Methane / LOX</p>
        </div>
      </section>

      <section className={styles.block} aria-labelledby="decisions-title">
        <h2 id="decisions-title" className={styles.blockTitle}>
          Four calls per flight
        </h2>
        <div className={styles.decisions}>
          {DECISIONS.map(([index, title, body]) => (
            <article key={index} className={styles.decision}>
              <p className={styles.index}>{index}</p>
              <h3 className={styles.decisionTitle}>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.block} aria-labelledby="loop-title">
        <h2 id="loop-title" className={styles.blockTitle}>
          One flight
        </h2>
        <ol className={styles.loop}>
          {LOOP.map(([index, title, body]) => (
            <li key={index} className={styles.step}>
              <p className={styles.index}>{index}</p>
              <p className={styles.decisionTitle}>{title}</p>
              <p>{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className={styles.colophon}>
        <img className={styles.logo} src="./brand/interactive.svg" alt="CM Interactive" />
        <img className={styles.logo} src="./brand/cardor-emblem.svg" alt="Cardor Media" />
        <img className={styles.mark} src="./brand/cardor-monogram.svg" alt="" />
        <p className={styles.credit}>
          Developed by CM Interactive. A division of Cardor Media.
          <span className={styles.kicker}> Rev 0.1 · Brackwater LC-1 · Cadence is the score</span>
        </p>
      </footer>
    </main>
  );
}
