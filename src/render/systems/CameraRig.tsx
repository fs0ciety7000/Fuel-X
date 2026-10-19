// CameraRig (5.5, AC 25): perspective, narrow FOV, high oblique. Follows the selected entity's SOCKET_Focus — or
// the centre of what is attached to it (booster + ship stack, transporter + cargo, found through the sockets) — and
// glides 700 ms (motion token `dur.camera`, eased) whenever the target, the stack or a preset changes; afterwards it follows rigidly while user orbit/zoom input is damped. Presets:
// `home` (site overview, drops the follow), `frame` (fit the followed entity / stack), explicit orbit. Drag =
// orbit, wheel = zoom, clamped to the strategic range (pitch 8–85°, 40 m–30 km) and never under ground.
// `controls.snapCamera` (debug `follow/camera(..., { snap })`, jumps) or `frozen` cut instead of gliding.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { Box3, PerspectiveCamera, Sphere, Vector3 } from 'three';
import type { Camera } from 'three';
import type { Id } from '@sim/types';
import { ASSETS } from '../assets/generated';
import type { CameraOrbit, RenderControls } from '../controls';
import type { FrameShared } from '../frame';
import type { EntityHandle, EntityRegistry } from '../registry';
import { siteView } from '../world/sites';
import {
  CAMERA_FOV_DEG,
  CAMERA_GLIDE_MS,
  CAMERA_MIN_HEIGHT_M,
  clampOrbit,
  easeInOutCubic,
  frameDistance,
  groundPitchFloorDeg,
  mixOrbit,
  orbitOffset,
} from './camera-math';

export { CAMERA_FOV_DEG } from './camera-math';
export const CAMERA_PRIORITY = -20;
/** Damping of user orbit/zoom input after the glide, 1/s. */
const INPUT_DAMPING_PER_S = 12;
const FOCUS = 'SOCKET_Focus';
const SHIP_MOUNT = 'SOCKET_ShipMount';
const CARGO = 'SOCKET_Cargo';
const STACKABLE: ReadonlySet<string> = new Set(['booster', 'ship', 'transporter']);
/** Tolerance for "origin sits on the parent's socket" (ship on booster, stage on transporter), m. */
const STACK_TOL_M = 1.5;

export interface CameraDeps {
  controls: RenderControls;
  registry: EntityRegistry;
  shared: FrameShared;
}

interface Glide {
  fromTarget: Vector3;
  fromOrbit: CameraOrbit;
  t: number;
}

export class CameraRigCore {
  private orbit: CameraOrbit;
  private goal: CameraOrbit;
  private readonly target: Vector3;
  private readonly goalTarget = new Vector3();
  private glide: Glide | null = null;
  private lastFollow: Id | null = null;
  private readonly box = new Box3();
  private readonly tmpBox = new Box3();
  private readonly sphere = new Sphere();
  private readonly v = new Vector3();
  private readonly rel = new Vector3();
  private readonly off = new Vector3();

  constructor(private readonly d: CameraDeps) {
    const site = siteView(d.controls.siteId);
    this.orbit = { ...site.home };
    this.goal = { ...site.home };
    this.target = new Vector3(...site.target);
    this.lastFollow = d.controls.followId;
  }

  /** Drag = orbit, wheel = zoom: both write the goal orbit (clamped); the frame loop damps toward it. */
  attach(dom: HTMLElement): () => void {
    let drag: { x: number; y: number } | null = null;
    const down = (e: PointerEvent): void => {
      drag = { x: e.clientX, y: e.clientY };
      dom.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent): void => {
      if (!drag) return;
      this.goal = clampOrbit({
        ...this.goal,
        yawDeg: this.goal.yawDeg - (e.clientX - drag.x) * 0.25,
        pitchDeg: this.goal.pitchDeg + (e.clientY - drag.y) * 0.2,
      });
      drag = { x: e.clientX, y: e.clientY };
    };
    const up = (e: PointerEvent): void => {
      drag = null;
      if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId);
    };
    const wheel = (e: WheelEvent): void => {
      e.preventDefault();
      this.goal = clampOrbit({ ...this.goal, distM: this.goal.distM * Math.exp(e.deltaY * 0.001) });
    };
    dom.addEventListener('pointerdown', down);
    dom.addEventListener('pointermove', move);
    dom.addEventListener('pointerup', up);
    dom.addEventListener('wheel', wheel, { passive: false });
    return () => {
      dom.removeEventListener('pointerdown', down);
      dom.removeEventListener('pointermove', move);
      dom.removeEventListener('pointerup', up);
      dom.removeEventListener('wheel', wheel);
    };
  }

  /** True when `child`'s origin sits on `parent`'s socket (posed transforms, absolute site metres). */
  private seated(parent: EntityHandle, socket: string, child: EntityHandle): boolean {
    const s = parent.info.sockets.get(socket);
    if (!s) return false;
    this.v.copy(s).applyQuaternion(parent.object.quaternion).add(parent.object.position);
    return this.v.distanceTo(child.object.position) < STACK_TOL_M;
  }

  /** Directly attached neighbours: ship on a booster's SOCKET_ShipMount, stage on a transporter's SOCKET_Cargo. */
  private attached(a: EntityHandle, b: EntityHandle): boolean {
    const pair = (p: string, c: string): [EntityHandle, EntityHandle] | null =>
      a.asset === p && b.asset === c ? [a, b] : b.asset === p && a.asset === c ? [b, a] : null;
    const bs = pair('booster', 'ship');
    if (bs) return this.seated(bs[0], SHIP_MOUNT, bs[1]);
    const tb = pair('transporter', 'booster') ?? pair('transporter', 'ship');
    // the deck lift (≤ 0.6 m) rides inside the tolerance
    if (tb) return this.seated(tb[0], CARGO, tb[1]);
    return false;
  }

  /** The followed handle plus everything attached to it (booster + ship stack, transporter + cargo). */
  stackOf(h: EntityHandle): EntityHandle[] {
    if (!STACKABLE.has(h.asset)) return [h];
    const out = [h];
    for (let i = 0; i < out.length; i++) {
      const cur = out[i];
      if (!cur) continue;
      for (const o of this.d.registry.byId.values()) {
        if (!o.object.visible || !STACKABLE.has(o.asset) || out.includes(o)) continue;
        if (this.attached(cur, o)) out.push(o);
      }
    }
    return out;
  }

  /** World-space bounds of the handles' rest bounds (absolute site metres). */
  private boundsOf(hs: readonly EntityHandle[]): Box3 {
    this.box.makeEmpty();
    for (const h of hs) {
      const b = ASSETS[h.asset].bounds;
      this.tmpBox.min.set(b.min[0], b.min[1], b.min[2]);
      this.tmpBox.max.set(b.max[0], b.max[1], b.max[2]);
      h.object.updateMatrix();
      this.tmpBox.applyMatrix4(h.object.matrix);
      this.box.union(this.tmpBox);
    }
    return this.box;
  }

  /** Stack size last frame: a stage set onto / lifted off the followed body re-targets with a glide. */
  private lastStack = 1;

  private followTarget(h: EntityHandle, out: Vector3): boolean {
    const stack = this.stackOf(h);
    const changed = stack.length !== this.lastStack;
    this.lastStack = stack.length;
    if (stack.length > 1) {
      this.boundsOf(stack).getCenter(out);
      return changed;
    }
    const focus = h.info.sockets.get(FOCUS);
    out
      .copy(focus ?? this.v.set(0, 0, 0))
      .applyQuaternion(h.object.quaternion)
      .add(h.object.position);
    return changed;
  }

  frame(camera: Camera, delta: number): void {
    if (!(camera instanceof PerspectiveCamera)) return;
    const { controls, registry, shared } = this.d;
    const site = siteView(controls.siteId);
    const snap = controls.snapCamera || controls.frozen;
    controls.snapCamera = false;
    let retarget = false;

    const req = controls.cameraRequest;
    if (req) {
      controls.cameraRequest = null;
      retarget = true;
      if (req.kind === 'home') {
        controls.followId = null;
        this.goal = { ...site.home };
      } else if (req.kind === 'orbit') {
        this.goal = clampOrbit(req);
      } else {
        const f = controls.followId ? registry.byId.get(controls.followId) : undefined;
        if (f) {
          const sphere = this.boundsOf(this.stackOf(f)).getBoundingSphere(this.sphere);
          this.goal = clampOrbit({ ...this.goal, distM: frameDistance(sphere.radius, camera.fov, camera.aspect) });
        } else {
          this.goal = { ...site.home };
        }
      }
    }
    if (controls.followId !== this.lastFollow) {
      this.lastFollow = controls.followId;
      this.lastStack = 1;
      retarget = true;
    }

    const followed = controls.followId ? registry.byId.get(controls.followId) : undefined;
    if (followed?.object.visible && this.followTarget(followed, this.goalTarget) && !retarget && !snap) {
      // composition changed under a running follow: glide to the new centre (not on the very first frame)
      retarget = true;
    } else if (!followed) this.goalTarget.set(...site.target);
    // a followed entity that is hidden (lost stage, off-map truck) keeps the last target
    if (this.goalTarget.y < 0) this.goalTarget.y = 0;

    if (snap) {
      this.glide = null;
      this.target.copy(this.goalTarget);
      this.orbit = { ...this.goal };
    } else {
      if (retarget) this.glide = { fromTarget: this.target.clone(), fromOrbit: { ...this.orbit }, t: 0 };
      const g = this.glide;
      if (g) {
        g.t = Math.min(1, g.t + (Math.min(delta, 0.1) * 1000) / CAMERA_GLIDE_MS);
        const e = easeInOutCubic(g.t);
        this.target.lerpVectors(g.fromTarget, this.goalTarget, e);
        this.orbit = mixOrbit(g.fromOrbit, this.goal, e);
        if (g.t >= 1) this.glide = null;
      } else {
        this.target.copy(this.goalTarget);
        this.orbit = mixOrbit(this.orbit, this.goal, 1 - Math.exp(-Math.min(delta, 0.1) * INPUT_DAMPING_PER_S));
      }
    }

    // Never under ground: raise the pitch rather than sliding the camera up (keeps the framing consistent).
    const floor = groundPitchFloorDeg(this.target.y, this.orbit.distM);
    const drawn = this.orbit.pitchDeg < floor ? { ...this.orbit, pitchDeg: floor } : this.orbit;

    // Scene space = absolute − floating origin.
    this.rel.copy(this.target).sub(shared.origin);
    orbitOffset(drawn, this.off);
    camera.position.copy(this.rel).add(this.off);
    const minY = CAMERA_MIN_HEIGHT_M - shared.origin.y;
    if (camera.position.y < minY) camera.position.y = minY;
    camera.lookAt(this.rel);

    const near = Math.min(50, Math.max(0.5, drawn.distM / 400));
    const far = Math.max(60_000, drawn.distM * 40 + this.target.y * 3);
    if (camera.near !== near || camera.far !== far || camera.fov !== CAMERA_FOV_DEG) {
      camera.near = near;
      camera.far = far;
      camera.fov = CAMERA_FOV_DEG;
      camera.updateProjectionMatrix();
    }
    shared.targetAbs.copy(this.target);
    shared.camDist = drawn.distM;
  }
}

export function CameraRig(props: CameraDeps) {
  const dom = useThree((s) => s.gl.domElement);
  const [rig] = useState(() => new CameraRigCore(props));
  useEffect(() => rig.attach(dom), [rig, dom]);
  useFrame(({ camera }, delta) => rig.frame(camera, delta), CAMERA_PRIORITY);
  return null;
}
