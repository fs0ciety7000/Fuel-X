// Lights, haze and the shadow map (5.1): sun = Blender preview sun (SUN_DIR), hemisphere fill paper/shadow-tint,
// linear fog to paper scaled with the camera distance, one 2048² directional shadow map whose box follows the
// camera target and is re-rendered only when something moves near it or the box/origin moves (§13.1).
import { useFrame, useThree } from '@react-three/fiber';
import { tokens } from '@tokens/tokens';
import { useEffect, useState } from 'react';
import { Color, DirectionalLight, Fog, HemisphereLight, Object3D, Vector3 } from 'three';
import type { Scene, WebGLRenderer } from 'three';
import type { FrameShared } from '../frame';
import { FILL_INTENSITY, SUN_DIR, SUN_INTENSITY } from '../world/sun';

export const ENVIRONMENT_PRIORITY = -10;
export const SHADOW_MAP_SIZE = 2048;
/** Shadow box half-size = camera distance × factor, clamped (m). */
export const SHADOW_BOX = { factor: 0.55, minM: 120, maxM: 900 } as const;
/** Linear fog to paper: start/end as multiples of the camera distance (end ≥ minFarM). */
export const FOG = { nearFactor: 1.1, farFactor: 14, minFarM: 6_000 } as const;

export class EnvironmentController {
  readonly sun = new DirectionalLight(new Color(tokens.world.sun), SUN_INTENSITY);
  readonly fill = new HemisphereLight(new Color(tokens.world.haze), new Color(tokens.world.shadowTint), FILL_INTENSITY);
  readonly fog = new Fog(new Color(tokens.world.haze), 1_000, 15_000);
  private readonly target = new Object3D();
  private readonly sunDir = new Vector3(...SUN_DIR);
  private readonly center = new Vector3(Infinity, 0, 0);
  private readonly origin = new Vector3(Infinity, 0, 0);
  private half = 0;

  constructor(private readonly shared: FrameShared) {
    this.sun.name = 'SUN';
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.4;
    this.sun.shadow.radius = 2;
    this.sun.target = this.target;
    this.fill.name = 'FILL';
  }

  mount(scene: Scene, gl: WebGLRenderer): () => void {
    scene.background = new Color(tokens.world.background);
    scene.fog = this.fog;
    scene.add(this.sun, this.target, this.fill);
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      scene.remove(this.sun, this.target, this.fill);
      scene.fog = null;
      scene.background = null;
    };
  }

  frame(gl: WebGLRenderer): void {
    const s = this.shared;
    const d = s.camDist;
    this.fog.near = d * FOG.nearFactor;
    this.fog.far = Math.max(FOG.minFarM, d * FOG.farFactor);

    const half = Math.min(SHADOW_BOX.maxM, Math.max(SHADOW_BOX.minM, d * SHADOW_BOX.factor));
    // Snap the box centre to whole shadow texels (absolute coords) so a gliding camera doesn't shimmer.
    const texel = (2 * half) / SHADOW_MAP_SIZE;
    const cx = Math.round(s.targetAbs.x / texel) * texel;
    const cz = Math.round(s.targetAbs.z / texel) * texel;
    const cy = Math.max(0, s.targetAbs.y - half * 0.25);
    const boxMoved = half !== this.half || cx !== this.center.x || cy !== this.center.y || cz !== this.center.z;
    if (boxMoved) {
      this.half = half;
      this.center.set(cx, cy, cz);
      const cam = this.sun.shadow.camera;
      cam.left = -half;
      cam.right = half;
      cam.top = half;
      cam.bottom = -half;
      cam.near = 1;
      cam.far = half * 6;
      cam.updateProjectionMatrix();
    }
    // Scene space = absolute − floating origin.
    const o = s.origin;
    this.target.position.set(cx - o.x, cy - o.y, cz - o.z);
    this.sun.position.copy(this.target.position).addScaledVector(this.sunDir, half * 3);
    this.target.updateMatrixWorld();
    // The shadow matrix lives in scene space, so a floating-origin shift also needs a re-render.
    const originMoved = !this.origin.equals(o);
    this.origin.copy(o);
    if (boxMoved || originMoved || s.movedNear) gl.shadowMap.needsUpdate = true;
  }
}

export function EnvironmentSystem({ shared }: { shared: FrameShared }) {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const [env] = useState(() => new EnvironmentController(shared));
  useEffect(() => env.mount(scene, gl), [env, scene, gl]);
  useFrame(({ gl: renderer }) => env.frame(renderer), ENVIRONMENT_PRIORITY);
  return null;
}
