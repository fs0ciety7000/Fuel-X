// Interim orbit-limited camera (the full rig with focus/frame transitions is 5.5): narrow FOV, high oblique,
// damped follow of the followed entity's SOCKET_Focus, presets (home / frame / explicit orbit), drag to orbit,
// wheel to zoom, clamped to the strategic range and never below ground.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { PerspectiveCamera, Vector3 } from 'three';
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

interface Props {
  controls: RenderControls;
  registry: EntityRegistry;
  shared: FrameShared;
}

export function CameraSystem({ controls, registry, shared }: Props) {
  const camera = useThree((s) => s.camera);
  const dom = useThree((s) => s.gl.domElement);
  const st = useMemo(() => {
    const home = siteView(controls.siteId);
    return {
      cur: { ...home.home },
      goal: { ...home.home },
      target: new Vector3(...home.target),
      goalTarget: new Vector3(),
      tmp: new Vector3(),
      rel: new Vector3(),
    };
  }, [controls]);

  // Drag = orbit, wheel = zoom (writes the goal; the frame loop glides toward it).
  useEffect(() => {
    let drag: { x: number; y: number } | null = null;
    const down = (e: PointerEvent): void => {
      drag = { x: e.clientX, y: e.clientY };
      dom.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent): void => {
      if (!drag) return;
      st.goal = clampOrbit({
        ...st.goal,
        yawDeg: st.goal.yawDeg - (e.clientX - drag.x) * 0.25,
        pitchDeg: st.goal.pitchDeg + (e.clientY - drag.y) * 0.2,
      });
      drag = { x: e.clientX, y: e.clientY };
    };
    const up = (e: PointerEvent): void => {
      drag = null;
      if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId);
    };
    const wheel = (e: WheelEvent): void => {
      e.preventDefault();
      st.goal = clampOrbit({ ...st.goal, distM: st.goal.distM * Math.exp(e.deltaY * 0.001) });
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
  }, [dom, st]);

  useFrame((_, delta) => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const site = siteView(controls.siteId);
    const followed = controls.followId ? registry.byId.get(controls.followId) : undefined;

    const req = controls.cameraRequest;
    if (req) {
      if (req.kind === 'home') st.goal = { ...site.home };
      else if (req.kind === 'orbit') st.goal = clampOrbit(req);
      else if (followed && isAssetName(followed.info.name)) {
        const b = ASSETS[followed.info.name].bounds;
        const r = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2;
        const half = ((CAMERA_FOV_DEG / 2) * Math.PI) / 180;
        st.goal = clampOrbit({ ...st.goal, distM: (r / Math.sin(half)) * FRAME_MARGIN });
      }
      controls.cameraRequest = null;
    }

    // Goal target: followed SOCKET_Focus (rotated with the entity), else the site home target.
    if (followed?.object.visible) {
      const focus = followed.info.sockets.get(FOCUS);
      st.goalTarget.copy(focus ?? st.tmp.set(0, 0, 0)).applyQuaternion(followed.object.quaternion);
      st.goalTarget.add(followed.object.position);
    } else {
      st.goalTarget.set(...site.target);
    }

    const snap = controls.snapCamera || controls.frozen;
    controls.snapCamera = false;
    const k = snap ? 1 : 1 - Math.exp(-Math.min(delta, 0.1) * DAMPING_PER_S);
    st.target.lerp(st.goalTarget, k);
    let dYaw = st.goal.yawDeg - st.cur.yawDeg;
    dYaw = ((((dYaw + 180) % 360) + 360) % 360) - 180;
    st.cur = {
      yawDeg: st.cur.yawDeg + dYaw * k,
      pitchDeg: st.cur.pitchDeg + (st.goal.pitchDeg - st.cur.pitchDeg) * k,
      distM: st.cur.distM * Math.pow(st.goal.distM / st.cur.distM, k),
    };

    // Scene space = absolute − floating origin.
    st.rel.copy(st.target).sub(shared.origin);
    orbitOffset(st.cur, st.tmp);
    camera.position.copy(st.rel).add(st.tmp);
    const minY = 2 - shared.origin.y;
    if (camera.position.y < minY) camera.position.y = minY;
    camera.lookAt(st.rel);

    const near = clamp(st.cur.distM / 400, 0.5, 50);
    const far = Math.max(60_000, st.cur.distM * 40 + st.target.y * 3);
    if (camera.near !== near || camera.far !== far || camera.fov !== CAMERA_FOV_DEG) {
      camera.near = near;
      camera.far = far;
      camera.fov = CAMERA_FOV_DEG;
      camera.updateProjectionMatrix();
    }
    shared.targetAbs.copy(st.target);
    shared.camDist = st.cur.distM;
  }, CAMERA_PRIORITY);

  return null;
}
