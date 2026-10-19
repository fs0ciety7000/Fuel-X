import { describe, expect, it } from 'vitest';
import { Object3D, PerspectiveCamera, Vector3 } from 'three';
import type { AssetName } from '../assets/generated';
import { createRenderControls } from '../controls';
import { createFrameShared } from '../frame';
import { EntityRegistry, createAnimBuffer } from '../registry';
import type { EntityHandle } from '../registry';
import { CameraRigCore } from './CameraRig';
import { CAMERA_LIMITS, CAMERA_MIN_HEIGHT_M } from './camera-math';

function handle(id: string, asset: AssetName, pos: Vector3, sockets: Record<string, Vector3> = {}): EntityHandle {
  const object = new Object3D();
  object.position.copy(pos);
  object.visible = true;
  return {
    id,
    slot: 0,
    object,
    info: { name: asset, sockets: new Map(Object.entries(sockets)) },
    asset,
    anim: createAnimBuffer(),
    lod: null,
  };
}

function setup() {
  const controls = createRenderControls('LC-1');
  const registry = new EntityRegistry();
  const shared = createFrameShared();
  const rig = new CameraRigCore({ controls, registry, shared });
  const camera = new PerspectiveCamera(30, 16 / 9, 1, 60_000);
  return { controls, registry, shared, rig, camera };
}

describe('CameraRigCore', () => {
  it('groups a transporter, its cargo booster and a ship on the booster into one stack', () => {
    const { registry, rig } = setup();
    const sp = handle('SP-41', 'transporter', new Vector3(100, 0, 0), { SOCKET_Cargo: new Vector3(0, 4.6, 0) });
    const b = handle('B-09', 'booster', new Vector3(100, 4.6, 0), { SOCKET_ShipMount: new Vector3(0, 71, 0) });
    const s = handle('S-21', 'ship', new Vector3(100, 75.6, 0));
    const far = handle('SP-42', 'transporter', new Vector3(140, 0, 0), { SOCKET_Cargo: new Vector3(0, 4.6, 0) });
    for (const h of [sp, b, s, far]) registry.add(h);
    expect(new Set(rig.stackOf(sp).map((h) => h.id))).toEqual(new Set(['SP-41', 'B-09', 'S-21']));
    expect(new Set(rig.stackOf(s).map((h) => h.id))).toEqual(new Set(['SP-41', 'B-09', 'S-21']));
    // ship lifted off: no longer part of the stack
    s.object.position.y += 10;
    expect(rig.stackOf(sp).map((h) => h.id)).toEqual(['SP-41', 'B-09']);
    expect(rig.stackOf(far).map((h) => h.id)).toEqual(['SP-42']);
  });

  it('snaps onto a followed entity, glides 700 ms on re-target and stays above ground', () => {
    const { controls, registry, shared, rig, camera } = setup();
    const a = handle('A', 'van', new Vector3(0, 0, 0), { SOCKET_Focus: new Vector3(0, 1, 0) });
    const b = handle('B', 'van', new Vector3(1000, 0, 0), { SOCKET_Focus: new Vector3(0, 1, 0) });
    registry.add(a);
    registry.add(b);
    controls.followId = 'A';
    controls.cameraRequest = { kind: 'orbit', yawDeg: 90, pitchDeg: 2, distM: 10 };
    controls.snapCamera = true;
    rig.frame(camera, 1 / 60);
    expect(shared.targetAbs.toArray()).toEqual([0, 1, 0]);
    expect(shared.camDist).toBe(CAMERA_LIMITS.distMinM);
    expect(camera.position.y).toBeGreaterThanOrEqual(CAMERA_MIN_HEIGHT_M - 1e-9);

    controls.followId = 'B';
    for (let i = 0; i < 7; i++) rig.frame(camera, 0.05); // half of the 700 ms glide (eased: midpoint)
    expect(shared.targetAbs.x).toBeCloseTo(500, 6);
    for (let i = 0; i < 7; i++) rig.frame(camera, 0.05);
    expect(shared.targetAbs.x).toBe(1000);
  });

  it('home drops the follow; frame fits the followed stack inside the distance clamps', () => {
    const { controls, registry, shared, rig, camera } = setup();
    const b = handle('B-09', 'booster', new Vector3(0, 20, 0), { SOCKET_Focus: new Vector3(0, 35, 0) });
    registry.add(b);
    controls.followId = 'B-09';
    controls.cameraRequest = { kind: 'frame' };
    controls.snapCamera = true;
    rig.frame(camera, 1 / 60);
    expect(shared.camDist).toBeGreaterThan(80);
    expect(shared.camDist).toBeLessThan(400);
    controls.cameraRequest = { kind: 'home' };
    controls.snapCamera = true;
    rig.frame(camera, 1 / 60);
    expect(controls.followId).toBeNull();
  });

  it('map-control nudges zoom and rotate the goal orbit inside the clamps', () => {
    const { controls, shared, rig, camera } = setup();
    controls.cameraRequest = { kind: 'orbit', yawDeg: 350, pitchDeg: 30, distM: 1000 };
    controls.snapCamera = true;
    rig.frame(camera, 1 / 60);
    expect(shared.camHeadingDeg).toBeCloseTo(170, 6);
    rig.nudge({ zoom: 0.5, yawDeg: 20 });
    controls.snapCamera = true;
    rig.frame(camera, 1 / 60);
    expect(shared.camDist).toBeCloseTo(500, 6);
    expect(shared.camHeadingDeg).toBeCloseTo(190, 6);
    rig.nudge({ zoom: 1e9 });
    controls.snapCamera = true;
    rig.frame(camera, 1 / 60);
    expect(shared.camDist).toBe(CAMERA_LIMITS.distMaxM);
    rig.nudge({ zoom: Number.NaN, yawDeg: Number.POSITIVE_INFINITY });
    controls.snapCamera = true;
    rig.frame(camera, 1 / 60);
    expect(shared.camDist).toBe(CAMERA_LIMITS.distMaxM);
  });

  it('reuses its stack array (no per-frame allocation while following)', () => {
    const { registry, rig } = setup();
    const b = handle('B-09', 'booster', new Vector3(0, 20, 0), { SOCKET_ShipMount: new Vector3(0, 71, 0) });
    registry.add(b);
    expect(rig.stackOf(b)).toBe(rig.stackOf(b));
  });
});
