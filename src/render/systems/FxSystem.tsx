// FxSystem (5.6): exhaust plumes, deluge steam / water, wakes + hull foam, ground rings. Three draws at most
// (FX_Plume, FX_Steam points; FX_Zones instanced rings), each hidden when idle; ≤ 20 k sprites by construction
// (FX_CAPACITY). Reads the interpolated poses / channels RenderSync wrote into the registry handles, the follow
// target from the controls; never mutates sim state. Time: its own VisualClock (frozen under freezeVisuals, like the
// sea), deluge timeline from the pad's T-clock channel (sim time). Per frame: uniforms only, no allocations.
import { useFrame, useThree } from '@react-three/fiber';
import { tokens } from '@tokens/tokens';
import { useEffect, useState } from 'react';
import { Color, PerspectiveCamera, Vector3 } from 'three';
import type { Camera, Scene, WebGLRenderer, Quaternion } from 'three';
import { ASSETS } from '../assets/generated';
import type { AssetName } from '../assets/generated';
import { useAssetLods } from '../assets/useAsset';
import type { AssetInfo } from '../assets/useAsset';
import type { RenderControls } from '../controls';
import type { FrameShared } from '../frame';
import { PlumeFx } from '../fx/plume';
import { RECOVERY_RINGS_M, RECOVERY_SWEEP_S, ZONE_STROKE_PX, litCount, selectionRadiusM } from '../fx/params';
import { SteamFx } from '../fx/steam';
import { ZoneFx } from '../fx/zones';
import type { EntityHandle, EntityRegistry } from '../registry';
import { ANIM, ANIM_STRIDE, RECOVERY_ZONE } from '../snapshot';
import type { RenderSnapshot } from '../snapshot';
import { VisualClock } from '../world/visual-clock';
import { SUN_DIR } from '../world/sun';

export const FX_PRIORITY = -7;

/** Steam drift: the prevailing breeze (anim-writer WIND_FROM_RAD, 95°) carries the cloud west, m/s. */
const WIND_DRIFT_MPS = 2.5;
const WIND_TO_RAD = ((95 + 180) * Math.PI) / 180;
/** A channel jump larger than this within one tick is a reset (new count, jump): use `curr`, never sweep through. */
const CHANNEL_JUMP_S = 2;
/** Selection ring only under entities near the ground (not a booster in flight), m. */
const SELECTION_MAX_Y_M = 30;
/** Ring heights above the entity base / sea, m (above the 0.5 m apron and the wave dots). */
const RING_LIFT_M = 0.9;

function engineSockets(info: AssetInfo): Vector3[] {
  const out: Vector3[] = [];
  for (let i = 1; i <= 99; i++) {
    const s = info.sockets.get(`SOCKET_Engine_${String(i).padStart(2, '0')}`);
    if (!s) break;
    out.push(s);
  }
  return out;
}

function socketZ(info: AssetInfo, name: string, fallback: number): number {
  return info.sockets.get(name)?.z ?? fallback;
}

const BOATS = ['boat_range', 'vessel_recovery'] as const;

const yawOf = (q: Quaternion): number => Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));

export interface FxDeps {
  controls: RenderControls;
  registry: EntityRegistry;
  shared: FrameShared;
  snapshot: RenderSnapshot;
}

interface FxAssets {
  booster: AssetInfo;
  ship: AssetInfo;
  pad: AssetInfo;
  boat: AssetInfo;
  vessel: AssetInfo;
}

export class FxCore {
  readonly plume: PlumeFx;
  readonly steam: SteamFx;
  readonly zones = new ZoneFx();
  private readonly clock = new VisualClock();
  private readonly pos = new Vector3();
  private readonly one = new Vector3(1, 1, 1);
  private readonly sunView = new Vector3();
  private readonly sun = new Vector3(...SUN_DIR);
  private readonly selColor = new Color(tokens.world.selectionRing);
  private readonly recColor = new Color(tokens.world.zoneRecovery);
  private readonly hazColor = new Color(tokens.world.zoneHazard);
  private readonly hull: Record<'boat_range' | 'vessel_recovery', { stern: number; bow: number; half: number }>;
  private byKind = new Map<AssetName, EntityHandle[]>();
  private seen = -1;

  constructor(
    private readonly d: FxDeps,
    a: FxAssets,
  ) {
    this.plume = new PlumeFx(engineSockets(a.booster), engineSockets(a.ship));
    const deluge: Vector3[] = [];
    for (let i = 1; i <= 4; i++) {
      const s = a.pad.sockets.get(`SOCKET_Deluge_0${i}`);
      if (s) deluge.push(s);
    }
    this.steam = new SteamFx({ deluge, trench: a.pad.sockets.get('SOCKET_FlameTrench') ?? new Vector3(0, 1, 48) });
    const hullOf = (info: AssetInfo, name: AssetName, len: number) => ({
      stern: socketZ(info, 'SOCKET_Wake', -len / 2),
      bow: socketZ(info, 'SOCKET_Bow', len / 2),
      half: ASSETS[name].bounds.max[0],
    });
    this.hull = {
      boat_range: hullOf(a.boat, 'boat_range', 24),
      vessel_recovery: hullOf(a.vessel, 'vessel_recovery', 68),
    };
  }

  mount(scene: Scene): () => void {
    scene.add(this.plume.points, this.steam.points, this.zones.mesh);
    return () => {
      scene.remove(this.plume.points, this.steam.points, this.zones.mesh);
      this.plume.dispose();
      this.steam.dispose();
      this.zones.dispose();
    };
  }

  private list(asset: AssetName): readonly EntityHandle[] {
    return this.byKind.get(asset) ?? [];
  }

  /** Channel `k` of `h`, interpolated unless the tick jumped (then the current tick's value). */
  private channel(h: EntityHandle, k: number): number {
    const { snapshot } = this.d;
    const i = h.slot * ANIM_STRIDE + k;
    const p = snapshot.animPrev[i] ?? 0;
    const c = snapshot.animCurr[i] ?? 0;
    return Math.abs(c - p) > CHANNEL_JUMP_S ? c : (h.anim[k] ?? 0);
  }

  private scenePos(h: EntityHandle): Vector3 {
    return this.pos.copy(h.object.position).sub(this.d.shared.origin);
  }

  frame(camera: Camera, gl: WebGLRenderer, delta: number): void {
    const { registry, controls, shared } = this.d;
    if (registry.version !== this.seen) {
      this.seen = registry.version;
      this.byKind = new Map();
      for (const h of registry.byId.values()) {
        const l = this.byKind.get(h.asset) ?? [];
        l.push(h);
        this.byKind.set(h.asset, l);
      }
    }
    const t = this.clock.frame(controls, delta);
    const fov = camera instanceof PerspectiveCamera ? camera.fov : 30;
    const hPx = gl.domElement.height;
    const tanHalf = Math.tan(((fov / 2) * Math.PI) / 180);
    const pxScale = hPx / (2 * tanHalf);
    const dpr = gl.getPixelRatio();

    // Exhaust: first burning booster and ship.
    let boosterSet = false;
    for (const h of this.list('booster')) {
      if (!h.object.visible) continue;
      const lit = litCount(h.anim[ANIM.booster.litFrac] ?? 0, 33);
      if (lit <= 0) continue;
      this.plume.setStage(0, this.scenePos(h), h.object.quaternion, lit, h.object.position.y, this.one);
      boosterSet = true;
      break;
    }
    if (!boosterSet) this.plume.setStage(0, this.pos.set(0, 0, 0), camera.quaternion, 0, 0, this.one);
    let shipSet = false;
    for (const h of this.list('ship')) {
      if (!h.object.visible) continue;
      const lit = litCount(h.anim[ANIM.ship.litFrac] ?? 0, 6);
      if (lit <= 0) continue;
      this.plume.setStage(1, this.scenePos(h), h.object.quaternion, lit, h.object.position.y, this.one);
      shipSet = true;
      break;
    }
    if (!shipSet) this.plume.setStage(1, this.pos.set(0, 0, 0), camera.quaternion, 0, 0, this.one);
    this.plume.frame(t, pxScale);

    // Pad deluge / steam (first pad on the site).
    let pad: EntityHandle | undefined;
    for (const h of this.list('pad')) {
      if (h.object.visible) {
        pad = h;
        break;
      }
    }
    if (pad) {
      const tS = this.channel(pad, ANIM.pad.delugeS);
      const wx = Math.sin(WIND_TO_RAD) * WIND_DRIFT_MPS;
      const wz = -Math.cos(WIND_TO_RAD) * WIND_DRIFT_MPS;
      this.steam.setPad(this.scenePos(pad), pad.object.quaternion, tS, wx, wz, this.one);
    } else this.steam.clearPad();

    // Wakes + hull foam.
    this.steam.beginBoats();
    for (const asset of BOATS) {
      const hull = this.hull[asset];
      const speedK = asset === 'boat_range' ? ANIM.boat_range.speedMPerS : ANIM.vessel_recovery.speedMPerS;
      for (const h of this.list(asset)) {
        if (!h.object.visible) continue;
        const p = this.scenePos(h);
        const speed = h.anim[speedK] ?? 0;
        this.steam.addBoat(p.x, p.y, p.z, yawOf(h.object.quaternion), speed, hull.stern, hull.bow, hull.half);
      }
    }
    camera.updateMatrixWorld();
    this.sunView.copy(this.sun).transformDirection(camera.matrixWorldInverse);
    this.steam.frame(t, pxScale, this.sunView);

    // Rings.
    const z = this.zones;
    z.begin();
    const strong = ZONE_STROKE_PX.strong * dpr;
    const fine = ZONE_STROKE_PX.fine * dpr;
    const followed = controls.followId ? registry.byId.get(controls.followId) : undefined;
    if (followed?.object.visible && followed.object.position.y <= SELECTION_MAX_Y_M) {
      const p = this.scenePos(followed);
      const r = selectionRadiusM(ASSETS[followed.asset].bounds);
      const y = p.y + RING_LIFT_M;
      z.add(p.x, y, p.z, r, strong, 0, 0, this.selColor);
      // inner stroke: 36 dashes stepping an eighth of a dash every 0.25 s (mechanical, not smooth)
      const phase = (Math.floor(t / 0.25) % 8) * 0.125;
      z.add(p.x, y, p.z, r * 0.86, fine, 36, phase, this.selColor);
    }
    for (const h of this.list('vessel_recovery')) {
      if (!h.object.visible) continue;
      const mode = Math.round(h.anim[ANIM.vessel_recovery.zoneMode] ?? 0);
      if (mode === RECOVERY_ZONE.OFF) continue;
      const p = this.scenePos(h);
      const y = p.y + RING_LIFT_M;
      const outer = RECOVERY_RINGS_M[RECOVERY_RINGS_M.length - 1] ?? 450;
      if (mode === RECOVERY_ZONE.ACTIVE) {
        for (const r of RECOVERY_RINGS_M) {
          z.add(p.x, y, p.z, r, strong, 0, 0, this.recColor);
        }
        const sweep = outer * ((t / RECOVERY_SWEEP_S) % 1);
        z.add(p.x, y, p.z, Math.max(1, sweep), fine, 0, 0, this.recColor);
      } else {
        z.add(p.x, y, p.z, outer, fine, 48, 0, this.recColor);
      }
    }
    if (pad) {
      const r = this.channel(pad, ANIM.pad.hazardM);
      if (r > 1) {
        const p = this.scenePos(pad);
        // dashed 4:4 — dash count scales with the circumference (≈ 80 m per dash pair)
        const dashes = Math.max(24, Math.round((2 * Math.PI * r) / 80));
        z.add(p.x, p.y + RING_LIFT_M, p.z, r, fine, dashes, 0, this.hazColor);
      }
    }
    z.end((2 * tanHalf) / hPx);

    shared.stats.particles = this.plume.liveEstimate() + this.steam.liveEstimate();
  }
}

function FxRunner({ deps, assets }: { deps: FxDeps; assets: FxAssets }) {
  const scene = useThree((s) => s.scene);
  const [core] = useState(() => new FxCore(deps, assets));
  useEffect(() => core.mount(scene), [core, scene]);
  useFrame(({ camera, gl }, delta) => core.frame(camera, gl, delta), FX_PRIORITY);
  return null;
}

/** Suspends until the emitter assets are loaded (their sockets place the emitters). */
export function FxSystem(props: FxDeps) {
  const assets: FxAssets = {
    booster: useAssetLods('booster').info,
    ship: useAssetLods('ship').info,
    pad: useAssetLods('pad').info,
    boat: useAssetLods('boat_range').info,
    vessel: useAssetLods('vessel_recovery').info,
  };
  return <FxRunner deps={props} assets={assets} />;
}
