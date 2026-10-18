// Placeholder ground + sea (5.1) until the point clouds of 5.3: flat unlit token colors that fade into the paper
// haze, plus a shadow-catcher overlay so only shadows darken the ground (like the Blender preview's catcher).
import { tokens } from '@tokens/tokens';
import { useMemo } from 'react';
import { Color, MeshBasicMaterial, PlaneGeometry, ShadowMaterial } from 'three';
import { siteView } from './sites';

/** Half-extent of the placeholder planes, m (covers the 68 km downrange flight at the fog limit). */
const EXTENT_M = 200_000;
/** Shadow darkening on the ground: ink at this opacity (≈ the preview catcher's soft grey). */
const SHADOW_OPACITY = 0.16;

export function Ground({ siteId }: { siteId: string }) {
  const coastX = siteView(siteId).coastX;
  const res = useMemo(() => {
    const landW = EXTENT_M + coastX;
    const seaW = EXTENT_M - coastX;
    return {
      land: new PlaneGeometry(landW, 2 * EXTENT_M).rotateX(-Math.PI / 2).translate(coastX - landW / 2, 0, 0),
      sea: new PlaneGeometry(seaW, 2 * EXTENT_M).rotateX(-Math.PI / 2).translate(coastX + seaW / 2, 0, 0),
      catcher: new PlaneGeometry(2 * EXTENT_M, 2 * EXTENT_M).rotateX(-Math.PI / 2),
      landMat: new MeshBasicMaterial({ color: new Color(tokens.world.groundBase) }),
      seaMat: new MeshBasicMaterial({ color: new Color(tokens.world.seaBase) }),
      catcherMat: new ShadowMaterial({
        color: new Color(tokens.color.ink),
        opacity: SHADOW_OPACITY,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -4,
      }),
    };
  }, [coastX]);

  return (
    <group name="GROUND">
      <mesh geometry={res.land} material={res.landMat} renderOrder={-2} />
      <mesh geometry={res.sea} material={res.seaMat} renderOrder={-2} />
      <mesh geometry={res.catcher} material={res.catcherMat} receiveShadow renderOrder={-1} />
    </group>
  );
}
