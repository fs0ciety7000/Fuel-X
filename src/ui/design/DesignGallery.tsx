import type { CSSProperties } from 'react';
import { tokens } from '@tokens/tokens';
import { GlyphSprite } from '../components';
import { ComponentGallery } from './ComponentGallery';
import { HudGallery } from './HudGallery';
import { PanelsGallery } from './PanelsGallery';
import styles from './DesignGallery.module.css';

// /design gallery (DESIGN_SYSTEM §9): tokens (Phase 2) + every HUD primitive in every state (6.2).

const kebab = (s: string): string => s.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase();

function Swatches({ group, prefix }: { group: Record<string, string>; prefix: string }) {
  return (
    <div className={styles.grid}>
      {Object.entries(group).map(([name, hex]) => (
        <div key={name} className={styles.cell}>
          <div className={styles.swatch} style={{ background: `var(--fx-${prefix}-${kebab(name)})` }} />
          <span>{name}</span>
          <span className={styles.label}>{hex}</span>
        </div>
      ))}
    </div>
  );
}

export function DesignGallery() {
  return (
    <main className={styles.page}>
      <GlyphSprite />
      <header className={styles.head}>
        <p className={styles.label}>[ FUEL-X / DESIGN SYSTEM / REV 0.2 ]</p>
        <h1 className={styles.title}>TOKENS</h1>
        <p className={styles.label}>SWISS INDUSTRIAL PRINT · ONE ACCENT · RADIUS 0 · NO SHADOW</p>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>[ COLOR ]</h2>
        <Swatches group={tokens.color} prefix="color" />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>[ 3D WORLD ]</h2>
        <Swatches group={tokens.world} prefix="3d" />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>[ PATTERNS ]</h2>
        <div className={styles.grid}>
          {Object.keys(tokens.pattern).map((name) => (
            <div key={name} className={styles.cell}>
              <div className={styles.swatch} style={{ backgroundImage: `var(--fx-pattern-${name})` }} />
              <span>{name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>[ TYPE ]</h2>
        <div className={styles.rows}>
          {Object.entries(tokens.type).map(([name, t]) => {
            const v = `--fx-type-${kebab(name)}`;
            const style: CSSProperties = {
              fontFamily: name.startsWith('macro') ? 'var(--fx-font-macro)' : 'var(--fx-font-micro)',
              fontSize: `var(${v})`,
              lineHeight: `var(${v}-leading)`,
              letterSpacing: `var(${v}-tracking)`,
              fontWeight: `var(${v}-weight)` as CSSProperties['fontWeight'],
            };
            return (
              <div key={name} className={styles.row}>
                <span className={styles.label}>
                  {name} · {t.size} · {t.weight}
                </span>
                <span style={style}>
                  {{ macroClock: 'T-00:00:04', macroCallsign: 'B-09', macroStamp: 'LIFTOFF' }[name] ??
                    'B-09 · 47 KM/H · 100.0 %'}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>[ SPACE ]</h2>
        <div className={styles.rows}>
          {tokens.space.map((value, i) => (
            <div key={value} className={styles.row}>
              <span className={styles.label}>
                space-{i} · {value}
              </span>
              <div className={styles.bar} style={{ width: `var(--fx-space-${i})` }} />
            </div>
          ))}
        </div>
      </section>

      <header className={styles.head}>
        <p className={styles.label}>[ PHASE 6 / HUD PRIMITIVES ]</p>
        <h1 className={styles.title}>COMPONENTS</h1>
        <p className={styles.label}>
          FIXTURES ONLY · NO SIM · EVERY STATE INCL. HOVER / FOCUS / STALE / EMPTY / DISABLED
        </p>
      </header>
      <ComponentGallery />
      <HudGallery />
      <PanelsGallery />
    </main>
  );
}
