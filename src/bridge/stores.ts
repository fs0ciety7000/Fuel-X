// Zustand stores between the app and the HUD (ADR 0004, ARCHITECTURE §8).
// - `projectionStore`: the UiProjection, written only by the app's projector (≤ 10 Hz + salient flushes). Read-only
//   for the UI: `useStore(projectionStore, (p) => p.clock.tClock)` or a `useShallow` selector over a few fields.
// - `viewStore`: UI intents / view state (selection, follow, site, tab, camera and time-rate requests, acked alerts).
//   Written by the UI (through `view.*`) and the debug hooks; the app subscribes and applies it to the render
//   controls / TimeControl, and flushes a projection on change. Render reads app-owned controls, never this store
//   per frame.
// Vanilla stores (`zustand/vanilla`): usable from the loop, the debug hooks and tests without React.
import type { Id } from '@sim/types';
import { createStore } from 'zustand/vanilla';
import { emptyProjection } from './empty-projection';
import type { HudTab, TimeScaleValue, UiProjection } from './projection-types';

export const projectionStore = createStore<UiProjection>(() => emptyProjection());

export type CameraIntent =
  | { kind: 'home' | 'frame' }
  | { kind: 'orbit'; yawDeg: number; pitchDeg: number; distM: number };

export interface ViewState {
  selectedId: Id | null;
  followId: Id | null;
  siteId: string;
  tab: HudTab;
  /** Last camera request; `seq` increments so the same preset twice is two requests. */
  camera: { seq: number; intent: CameraIntent; snap: boolean } | null;
  /** Last time-rate request (0 = pause); `seq` increments per request. */
  timeScale: { seq: number; scale: TimeScaleValue } | null;
  /** Alert ids the player acknowledged (alerts are condition-based; an id leaves when its condition clears). */
  ackedAlerts: string[];
}

export const DEFAULT_SITE_ID = 'LC-1';

export function initialViewState(): ViewState {
  return {
    selectedId: null,
    followId: null,
    siteId: DEFAULT_SITE_ID,
    tab: 'vehicles',
    camera: null,
    timeScale: null,
    ackedAlerts: [],
  };
}

export const viewStore = createStore<ViewState>(() => initialViewState());

/** UI intents (the only writers of viewStore besides the debug hooks and the app's reset). */
export const view = {
  /** Select an entity (inspector, orange label); null clears. */
  select(id: Id | null): void {
    viewStore.setState({ selectedId: id });
  },
  /** Follow with the camera (frame preset); null = drop the follow and go home. Selecting follows too (AC 25). */
  follow(id: Id | null, opts?: { snap?: boolean; select?: boolean }): void {
    const s = viewStore.getState();
    viewStore.setState({
      followId: id,
      selectedId: opts?.select === false ? s.selectedId : id === null ? s.selectedId : id,
      camera: { seq: (s.camera?.seq ?? 0) + 1, intent: { kind: id === null ? 'home' : 'frame' }, snap: !!opts?.snap },
    });
  },
  camera(intent: CameraIntent, opts?: { snap?: boolean }): void {
    const s = viewStore.getState();
    viewStore.setState({ camera: { seq: (s.camera?.seq ?? 0) + 1, intent, snap: !!opts?.snap } });
  },
  site(siteId: string): void {
    const s = viewStore.getState();
    viewStore.setState({
      siteId,
      followId: null,
      camera: { seq: (s.camera?.seq ?? 0) + 1, intent: { kind: 'home' }, snap: false },
    });
  },
  tab(tab: HudTab): void {
    viewStore.setState({ tab });
  },
  /** Request a time rate (0 = pause). Capped rates are remembered (GDD §6: never auto-raised). */
  timeScale(scale: TimeScaleValue): void {
    const s = viewStore.getState();
    viewStore.setState({ timeScale: { seq: (s.timeScale?.seq ?? 0) + 1, scale } });
  },
  ackAlert(id: string): void {
    const s = viewStore.getState();
    if (!s.ackedAlerts.includes(id)) viewStore.setState({ ackedAlerts: [...s.ackedAlerts, id] });
  },
  ackAlerts(ids: readonly string[]): void {
    const s = viewStore.getState();
    const add = ids.filter((id) => !s.ackedAlerts.includes(id));
    if (add.length > 0) viewStore.setState({ ackedAlerts: [...s.ackedAlerts, ...add] });
  },
  /** New game / load: back to defaults (keeps the requested time rate untouched). */
  reset(): void {
    viewStore.setState({ ...initialViewState(), timeScale: viewStore.getState().timeScale });
  },
};
