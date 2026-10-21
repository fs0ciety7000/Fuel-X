// WorldOverlaySystem (6.6, AC 24–25): the per-frame half of the world HUD. React (10 Hz projection) renders the
// label tags, altitude scale and compass tape as static structure (`src/ui/hud/world/**`); this system finds them by
// the data attributes of `../dom-contract` and, once per rendered frame, writes only what moves:
//   - labels: project each entity's SOCKET_Label, declutter (priority, overlap, HUD cards, ≤ 64 positioned) and write
//     `transform` + `data-mode` (tag / anchor / hidden) when they change;
//   - altitude scale: followed entity's altitude → marker rail offset, stepped scale numerals, readout, aria-label;
//   - compass: camera heading (or the followed ground / sea vehicle's heading) → tape offset, readout, aria-label.
// Reads (layout) happen before writes: tag sizes are measured only when the label layer mutates, HUD card rects at
// 4 Hz. No React state, no sim access; every write is skipped when the value did not change.
import { useFrame, useThree } from '@react-three/fiber';
import { tokens } from '@tokens/tokens';
import { useEffect, useState } from 'react';
import { PerspectiveCamera, Vector3 } from 'three';
import type { Camera } from 'three';
import { ASSETS } from '../assets/generated';
import type { RenderControls } from '../controls';
import { COMPASS_TAPE_FROM_DEG, COMPASS_TAPE_SPAN_DEG, DOM, OCCLUDER_SELECTOR } from '../dom-contract';
import type { FrameShared } from '../frame';
import type { EntityHandle, EntityRegistry } from '../registry';
import {
  altitudeAria,
  altitudeClassOf,
  altitudeReadout,
  altitudeScaleM,
  altitudeTickLabels,
  compareLabels,
  createLabelSlot,
  declutter,
  headingFollowsEntity,
  headingOfQuat,
  headingReadout,
  labelRangeM,
} from '../overlay/world-overlay';
import type { LabelSlot, Rect } from '../overlay/world-overlay';

/** After the camera (−20) and the view LOD (−15), before the render pass (+1). */
export const WORLD_OVERLAY_PRIORITY = -6;
const LABEL_SOCKET = 'SOCKET_Label';
/** Leader line between the tag's bottom edge and the anchor, px (DESIGN_SYSTEM §6.20, `space.5`). */
const LEADER_PX = Number.parseFloat(tokens.space[5] ?? '16');
/** HUD card rectangles are re-read at this period, ms (layout read, cheap at 4 Hz). */
const OCCLUDER_REFRESH_MS = 250;
/** While the DOM layers are missing, look for them every N frames. */
const LOOKUP_EVERY_FRAMES = 30;
/** Anchors this far outside the viewport are hidden, px. */
const VIEW_MARGIN_PX = 40;

interface LabelEl {
  el: HTMLElement;
  tag: HTMLElement | null;
  slot: LabelSlot;
  /** Last written transform (rounded px) and mode, to skip unchanged writes. */
  px: number;
  py: number;
  mode: string;
}

interface AltitudeEls {
  root: HTMLElement;
  rail: HTMLElement | null;
  readout: HTMLElement | null;
  ticks: HTMLElement[];
}

interface CompassEls {
  root: HTMLElement;
  tape: HTMLElement | null;
  readout: HTMLElement | null;
}

export interface WorldOverlayDeps {
  controls: RenderControls;
  registry: EntityRegistry;
  shared: FrameShared;
}

const attr = (name: string): string => `[${name}]`;

export class WorldOverlayCore {
  private doc: Document | null = null;
  private layer: HTMLElement | null = null;
  private observer: MutationObserver | null = null;
  private dirty = true;
  private labels: LabelEl[] = [];
  private readonly sorted: LabelSlot[] = [];
  private readonly placed: Rect[] = [];
  private readonly occluders: Rect[] = [];
  private occluderAt = -Infinity;
  private altitude: AltitudeEls | null = null;
  private compass: CompassEls | null = null;
  private lookupIn = 0;
  private clockMs = 0;
  private readonly v = new Vector3();
  // last written altitude / compass values (skip unchanged writes)
  private altMode = '';
  private altMaxM = 0;
  private altFrac = -1;
  private altText = '';
  private hdgFrac = -1;
  private hdgText = '';
  /** Positioned labels last frame (stats / e2e). */
  positioned = 0;

  constructor(private readonly d: WorldOverlayDeps) {}

  /** The page document (null in Node tests). */
  bind(doc: Document | null): void {
    this.doc = doc;
  }

  private lookup(): void {
    const doc = this.doc;
    if (!doc) return;
    if (!this.layer?.isConnected) {
      this.observer?.disconnect();
      this.observer = null;
      this.layer = doc.querySelector<HTMLElement>(attr(DOM.labelLayer));
      this.labels = [];
      this.dirty = true;
      const view = doc.defaultView;
      if (this.layer && view && 'MutationObserver' in view) {
        this.observer = new view.MutationObserver(() => {
          this.dirty = true;
        });
        // our own writes (style, data-mode) are not in the filter, so they never re-trigger it
        this.observer.observe(this.layer, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: [DOM.label, DOM.priority, 'data-state'],
        });
      }
    }
    if (!this.altitude?.root.isConnected) {
      const root = doc.querySelector<HTMLElement>(attr(DOM.altitude));
      this.altitude = root
        ? {
            root,
            rail: root.querySelector<HTMLElement>(attr(DOM.altitudeRail)),
            readout: root.querySelector<HTMLElement>(attr(DOM.altitudeReadout)),
            ticks: Array.from(root.querySelectorAll<HTMLElement>(attr(DOM.altitudeTick))).sort(
              (a, b) => Number(a.getAttribute(DOM.altitudeTick)) - Number(b.getAttribute(DOM.altitudeTick)),
            ),
          }
        : null;
      this.altMode = '';
      this.altMaxM = 0;
      this.altFrac = -1;
      this.altText = '';
    }
    if (!this.compass?.root.isConnected) {
      const root = doc.querySelector<HTMLElement>(attr(DOM.compass));
      this.compass = root
        ? {
            root,
            tape: root.querySelector<HTMLElement>(attr(DOM.compassTape)),
            readout: root.querySelector<HTMLElement>(attr(DOM.compassReadout)),
          }
        : null;
      this.hdgFrac = -1;
      this.hdgText = '';
    }
  }

  /** Re-reads the label elements and their tag sizes (one layout read, only after a mutation). */
  private rebuild(): void {
    this.dirty = false;
    const layer = this.layer;
    if (!layer) {
      this.labels = [];
      return;
    }
    const prev = new Map<HTMLElement, LabelEl>();
    for (const l of this.labels) prev.set(l.el, l);
    const next: LabelEl[] = [];
    for (const el of layer.querySelectorAll<HTMLElement>(attr(DOM.label))) {
      const id = el.getAttribute(DOM.label) ?? '';
      const old = prev.get(el);
      const l: LabelEl = old ?? {
        el,
        tag: null,
        slot: createLabelSlot(id),
        px: Number.NaN,
        py: Number.NaN,
        mode: '',
      };
      l.slot.id = id;
      l.tag = el.querySelector<HTMLElement>(attr(DOM.labelTag));
      l.slot.priority = Number(el.getAttribute(DOM.priority) ?? 1) || 0;
      next.push(l);
    }
    // measure after collecting (all reads together)
    for (const l of next) {
      l.slot.w = l.tag?.offsetWidth ?? 0;
      l.slot.h = l.tag?.offsetHeight ?? 0;
    }
    this.labels = next;
  }

  private refreshOccluders(): void {
    const doc = this.doc;
    this.occluders.length = 0;
    if (!doc) return;
    for (const el of doc.querySelectorAll<HTMLElement>(OCCLUDER_SELECTOR)) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      this.occluders.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    }
  }

  /** Scene-space position of an entity's label anchor (SOCKET_Label, else the top of its bounds). */
  private anchorOf(h: EntityHandle, out: Vector3): Vector3 {
    const s = h.info.sockets.get(LABEL_SOCKET);
    if (s) out.copy(s);
    else out.set(0, ASSETS[h.asset].bounds.max[1] + 3, 0);
    return out.applyQuaternion(h.object.quaternion).add(h.object.position).sub(this.d.shared.origin);
  }

  frame(camera: Camera, viewW: number, viewH: number, rect: { left: number; top: number }, deltaS: number): void {
    if (!(camera instanceof PerspectiveCamera)) return;
    this.clockMs += Math.min(deltaS, 0.25) * 1000;
    if (--this.lookupIn <= 0) {
      this.lookupIn = LOOKUP_EVERY_FRAMES;
      this.lookup();
    }
    if (this.layer && !this.layer.isConnected) this.lookup();
    camera.updateMatrixWorld();

    // --- reads ----------------------------------------------------------------------------------------------
    if (this.dirty) this.rebuild();
    if (this.labels.length > 0 && this.clockMs - this.occluderAt >= OCCLUDER_REFRESH_MS) {
      this.occluderAt = this.clockMs;
      this.refreshOccluders();
    }

    // --- labels ---------------------------------------------------------------------------------------------
    const { registry } = this.d;
    const sorted = this.sorted;
    sorted.length = 0;
    const v = this.v;
    for (const l of this.labels) {
      const s = l.slot;
      sorted.push(s);
      s.visible = false;
      const h = registry.byId.get(s.id);
      if (!h?.object.visible) continue;
      this.anchorOf(h, v);
      s.dist = v.distanceTo(camera.position);
      if (s.dist > labelRangeM(s.priority)) continue;
      v.project(camera);
      if (v.z < -1 || v.z > 1) continue;
      s.x = rect.left + ((v.x + 1) / 2) * viewW;
      s.y = rect.top + ((1 - v.y) / 2) * viewH;
      if (
        s.x < -VIEW_MARGIN_PX ||
        s.x > viewW + VIEW_MARGIN_PX ||
        s.y < -VIEW_MARGIN_PX ||
        s.y > viewH + VIEW_MARGIN_PX
      )
        continue;
      s.visible = true;
    }
    sorted.sort(compareLabels);
    this.positioned = declutter(sorted, this.occluders, LEADER_PX, this.placed);

    // --- writes ---------------------------------------------------------------------------------------------
    for (const l of this.labels) {
      const s = l.slot;
      if (s.mode !== l.mode) {
        l.mode = s.mode;
        l.el.setAttribute(DOM.mode, s.mode);
      }
      if (s.mode === 'hidden') continue;
      const px = Math.round(s.x);
      const py = Math.round(s.y);
      if (px !== l.px || py !== l.py) {
        l.px = px;
        l.py = py;
        l.el.style.transform = `translate3d(${px}px, ${py}px, 0)`;
      }
    }

    this.writeAltitude();
    this.writeCompass();
  }

  private followed(): EntityHandle | undefined {
    const id = this.d.controls.followId;
    const h = id ? this.d.registry.byId.get(id) : undefined;
    return h?.object.visible ? h : undefined;
  }

  private writeAltitude(): void {
    const a = this.altitude;
    if (!a) return;
    const h = this.followed();
    const cls = h ? altitudeClassOf(h.asset) : null;
    const mode = h && cls ? 'shown' : 'hidden';
    if (mode !== this.altMode) {
      this.altMode = mode;
      a.root.setAttribute(DOM.mode, mode);
    }
    if (!h || !cls) return;
    const altM = Math.max(0, h.object.position.y);
    const maxM = altitudeScaleM(cls, altM, this.altMaxM);
    if (maxM !== this.altMaxM) {
      this.altMaxM = maxM;
      const labels = altitudeTickLabels(maxM, a.ticks.length || undefined);
      a.ticks.forEach((t, i) => {
        t.textContent = labels[i] ?? '';
      });
    }
    // 0.1 % steps: sub-pixel on a ≤ 600 px scale, so the rail is written at most when it visibly moves
    const frac = Math.round(Math.min(1, altM / maxM) * 1000) / 1000;
    if (frac !== this.altFrac && a.rail) {
      this.altFrac = frac;
      a.rail.style.transform = `translate3d(0, ${((1 - frac) * 100).toFixed(1)}%, 0)`;
    }
    const text = altitudeReadout(altM);
    if (text !== this.altText) {
      this.altText = text;
      if (a.readout) a.readout.textContent = text;
      a.root.setAttribute('aria-label', altitudeAria(altM));
    }
  }

  private writeCompass(): void {
    const c = this.compass;
    if (!c) return;
    const h = this.followed();
    const q = h?.object.quaternion;
    const deg =
      h && q && headingFollowsEntity(h.asset) ? headingOfQuat(q.x, q.y, q.z, q.w) : this.d.shared.camHeadingDeg;
    const frac = Math.round(((deg - COMPASS_TAPE_FROM_DEG) / COMPASS_TAPE_SPAN_DEG) * 100_000) / 100_000;
    if (frac !== this.hdgFrac && c.tape) {
      this.hdgFrac = frac;
      c.tape.style.transform = `translate3d(${(-frac * 100).toFixed(3)}%, 0, 0)`;
    }
    const text = headingReadout(deg);
    if (text !== this.hdgText) {
      this.hdgText = text;
      if (c.readout) c.readout.textContent = text;
      c.root.setAttribute('aria-label', `Heading ${text.slice(0, 3).replace(/^0+(?=\d)/, '')} degrees`);
    }
  }

  dispose(): void {
    this.observer?.disconnect();
    this.observer = null;
  }
}

export function WorldOverlaySystem(props: WorldOverlayDeps) {
  const gl = useThree((s) => s.gl);
  const [core] = useState(() => new WorldOverlayCore(props));
  useEffect(() => () => core.dispose(), [core]);
  useFrame(({ camera, size }, delta) => {
    const canvas = gl.domElement;
    core.bind(canvas.ownerDocument);
    // the label layer is fixed to the viewport like the canvas: anchors in viewport px
    core.frame(camera, size.width, size.height, size, delta);
  }, WORLD_OVERLAY_PRIORITY);
  return null;
}
