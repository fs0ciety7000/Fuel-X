import styles from './App.module.css';

// Composition root. Phase 2: empty shell; the loop, SimHost, scene and HUD are wired in Phases 3–6.
export function App() {
  return (
    <main className={styles.shell}>
      <section className={styles.plate} aria-label="Fuel-X">
        <p className={styles.meta}>[ CALDER ORBITAL / VARNE COAST / BRACKWATER LC-1 ]</p>
        <h1 className={styles.title}>FUEL-X</h1>
        <p className={styles.meta}>
          REV 0.1 · PHASE 2 SCAFFOLD · <span className={styles.accent}>SIM OFFLINE</span> · <a href="./">/SITE</a> ·{' '}
          <a href="./design.html">/DESIGN</a>
        </p>
      </section>
    </main>
  );
}
