// Render module public surface (consumed by src/app only).
export { Scene } from './Scene';
export type { SceneApi, SceneProps } from './Scene';
export { createRenderControls } from './controls';
export type { CameraOrbit, CameraRequest, RenderControls } from './controls';
export { createFrameInput } from './frame';
export type { FrameInput, RendererStats } from './frame';
export { MAX_SLOTS, SLOT_STRIDE, ANIM_STRIDE, SlotFlag, createRenderSnapshot } from './snapshot';
export type { RenderSnapshot, SnapshotIndex, SnapshotSlot } from './snapshot';
export { SUN_DIR, SUN_ROTATION_DEG } from './world/sun';
export { DEFAULT_SITE, SITE_VIEWS } from './world/sites';
