import type { ReactNode } from 'react';
import { Glyph } from '../../components';
import { FOCUS_ORDER, SLOT_META, type HudSlotName } from './slots';
import styles from './HudFrame.module.css';

export type HudSlots = Partial<Record<HudSlotName, ReactNode>>;

export interface HudSlotProps {
  name: HudSlotName;
  children?: ReactNode;
  /** `/design`: render the empty region with its name. */
  outline?: boolean;
}

/**
 * One named region of the HUD grid (§3.1). Transparent to the pointer; direct children of interactive slots get
 * `pointer-events: auto` (§3.4). Renders nothing when empty (unless outlined), so unfilled slots cost no DOM.
 */
export function HudSlot({ name, children, outline = false }: HudSlotProps) {
  const empty = children === null || children === undefined || children === false;
  if (empty && !outline) return null;
  const meta = SLOT_META[name];
  return (
    <div
      className={styles.slot}
      data-slot={name}
      data-interactive={meta.interactive || undefined}
      data-outline={outline || undefined}
    >
      {empty ? (
        <span className={styles.slotName} aria-hidden="true">
          {name.toUpperCase()} · {meta.owner} · {meta.spec}
        </span>
      ) : (
        children
      )}
    </div>
  );
}

export interface HudFrameProps {
  slots: HudSlots;
  /** Fixed over the viewport (game) or absolute inside a sized parent (`/design`). */
  contained?: boolean;
  /** `/design`: outline every region and print empty slot names. */
  outline?: boolean;
  /** Rendered before the grid (first in focus order: the skip link). */
  lead?: ReactNode;
  /** App debug readout, bottom-left of the world region (dev only, pointer-transparent). */
  debug?: ReactNode;
  /** Extra layers after the grid (glyph sprite, live regions). */
  children?: ReactNode;
  className?: string | undefined;
}

const CORNERS = ['tl', 'tr', 'bl', 'br'] as const;

/** Target of the `Skip to panels` link (§8): the right column (inspector + tabbed panel). */
export const HUD_PANELS_ID = 'hud-panels';

/**
 * The HUD blueprint grid over the canvas (DESIGN_SYSTEM §3): top bar · left column (flight card, poll) · altitude
 * rail · world (empty, crosshair corners) · map-control rail · right column (inspector over tabs) · decision strip ·
 * countdown band · toasts · centred overlay. Compact mode (§3.3) and the minimum-viewport plate (§2.9) are container
 * queries on the host, so `/design` can show both sizes side by side.
 */
export function HudFrame({
  slots,
  contained = false,
  outline = false,
  lead,
  debug,
  children,
  className,
}: HudFrameProps) {
  const slot = (name: HudSlotName): ReactNode => (
    <HudSlot key={name} name={name} outline={outline}>
      {slots[name]}
    </HudSlot>
  );
  return (
    <div
      className={[styles.host, className].filter(Boolean).join(' ')}
      data-contained={contained || undefined}
      data-testid="hud-root"
    >
      {lead}
      <div className={styles.frame} data-outline={outline || undefined}>
        {FOCUS_ORDER.map((name) =>
          name === 'tabs' ? null : name === 'inspect' ? (
            <div
              key="right"
              id={contained ? undefined : HUD_PANELS_ID}
              className={styles.right}
              data-region="right"
              tabIndex={-1}
            >
              {slot('inspect')}
              {slot('tabs')}
            </div>
          ) : (
            slot(name)
          ),
        )}
        <div className={styles.world} data-region="world" aria-hidden="true">
          {CORNERS.map((c) => (
            <span key={c} className={styles.cross} data-corner={c}>
              <Glyph id="crosshair" />
            </span>
          ))}
        </div>
        {debug ? <div className={styles.debug}>{debug}</div> : null}
      </div>
      <div className={styles.minPlate} role="alert" data-testid="hud-min-viewport">
        <p>[ VIEWPORT 1280×720 MIN ]</p>
        <p className={styles.minSub}>ENLARGE THE WINDOW TO CONTINUE</p>
      </div>
      {children}
    </div>
  );
}
