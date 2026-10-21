import { useMemo, type ReactNode } from 'react';
import { GlyphSprite } from '../components';
import { HudFrame, HUD_PANELS_ID, type HudSlots } from './frame/HudFrame';
import { useHudKeys } from './frame/keys';
import { LiveRegions } from './frame/live';
import { HUD_MOUNTS } from './mounts';
import styles from './HudRoot.module.css';
import { WorldLabels } from './world';

export interface HudRootProps {
  /** App-owned debug readout (written imperatively by the game loop), shown bottom-left of the world. */
  debug?: ReactNode;
  /** `/design`: render inside a sized parent instead of over the viewport (no keys, sprite or live regions). */
  contained?: boolean;
  /** `/design`: outline empty regions. */
  outline?: boolean;
}

/**
 * Game HUD root (DESIGN_SYSTEM §3): the blueprint grid over the canvas with every mounted slot, the glyph sprite,
 * the two live regions, the skip link and the global HUD keys. Each slot component reads the throttled projection
 * through its own narrow selector; this root never subscribes to the store.
 */
export function HudRoot({ debug, contained = false, outline = false }: HudRootProps) {
  useHudKeys(!contained);
  const slots = useMemo<HudSlots>(
    () => Object.fromEntries(Object.entries(HUD_MOUNTS).map(([name, C]) => [name, <C key={name} />])),
    [],
  );
  return (
    <HudFrame
      slots={slots}
      contained={contained}
      outline={outline}
      debug={debug}
      lead={
        contained ? null : (
          <>
            <a className={styles.skip} href={`#${HUD_PANELS_ID}`}>
              SKIP TO PANELS
            </a>
            {/* §8 landmarks: the page's one h1 (screen readers navigate by heading); the HUD has no visible title. */}
            <h1 className={styles.sr}>FUEL-X · LAUNCH CONTROL</h1>
          </>
        )
      }
    >
      {contained ? null : (
        <>
          {contained ? null : <WorldLabels />}
          <GlyphSprite />
          <LiveRegions />
        </>
      )}
    </HudFrame>
  );
}
