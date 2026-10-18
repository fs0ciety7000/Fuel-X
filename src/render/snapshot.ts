// RenderSnapshot — the per-tick transform hand-off from the sim side to RenderSync (ARCHITECTURE §3, §6).
// Plain typed arrays + a small index object: structured-clone / transfer safe, so a worker SimHost can post it.
// Written once per sim tick by the app-side writer (src/app/sim-host/snapshot-writer.ts), read every frame by
// src/render/systems/RenderSync. Positions are float64: the floating origin (§14 risk 4) subtracts the followed
// entity's position *before* the float32 conversion three does for the GPU, so 68 km downrange stays jitter-free.
import type { AssetKey, Id, Kind, SiteId } from '@sim/types';

/** Floats per slot in `prev` / `curr`: x y z qx qy qz qw flags. */
export const SLOT_STRIDE = 8;
/** Floats per slot in `anim` (per-class channels, filled by 5.4). */
export const ANIM_STRIDE = 8;
/** ARCHITECTURE §13.3 entity capacity. */
export const MAX_SLOTS = 4096;

/** Bits in the `flags` float (exact for small integers). */
export const SlotFlag = {
  /** Slot holds a live entity. */
  ALIVE: 1,
  /** Teleport this tick (spawn, attach change, jump): prev = curr, never interpolate across it. */
  SNAP: 2,
  /** Entity exists but is not drawn (tanker off-map, lost stage). */
  HIDDEN: 4,
  /** Stage stands on the launch mount: render lifts it by PAD `SOCKET_VehicleMount`. */
  ON_MOUNT: 8,
  /** Stage rides a transporter: render lifts it by TRANSPORTER `SOCKET_Cargo`. */
  ON_CARGO: 16,
} as const;

export interface SnapshotSlot {
  slot: number;
  id: Id;
  kind: Kind;
  asset: AssetKey;
  siteId: SiteId;
  callSign: string;
}

/** Changes only on spawn / despawn / load — the only thing React views subscribe to. */
export interface SnapshotIndex {
  version: number;
  slots: readonly SnapshotSlot[];
}

export interface RenderSnapshot {
  /** Tick whose end state is in `curr` (= world.tick after the step). */
  tick: number;
  /** Highest used slot + 1: readers and copies only touch [0, used). */
  used: number;
  prev: Float64Array;
  curr: Float64Array;
  animPrev: Float32Array;
  animCurr: Float32Array;
  index: SnapshotIndex;
}

export function createRenderSnapshot(maxSlots: number = MAX_SLOTS): RenderSnapshot {
  return {
    tick: 0,
    used: 0,
    prev: new Float64Array(maxSlots * SLOT_STRIDE),
    curr: new Float64Array(maxSlots * SLOT_STRIDE),
    animPrev: new Float32Array(maxSlots * ANIM_STRIDE),
    animCurr: new Float32Array(maxSlots * ANIM_STRIDE),
    index: { version: 0, slots: [] },
  };
}

export function hasFlag(flags: number, bit: number): boolean {
  return (flags & bit) !== 0;
}
