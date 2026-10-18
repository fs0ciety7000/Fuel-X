// Final pass (priority > 0 takes rendering over from R3F): renders the frame, then records renderer.info for
// `__fuelx.stats()`. The single post EffectPass of 5.7 slots in here.
import { useFrame } from '@react-three/fiber';
import type { FrameShared } from '../frame';

export const RENDER_PASS_PRIORITY = 1;

export function RenderPass({ shared }: { shared: FrameShared }) {
  useFrame(({ gl, scene, camera }) => {
    gl.render(scene, camera);
    const info = gl.info;
    const s = shared.stats;
    s.drawCalls = info.render.calls;
    s.triangles = info.render.triangles;
    s.points = info.render.points;
    s.geometries = info.memory.geometries;
    s.textures = info.memory.textures;
    s.programs = info.programs?.length ?? 0;
    shared.frames++;
  }, RENDER_PASS_PRIORITY);
  return null;
}
