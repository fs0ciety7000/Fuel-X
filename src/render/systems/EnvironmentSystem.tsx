// Lights, haze and the shadow map (5.1): sun = Blender preview sun (SUN_DIR), hemisphere fill paper/shadow-tint,
// linear fog to paper scaled with the camera distance, one 2048² directional shadow map whose box follows the
// camera target and is re-rendered only when something moves near it or the box moves (§13.1).
import { useFrame, useThree } from '@react-three/fiber';
import { tokens } from '@tokens/tokens';
import { useEffect, useMemo } from 'react';
import { Color, DirectionalLight, Fog, HemisphereLight, Object3D, Vector3 } from 'three';
import type { FrameShared } from '../frame';
import { FILL_INTENSITY, SUN_DIR, SUN_INTENSITY } from '../world/sun';

export const ENVIRONMENT_PRIORITY = -10;
export const SHADOW_MAP_SIZE = 2048;
/** Shadow box half-size = camera distance × this, clamped (m). */
const SHADOW_BOX = { factor: 0.55, minM: 120, maxM: 900 } as const;
/** Linear fog: start/end as multiples of the camera distance (+ floor), ending in paper. */
export const FOG = { nearFactor: 1.1, farFactor: 14, minFarM: 6_000 } as const;

export function EnvironmentSystem({ shared }: { shared: FrameShared }) {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const env = useMemo(() => {
    const sun = new DirectionalLight(new Color(tokens.world.sun), SUN_INTENSITY);
    sun.name = 'SUN';
    sun.castShadow = true;
    sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.4;
    const target = new Object3D();
    sun.target = target;
    const fill = new HemisphereLight(
      new Color(tokens.world.haze),
      new Color(tokens.world.shadowTint),
      FILL_INTENSITY,
    );
    fill.name = 'FILL';
    const fog = new Fog(new Color(tokens.world.haze), 1_000, 15_000);
    return { sun, target, fill, fog, half: 0, center: new Vector3(Infinity, 0, 0), origin: new Vector3(Infinity, 0, 0), sunDir: new Vector3(...SUN_DIR) };
  }, []);

  useEffect(() => {
    scene.background = new Color(tokens.world.background);
    scene.fog = env.fog;
    scene.add(env.sun, env.target, env.fill);
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      scene.remove(env.sun, env.target, env.fill);
      scene.fog = null;
      scene.background = null;
    };
  }, [scene, gl, env]);

  useFrame(() => {
    const d = shared.camDist;
    env.fog.near = d * FOG.nearFactor;
    env.fog.far = Math.max(FOG.minFarM, d * FOG.farFactor);

    const half = Math.min(SHADOW_BOX.maxM, Math.max(SHADOW_BOX.minM, d * SHADOW_BOX.factor));
    // Snap the box centre to whole shadow texels (absolute coords) so a gliding camera doesn't shimmer.
    const texel = (2 * half) / SHADOW_MAP_SIZE;
    const cx = Math.round(shared.targetAbs.x / texel) * texel;
    const cz = Math.round(shared.targetAbs.z / texel) * texel;
    const cy = Math.max(0, shared.targetAbs.y - half * 0.25);
    const boxMoved = half !== env.half || cx !== env.center.x || cy !== env.center.y || cz !== env.center.z;
    if (boxMoved) {
      env.half = half;
      env.center.set(cx, cy, cz);
      const cam = env.sun.shadow.camera;
      cam.left = -half;
      cam.right = half;
      cam.top = half;
      cam.bottom = -half;
      cam.near = 1;
      cam.far = half * 6;
      cam.updateProjectionMatrix();
    }
    // Scene space = absolute − floating origin.
    const o = shared.origin;
    env.target.position.set(cx - o.x, cy - o.y, cz - o.z);
    env.sun.position.copy(env.target.position).addScaledVector(env.sunDir, half * 3);
    env.target.updateMatrixWorld();
    // The shadow matrix lives in scene space, so a floating-origin shift also needs a re-render.
    const originMoved = !env.origin.equals(o);
    env.origin.copy(o);
    if (boxMoved || originMoved || shared.movedNear) gl.shadowMap.needsUpdate = true;
  }, ENVIRONMENT_PRIORITY);

  return null;
}
