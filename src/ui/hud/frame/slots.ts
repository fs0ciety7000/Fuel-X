// HUD slot names (DESIGN_SYSTEM §3.1 grid areas, §3.5 slot API). The names are an API: other HUD tasks mount
// their components into these regions through `src/ui/hud/mounts.tsx`; renaming one = update every mount.

export const HUD_SLOTS = [
  'top',
  'flight',
  'poll',
  'alt',
  'toasts',
  'compass',
  'ctrl',
  'inspect',
  'tabs',
  'strip',
  'time',
  'overlay',
] as const;

export type HudSlotName = (typeof HUD_SLOTS)[number];

/**
 * Per-slot behaviour. `interactive`: the slot's direct children get `pointer-events: auto` (zero specificity, a
 * component may still opt out on its root); read-only slots (altitude scale, compass) stay transparent to the
 * pointer (§3.4). `owner` documents which task fills it.
 */
export const SLOT_META: Record<HudSlotName, { interactive: boolean; owner: string; spec: string }> = {
  top: { interactive: true, owner: '6.3', spec: '§6.1–6.6' },
  flight: { interactive: true, owner: '6.4', spec: '§6.7' },
  poll: { interactive: true, owner: '6.5', spec: '§6.24' },
  alt: { interactive: false, owner: '6.6', spec: '§6.21' },
  toasts: { interactive: true, owner: '6.7', spec: '§6.23' },
  compass: { interactive: false, owner: '6.6', spec: '§6.22' },
  ctrl: { interactive: true, owner: '6.6', spec: '§6.19' },
  inspect: { interactive: true, owner: '6.4', spec: '§6.11' },
  tabs: { interactive: true, owner: '6.4', spec: '§6.14' },
  strip: { interactive: true, owner: '6.5', spec: '§6.28' },
  time: { interactive: true, owner: '6.5', spec: '§6.17, §6.25' },
  overlay: { interactive: true, owner: '6.7', spec: '§6.26, §6.29' },
};
