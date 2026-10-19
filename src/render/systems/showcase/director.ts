// Per-frame driver of the showcase set (ARCHITECTURE §2 pattern: a controller object owned by one component and
// updated from useFrame). Applies pose.ts to the cloned GLB scenes, the exhaust/steam FX and the camera.
import {
  ConeGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Vector3,
} from 'three';
import type { Camera } from 'three';
import { tokens } from '@tokens/tokens';
import { TOWER } from '../../assets/generated';
import { createPose, stagePose } from './pose';

const w = tokens.world;
/** Look-point shift along the camera's right axis, × distance (subject sits left of the telemetry card). */
const FRAME_SHIFT = 0.09;
const STEAM_PUFFS = 26;

/** Deterministic hash → [0, 1) for FX scatter (render-side, not sim RNG). */
export const hash = (i: number): number => {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

export interface SetObjects {
  tower: Object3D;
  booster: Object3D;
  ship: Object3D;
  transporter: Object3D;
  tanker: Object3D;
  boat: Object3D;
}

function plume(): Group {
  const g = new Group();
  const outer = new Mesh(
    new ConeGeometry(4.4, 1, 24, 1, true),
    new MeshBasicMaterial({ color: w.exhaustGlow, fog: false }),
  );
  outer.position.y = -0.5;
  outer.rotation.x = Math.PI;
  const core = new Mesh(
    new ConeGeometry(4.4, 1, 18, 1, true),
    new MeshBasicMaterial({ color: w.exhaustCore, fog: false }),
  );
  core.position.y = -0.32;
  core.rotation.x = Math.PI;
  core.scale.set(0.55, 0.64, 0.55);
  g.add(outer, core);
  g.visible = false;
  return g;
}

export class StageDirector {
  readonly plume = plume();
  readonly steam = new InstancedMesh(
    new IcosahedronGeometry(1, 1),
    new MeshLambertMaterial({ color: w.steam, flatShading: true }),
    STEAM_PUFFS,
  );
  private readonly pose = createPose();
  private readonly eye = new Vector3();
  private readonly look = new Vector3();
  private readonly aim = new Vector3();
  private readonly side = new Vector3();
  private readonly dummy = new Object3D();
  private readonly carriage: Object3D | undefined;
  private readonly carriageBase: number;
  private readonly armL: Object3D | undefined;
  private readonly armR: Object3D | undefined;
  private readonly qd: Object3D | undefined;
  private primed = false;

  constructor(private readonly o: SetObjects) {
    const node = (n: string): Object3D | undefined => o.tower.getObjectByName(n) ?? undefined;
    this.carriage = node(TOWER.nodes.Carriage);
    this.carriageBase = this.carriage ? this.carriage.position.y - TOWER.anim.Carriage.rest : 0;
    this.armL = node(TOWER.nodes.ArmL);
    this.armR = node(TOWER.nodes.ArmR);
    this.qd = node(TOWER.nodes.QDArm);
    this.steam.frustumCulled = false;
    this.steam.visible = false;
  }

  /** Next frame snaps the camera (no damping), e.g. after a reduced-motion toggle. */
  reset(): void {
    this.primed = false;
  }

  frame(p: number, t: number, dt: number, camera: Camera, reduced: boolean): void {
    const { o, pose } = this;
    stagePose(p, pose);

    o.transporter.position.set(pose.transporter.x, 0, pose.transporter.z);
    o.booster.position.set(pose.booster.x, pose.booster.y, pose.booster.z);
    o.booster.visible = pose.boosterVisible;
    o.ship.position.set(pose.ship.x, pose.ship.y, pose.ship.z);
    o.ship.visible = pose.shipVisible;
    if (this.carriage) this.carriage.position.y = this.carriageBase + pose.carriageM;
    if (this.armL) this.armL.rotation.y = pose.armsRad;
    if (this.armR) this.armR.rotation.y = -pose.armsRad;
    if (this.qd) this.qd.rotation.y = pose.qdRad;

    const flicker = reduced ? 1 : 0.92 + 0.08 * Math.sin(t * 41) * Math.sin(t * 17);
    const len = pose.thrust > 0 ? pose.thrust * 70 * flicker : pose.landing * 26 * flicker;
    const width = pose.thrust > 0 ? 1 : 0.55;
    this.plume.visible = len > 0.5 && o.booster.visible;
    this.plume.position.copy(o.booster.position);
    this.plume.scale.set(width, len, width);
    this.updateSteam(pose.steam);

    // Background logistics keep moving (time-driven, frozen with reduced motion).
    const loop = reduced ? 0.35 : (t * 0.018) % 1;
    o.tanker.position.set(-520 + loop * 480, 0, 150);
    o.tanker.rotation.y = Math.PI / 2;
    const a = reduced ? 1 : t * 0.03;
    o.boat.position.set(900 + Math.cos(a) * 260, 0, -420 + Math.sin(a) * 260);
    o.boat.rotation.y = -a;

    // Camera: damped toward the pose (the scene glides, the page scroll stays native).
    const drift = reduced || p > 0.12 ? 0 : Math.sin(t * 0.12) * 30;
    const k = reduced || !this.primed ? 1 : 1 - Math.exp(-dt * 5);
    this.aim.set(pose.camera.x + drift, pose.camera.y, pose.camera.z - drift);
    this.eye.lerp(this.aim, k);
    this.aim.set(pose.target.x, pose.target.y, pose.target.z);
    this.look.lerp(this.aim, k);
    this.primed = true;
    camera.position.copy(this.eye);
    // The telemetry card sits top-right over the stage, so the subject sits left of centre; in the hero (p ≈ 0) the
    // macro title overlaps the stage's left edge, so it sits right instead.
    const shift = FRAME_SHIFT * (2 * Math.min(1, p / 0.12) - 1);
    this.aim.subVectors(this.look, this.eye);
    this.side
      .crossVectors(this.aim, camera.up)
      .normalize()
      .multiplyScalar(this.aim.length() * shift);
    camera.lookAt(this.aim.add(this.eye).add(this.side));
  }

  private updateSteam(s: number): void {
    const { steam, dummy } = this;
    steam.visible = s > 0.001;
    if (!steam.visible) return;
    for (let i = 0; i < STEAM_PUFFS; i += 1) {
      // Puffs roll out of the flame trench (+z) and around the mount.
      const a = (i / STEAM_PUFFS) * Math.PI * 1.2 - Math.PI * 0.1 + hash(i) * 0.3;
      const r = 12 + s * (40 + hash(i + 3) * 70);
      dummy.position.set(Math.sin(a) * r * 0.7, 6 + hash(i + 5) * 18 * s, 18 + Math.cos(a) * r);
      dummy.scale.setScalar(4 + s * (10 + hash(i + 9) * 14));
      dummy.updateMatrix();
      steam.setMatrixAt(i, dummy.matrix);
    }
    steam.instanceMatrix.needsUpdate = true;
  }
}
