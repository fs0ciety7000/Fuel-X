// Placeholder ground + sea (5.1) until the point clouds of 5.3: flat unlit token colors that fade into the paper
// haze, plus a shadow-catcher overlay so only shadows darken the ground (like the Blender preview's catcher).
// The planes are re-centred under the camera target every frame and sized to the fog: kilometre-scale subdivided
// quads keep depth interpolation precise (a two-triangle 400 km plane z-fought the 0.5 m pad apron).
import { useFrame } from '@react-three/fiber';
import { tokens } from '@tokens/tokens';
import { useState } from 'react';
import { Color, Mesh, MeshBasicMaterial, PlaneGeometry, ShadowMaterial } from 'three';
import type { FrameShared } from '../frame';
import { siteView } from '../world/sites';
import { FOG } from './EnvironmentSystem';

export const GROUND_PRIORITY = -5;
/** Ground sits a hair under y = 0 so assets resting on 0 (aprons, kerbs) always win the depth test. */
const GROUND_Y = -0.05;
/** Shadow darkening on the ground: ink at this opacity (≈ the preview catcher's soft grey). */
const SHADOW_OPACITY = 0.16;
const SEGMENTS = 24;

/** Unit quad on XZ spanning x ∈ [0, 1], z ∈ [−0.5, 0.5], facing +Y. */
function unitQuad(): PlaneGeometry {
  return new PlaneGeometry(1, 1, SEGMENTS, SEGMENTS).rotateX(-Math.PI / 2).translate(0.5, 0, 0);
}

export class GroundController {
  readonly land: Mesh;
  readonly sea: Mesh;
  readonly catcher: Mesh;

  constructor(
    private readonly shared: FrameShared,
    private readonly coastX: number,
  ) {
    // Land = paper like the preview's shadow catcher; the darker groundBase belongs under the 5.3 scrub dots.
    const offset = { polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 };
    this.land = new Mesh(unitQuad(), new MeshBasicMaterial({ color: new Color(tokens.world.background), ...offset }));
    this.sea = new Mesh(unitQuad(), new MeshBasicMaterial({ color: new Color(tokens.world.seaBase), ...offset }));
    this.catcher = new Mesh(
      unitQuad(),
      new ShadowMaterial({
        color: new Color(tokens.color.ink),
        opacity: SHADOW_OPACITY,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 2,
      }),
    );
    this.land.name = 'GROUND_Land';
    this.sea.name = 'GROUND_Sea';
    this.catcher.name = 'GROUND_ShadowCatcher';
    this.land.renderOrder = this.sea.renderOrder = -2;
    this.catcher.receiveShadow = true;
    this.catcher.renderOrder = -1;
    for (const m of [this.land, this.sea, this.catcher]) m.frustumCulled = false;
  }

  frame(): void {
    const s = this.shared;
    const o = s.origin;
    const t = s.targetAbs;
    const r = Math.max(FOG.minFarM, s.camDist * FOG.farFactor) * 1.5;
    const y = GROUND_Y - o.y;
    // Snap the centre to 1 km so the quads don't swim under the dots of 5.3.
    const cx = Math.round(t.x / 1000) * 1000;
    const cz = Math.round(t.z / 1000) * 1000;
    const span = (mesh: Mesh, x0: number, x1: number, z: number, half: number): void => {
      mesh.visible = x1 > x0;
      if (!mesh.visible) return;
      mesh.position.set(x0 - o.x, y, z - o.z);
      mesh.scale.set(x1 - x0, 1, 2 * half);
    };
    span(this.land, cx - r, Math.min(this.coastX, cx + r), cz, r);
    span(this.sea, Math.max(this.coastX, cx - r), cx + r, cz, r);
    const c = Math.min(4_000, Math.max(400, s.camDist * 2));
    span(this.catcher, t.x - c, t.x + c, t.z, c);
  }
}

export function GroundSystem({ shared, siteId }: { shared: FrameShared; siteId: string }) {
  const [ground] = useState(() => new GroundController(shared, siteView(siteId).coastX));
  useFrame(() => ground.frame(), GROUND_PRIORITY);
  return (
    <group name="GROUND">
      <primitive object={ground.land} />
      <primitive object={ground.sea} />
      <primitive object={ground.catcher} />
    </group>
  );
}
