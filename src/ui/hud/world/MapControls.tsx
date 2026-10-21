import { useEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useStore } from 'zustand';
import { view, viewStore } from '@bridge/index';
import { tokens } from '@tokens/tokens';
import { Glyph } from '../../components';
import { CAMERA_NUDGE_EVENT } from './dom-contract';
import type { CameraNudge } from './dom-contract';
import styles from './MapControls.module.css';

// Map controls (DESIGN_SYSTEM §6.19, task 6.6, AC 25): a vertical toolbar of 32 px squares. Zoom / rotate are
// relative camera nudges (window event of `./dom-contract`, consumed by the render CameraRig, which damps them — no
// inertia here) with hold-to-repeat at a fixed step rate; frame / home / recenter are `view.*` intents. Keys:
// + / − zoom, Q / E rotate, Z frame selection, C recenter, plain H home view (8.2; Shift+H is the timeline's hold).

/** One zoom step: distance × 0.8 in, ÷ 0.8 out. One rotate step: 15° of compass yaw. */
export const ZOOM_STEP = 0.8;
export const ROTATE_STEP_DEG = 15;
/** Hold-to-repeat: first repeat after `dur.base`, then every `dur.fast` (fixed rate, no acceleration). */
const REPEAT_DELAY_MS = Number.parseFloat(tokens.motion.dur.base);
const REPEAT_EVERY_MS = Number.parseFloat(tokens.motion.dur.fast);

const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** The key belongs to the focused element (typing in a field). Mirrors the HUD frame's rule (§8). */
function typing(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (TYPING.has(target.tagName) || target.isContentEditable);
}

export function nudgeCamera(n: CameraNudge): void {
  window.dispatchEvent(new CustomEvent<CameraNudge>(CAMERA_NUDGE_EVENT, { detail: n }));
}

export const NUDGES = {
  zoomIn: { zoom: ZOOM_STEP },
  zoomOut: { zoom: 1 / ZOOM_STEP },
  // rotate right = the view heading turns clockwise (compass tape reads higher); the camera orbits the target
  rotateLeft: { yawDeg: -ROTATE_STEP_DEG },
  rotateRight: { yawDeg: ROTATE_STEP_DEG },
} as const satisfies Record<string, CameraNudge>;

/** Map-control keys → action (null = not ours). */
export function mapKey(key: string, shift = false): keyof typeof NUDGES | 'frame' | 'recenter' | 'home' | null {
  switch (key) {
    case 'h':
    case 'H':
      // Shift+H holds the count (CountdownTimeline); only the plain key goes home (§8).
      return shift ? null : 'home';
    case '+':
    case '=':
      return 'zoomIn';
    case '-':
    case '−':
      return 'zoomOut';
    case 'q':
    case 'Q':
      return 'rotateLeft';
    case 'e':
    case 'E':
      return 'rotateRight';
    case 'z':
    case 'Z':
      return 'frame';
    case 'c':
    case 'C':
      return 'recenter';
    default:
      return null;
  }
}

function frameSelection(): void {
  const id = viewStore.getState().selectedId;
  if (id) view.follow(id);
}

function recenter(): void {
  if (viewStore.getState().followId) view.camera({ kind: 'frame' });
}

/** Press-and-hold repeat for a nudge button (pointer); keyboard activation repeats through the OS key repeat. */
function useRepeat(n: CameraNudge) {
  const timer = useRef<number | null>(null);
  const stop = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  const loop = (delay: number): void => {
    timer.current = window.setTimeout(() => {
      nudgeCamera(n);
      loop(REPEAT_EVERY_MS);
    }, delay);
  };
  return {
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      nudgeCamera(n);
      stop();
      loop(REPEAT_DELAY_MS);
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onClick: (e: ReactMouseEvent) => {
      // keyboard (Enter / Space) activation: detail 0; pointer clicks already nudged on pointerdown
      if (e.detail === 0) nudgeCamera(n);
    },
  };
}

interface CtrlProps {
  label: string;
  kbd: string;
  children: ReactNode;
  disabled?: boolean;
  active?: boolean;
  onClick?: () => void;
  repeat?: ReturnType<typeof useRepeat>;
}

function Ctrl({ label, kbd, children, disabled = false, active = false, onClick, repeat }: CtrlProps) {
  return (
    <button
      type="button"
      className={styles.btn}
      aria-label={label}
      title={`${label} (${kbd})`}
      aria-disabled={disabled || undefined}
      aria-pressed={active || undefined}
      data-active={active || undefined}
      {...(disabled ? {} : (repeat ?? { onClick }))}
    >
      {children}
    </button>
  );
}

export function MapControls() {
  const selectedId = useStore(viewStore, (s) => s.selectedId);
  const followId = useStore(viewStore, (s) => s.followId);
  const zoomIn = useRepeat(NUDGES.zoomIn);
  const zoomOut = useRepeat(NUDGES.zoomOut);
  const rotL = useRepeat(NUDGES.rotateLeft);
  const rotR = useRepeat(NUDGES.rotateRight);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      const a = mapKey(e.key, e.shiftKey);
      if (!a) return;
      e.preventDefault();
      if (a === 'home') view.follow(null);
      else if (a === 'frame') frameSelection();
      else if (a === 'recenter') recenter();
      else nudgeCamera(NUDGES[a]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={styles.bar} role="toolbar" aria-orientation="vertical" aria-label="Camera" data-fx-occluder="">
      <Ctrl label="Zoom in" kbd="+" repeat={zoomIn}>
        <Glyph id="plus" />
      </Ctrl>
      <Ctrl label="Zoom out" kbd="−" repeat={zoomOut}>
        <Glyph id="minus" />
      </Ctrl>
      <Ctrl label="Rotate left" kbd="Q" repeat={rotL}>
        <span className={styles.ch}>‹</span>
      </Ctrl>
      <Ctrl label="Rotate right" kbd="E" repeat={rotR}>
        <span className={styles.ch}>›</span>
      </Ctrl>
      <Ctrl label="Frame selection" kbd="Z" disabled={!selectedId} onClick={frameSelection}>
        <span className={styles.ch}>⊞</span>
      </Ctrl>
      <Ctrl label="Home view" kbd="H" onClick={() => view.follow(null)}>
        <span className={styles.ch}>⌂</span>
      </Ctrl>
      <Ctrl label="Recenter on followed" kbd="C" disabled={!followId} active={!!followId} onClick={recenter}>
        <span className={styles.ch}>⌖</span>
      </Ctrl>
    </div>
  );
}
