// Writes the RenderSnapshot from the world at the end of every tick (ARCHITECTURE §3/§6, task 5.2).
// Adapter in src/app because src/sim is owned by the simulation agent: ARCHITECTURE §4 step 10 plans the write
// inside the sim's bookkeeping; this keeps the same contract (prev/curr typed arrays, index bumps on spawn/despawn)
// and can move there unchanged. Discrete state → flag bits (attachment, visibility); never interpolated.
import type { Entity, Id, World } from '@sim/types';
import { ANIM_STRIDE, SLOT_STRIDE, SlotFlag } from '@render/snapshot';
import type { RenderSnapshot, SnapshotSlot } from '@render/snapshot';

/** A move longer than this in one tick is a teleport (fastest sim body ≈ 1.6 km/s ≈ 53 m/tick). */
const TELEPORT_M = 250;

const MOUNT_STATES: ReadonlySet<string> = new Set([
  'STACKING',
  'STACKED',
  'LOADING',
  'LOADED',
  'DETANKING',
  'ASCENT',
  // ship after hot staging: its altitude stays relative to the mount deck like the booster's ascent
  'SEPARATED',
  'SECO',
]);

/** Discrete render flags for an entity (besides ALIVE / SNAP). */
export function entityFlags(e: Entity): number {
  switch (e.kind) {
    case 'booster':
    case 'ship': {
      const s = e.fsm.state;
      if (s === 'LOST' || s === 'OFF_SCENE') return SlotFlag.HIDDEN;
      if (s === 'ON_TRANSPORTER') return SlotFlag.ON_CARGO;
      return MOUNT_STATES.has(s) ? SlotFlag.ON_MOUNT : 0;
    }
    case 'tanker':
      return e.fsm.state === 'OFFMAP' ? SlotFlag.HIDDEN : 0;
    default:
      return 0;
  }
}

const ATTACH_MASK = SlotFlag.ON_MOUNT | SlotFlag.ON_CARGO | SlotFlag.HIDDEN;

export class SnapshotWriter {
  private occupant: (Id | null)[] = [];
  private serial = -1;
  private count = -1;
  private forceSnap = true;

  constructor(readonly snap: RenderSnapshot) {}

  /** Next write rebuilds the index and snaps every slot (new game, load, jump). */
  invalidate(): void {
    this.serial = -1;
    this.count = -1;
    this.forceSnap = true;
  }

  write(world: World): void {
    const s = this.snap;
    const table = world.entities;
    const usedBefore = s.used;
    // prev ← curr for the used range only (≈ 45 slots, not the 4 096 capacity).
    s.prev.set(s.curr.subarray(0, usedBefore * SLOT_STRIDE));
    s.animPrev.set(s.animCurr.subarray(0, usedBefore * ANIM_STRIDE));
    for (let i = 0; i < usedBefore; i++) s.curr[i * SLOT_STRIDE + 7] = 0;

    if (table.nextSerial !== this.serial || table.order.length !== this.count) this.rebuildIndex(world);

    let used = 0;
    const c = s.curr;
    const p = s.prev;
    for (const id of table.order) {
      const e = table.byId[id];
      if (!e) continue;
      const o = e.slot * SLOT_STRIDE;
      if (o + SLOT_STRIDE > c.length) throw new Error(`RenderSnapshot capacity exceeded (slot ${e.slot})`);
      used = Math.max(used, e.slot + 1);
      const flags = entityFlags(e);
      const prevFlags = p[o + 7] ?? 0;
      c[o] = e.pos.x;
      c[o + 1] = e.pos.y;
      c[o + 2] = e.pos.z;
      c[o + 3] = e.rot.x;
      c[o + 4] = e.rot.y;
      c[o + 5] = e.rot.z;
      c[o + 6] = e.rot.w;
      const jump =
        Math.abs(e.pos.x - (p[o] ?? 0)) + Math.abs(e.pos.y - (p[o + 1] ?? 0)) + Math.abs(e.pos.z - (p[o + 2] ?? 0)) >
        TELEPORT_M;
      const snap =
        this.forceSnap ||
        this.occupant[e.slot] !== id ||
        (prevFlags & SlotFlag.ALIVE) === 0 ||
        (prevFlags & ATTACH_MASK) !== (flags & ATTACH_MASK) ||
        jump;
      c[o + 7] = SlotFlag.ALIVE | flags | (snap ? SlotFlag.SNAP : 0);
      if (snap) {
        for (let k = 0; k < 7; k++) p[o + k] = c[o + k] ?? 0;
        this.occupant[e.slot] = id;
      }
    }
    s.used = Math.max(used, usedBefore);
    s.tick = world.tick;
    this.forceSnap = false;
  }

  private rebuildIndex(world: World): void {
    const table = world.entities;
    const slots: SnapshotSlot[] = [];
    for (const id of table.order) {
      const e = table.byId[id];
      if (!e) continue;
      slots.push({ slot: e.slot, id: e.id, kind: e.kind, asset: e.asset, siteId: e.siteId, callSign: e.callSign });
    }
    this.snap.index = { version: this.snap.index.version + 1, slots };
    this.serial = table.nextSerial;
    this.count = table.order.length;
  }
}
