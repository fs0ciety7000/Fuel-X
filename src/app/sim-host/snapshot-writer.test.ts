import { createMvpScenario, despawnEntity, findByCallSign, step } from '@sim/index';
import { describe, expect, it } from 'vitest';
import { SLOT_STRIDE, SlotFlag, createRenderSnapshot } from '@render/snapshot';
import { SnapshotWriter } from './snapshot-writer';

function setup() {
  const sc = createMvpScenario({ seed: 42 });
  sc.world.outbox.length = 0;
  const snap = createRenderSnapshot(256);
  const writer = new SnapshotWriter(snap);
  writer.write(sc.world);
  return { ...sc, snap, writer };
}

describe('SnapshotWriter', () => {
  it('indexes every entity and writes its pose into curr', () => {
    const { world, snap } = setup();
    expect(snap.index.slots).toHaveLength(world.entities.order.length);
    expect(snap.index.version).toBe(1);
    const tower = findByCallSign(world, 'TOWER-1');
    if (!tower) throw new Error('no tower');
    const o = tower.slot * SLOT_STRIDE;
    expect(Array.from(snap.curr.subarray(o, o + 3))).toEqual([tower.pos.x, tower.pos.y, tower.pos.z]);
    expect((snap.curr[o + 7] ?? 0) & SlotFlag.ALIVE).toBe(SlotFlag.ALIVE);
    expect(snap.tick).toBe(world.tick);
  });

  it('shifts curr → prev every tick and keeps the index version without spawns', () => {
    const { world, snap, writer } = setup();
    const before = Float64Array.from(snap.curr.subarray(0, snap.used * SLOT_STRIDE));
    step(world);
    world.outbox.length = 0;
    writer.write(world);
    for (let i = 0; i < snap.used; i++) {
      for (let k = 0; k < 7; k++) expect(snap.prev[i * SLOT_STRIDE + k]).toBe(before[i * SLOT_STRIDE + k]);
    }
    expect(snap.index.version).toBe(1);
  });

  it('hides off-map tankers and snaps on attachment changes', () => {
    const { world, snap, writer } = setup();
    const lx = findByCallSign(world, 'LX-01');
    const b = findByCallSign(world, 'B-09');
    if (lx?.kind !== 'tanker' || b?.kind !== 'booster') throw new Error('layout');
    expect((snap.curr[lx.slot * SLOT_STRIDE + 7] ?? 0) & SlotFlag.HIDDEN).toBe(SlotFlag.HIDDEN);
    writer.write(world);
    const o = b.slot * SLOT_STRIDE;
    expect((snap.curr[o + 7] ?? 0) & SlotFlag.SNAP).toBe(0);
    b.fsm.state = 'ON_TRANSPORTER';
    b.pos = { x: b.pos.x + 10, y: 0, z: b.pos.z };
    writer.write(world);
    const f = snap.curr[o + 7] ?? 0;
    expect(f & SlotFlag.ON_CARGO).toBe(SlotFlag.ON_CARGO);
    expect(f & SlotFlag.SNAP).toBe(SlotFlag.SNAP);
    expect(snap.prev[o]).toBe(snap.curr[o]); // prev = curr: no glide across the attach
  });

  it('bumps the index on despawn and clears the dead slot', () => {
    const { world, snap, writer } = setup();
    const van = findByCallSign(world, 'CV-01');
    if (!van) throw new Error('layout');
    despawnEntity(world, van.id);
    world.outbox.length = 0;
    writer.write(world);
    expect(snap.index.version).toBe(2);
    expect(snap.index.slots.some((s) => s.id === van.id)).toBe(false);
    expect((snap.curr[van.slot * SLOT_STRIDE + 7] ?? 0) & SlotFlag.ALIVE).toBe(0);
  });
});
