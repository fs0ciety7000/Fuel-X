// Interim orbit-limited camera (the full rig with focus/frame transitions is 5.5): narrow FOV, high oblique,
// damped follow of the followed entity's SOCKET_Focus, presets (home / frame / explicit orbit), drag to orbit,
// wheel to zoom, clamped to the strategic range and never below ground.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { PerspectiveCamera, Vector3 } from 'three';
import type { Camera } from 'three';
import { ASSETS } from '../assets/generated';
import { isAssetName } from '../assets/useAsset';
import type { CameraOrbit, RenderControls } from '../controls';
import type { FrameShared } from '../frame';
import type { EntityRegistry } from '../registry';
import { siteView } from '../world/sites';

export const CAMERA_PRIORITY = -20;
export const CAMERA_FOV_DEG = 30;
export const CAMERA_LIMITS = { pitchMinDeg: 8, pitchMaxDeg: 85, distMinM: 40, distMaxM: 30_000 } as const;
/** Exponential damping rate of the follow glide, 1/s. */
const DAMPING_PER_S = 5;
/** Frame preset: bounding radius ÷ sin(fov/2) × margin. */
const FRAME_MARGIN = 1.6;
const FOCUS = 'SOCKET_Focus';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function clampOrbit(o: CameraOrbit): CameraOrbit {
  return {
    yawDeg: ((o.yawDeg % 360) + 360) % 360,
    pitchDeg: clamp(o.pitchDeg, CAMERA_LIMITS.pitchMinDeg, CAMERA_LIMITS.pitchMaxDeg),
    distM: clamp(o.distM, CAMERA_LIMITS.distMinM, CAMERA_LIMITS.distMaxM),
  };
}

/** Camera offset from its target for an orbit (compass yaw: 0 = north = −Z, 90 = east = +X). */
export function orbitOffset(o: CameraOrbit, out: Vector3): Vector3 {
  const yaw = (o.yawDeg * Math.PI) / 180;
  const pitch = (o.pitchDeg * Math.PI) / 180;
  const h = Math.cos(pitch) * o.distM;
  return out.set(Math.sin(yaw) * h, Math.sin(pitch) * o.distM, -Math.cos(yaw) * h);
}

/** Distance that frames an asset's rest bounds in the vertical FOV. */
export function frameDistance(bounds: { min: readonly number[]; max: readonly number[] }): number {
  const [x0 = 0, y0 = 0, z0 = 0] = bounds.min;
  const [x1 = 0, y1 = 0, z1 = 0] = bounds.max;
  const r = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2;
  return (r / Math.sin(((CAMERA_FOV_DEG / 2) * Math.PI) / 180)) * FRAME_MARGIN;
}

export interface CameraDeps {
  controls: RenderControls;
  registry: EntityRegistry;
  shared: FrameShared;
}

export class CameraController {
  private cur: CameraOrbit;
  private goal: CameraOrbit;
  private readonly target: Vector3;
  private readonly goalTarget = new Vector3();
  private readonly tmp = new Vector3();
  private readonly rel = new Vector3();

  constructor(private readonly d: CameraDeps) {
    const home = siteView(d.controls.siteId);
    this.cur = { ...home.home };
    this.goal = { ...home.home };
    this.target = new Vector3(...home.target);
  }

  /** Drag = orbit, wheel = zoom (writes the goal; the frame loop glides toward it). Returns the detach fn. */
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

  frame(camera: Camera, delta: number): void {
    if (!(camera instanceof PerspectiveCamera)) return;
    const { controls, registry, shared } = this.d;
    const site = siteView(controls.siteId);
    const followed = controls.followId ? registry.byId.get(controls.followId) : undefined;

    const req = controls.cameraRequest;
    if (req) {
      if (req.kind === 'home') this.goal = { ...site.home };
      else if (req.kind === 'orbit') this.goal = clampOrbit(req);
      else if (followed && isAssetName(followed.info.name)) {
        this.goal = clampOrbit({ ...this.goal, distM: frameDistance(ASSETS[followed.info.name].bounds) });
      }
      controls.cameraRequest = null;
    }

    // Goal target: followed SOCKET_Focus (rotated with the entity), else the site home target.
    if (followed?.object.visible) {
      const focus = followed.info.sockets.get(FOCUS);
      this.goalTarget.copy(focus ?? this.tmp.set(0, 0, 0)).applyQuaternion(followed.object.quaternion);
      this.goalTarget.add(followed.object.position);
    } else {
      this.goalTarget.set(...site.target);
    }

    const snap = controls.snapCamera || controls.frozen;
    controls.snapCamera = false;
    const k = snap ? 1 : 1 - Math.exp(-Math.min(delta, 0.1) * DAMPING_PER_S);
    this.target.lerp(this.goalTarget, k);
    let dYaw = this.goal.yawDeg - this.cur.yawDeg;
    dYaw = ((((dYaw + 180) % 360) + 360) % 360) - 180;
    this.cur = {
      yawDeg: this.cur.yawDeg + dYaw * k,
      pitchDeg: this.cur.pitchDeg + (this.goal.pitchDeg - this.cur.pitchDeg) * k,
      distM: this.cur.distM * Math.pow(this.goal.distM / this.cur.distM, k),
    };

    // Scene space = absolute − floating origin.
    this.rel.copy(this.target).sub(shared.origin);
    orbitOffset(this.cur, this.tmp);
    camera.position.copy(this.rel).add(this.tmp);
    const minY = 2 - shared.origin.y;
    if (camera.position.y < minY) camera.position.y = minY;
    camera.lookAt(this.rel);

    const near = clamp(this.cur.distM / 400, 0.5, 50);
    const far = Math.max(60_000, this.cur.distM * 40 + this.target.y * 3);
    if (camera.near !== near || camera.far !== far || camera.fov !== CAMERA_FOV_DEG) {
      camera.near = near;
      camera.far = far;
      camera.fov = CAMERA_FOV_DEG;
      camera.updateProjectionMatrix();
    }
    shared.targetAbs.copy(this.target);
    shared.camDist = this.cur.distM;
  }
}

export function CameraSystem(props: CameraDeps) {
  const dom = useThree((s) => s.gl.domElement);
  const [ctrl] = useState(() => new CameraController(props));
  useEffect(() => ctrl.attach(dom), [ctrl, dom]);
  useFrame(({ camera }, delta) => ctrl.frame(camera, delta), CAMERA_PRIORITY);
  return null;
}
