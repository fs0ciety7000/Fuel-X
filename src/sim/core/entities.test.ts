import { describe, expect, it } from 'vitest';
import { despawnEntity, entitiesOfKind, findByCallSign, getEntity, spawnEntity } from './entities';
import type { EntitySpec } from './entities';
import { createWorld } from './world';
import type { Kind } from '../types';

function spec<K extends Kind>(kind: K, callSign: string): EntitySpec<K> {
  return {
    kind,
    callSign,
    siteId: 'LC-1',
    pos: { x: 0, y: 0, z: 0 },
    rot: { x: 0, y: 0, z: 0, w: 1 },
    asset: 'van',
  } as EntitySpec<K>;
}

describe('entity table', () => {
  it('assigns serial ids and slots in insertion order and emits Spawned', () => {
    const w = createWorld({ seed: 1 });
    const a = spawnEntity(w, spec('van', 'CV-01'));
    const b = spawnEntity(w, spec('tank', 'LOX-1'));
    const c = spawnEntity(w, spec('van', 'CV-02'));
    expect([a.id, b.id, c.id]).toEqual(['e000001', 'e000002', 'e000003']);
    expect([a.slot, b.slot, c.slot]).toEqual([0, 1, 2]);
    expect(w.entities.order).toEqual(['e000001', 'e000002', 'e000003']);
    expect(entitiesOfKind(w, 'van').map((e) => e.callSign)).toEqual(['CV-01', 'CV-02']);
    expect(findByCallSign(w, 'LOX-1')?.id).toBe('e000002');
    expect(findByCallSign(w, 'NOPE')).toBeNull();
    expect(w.outbox.map((e) => e.t)).toEqual(['Spawned', 'Spawned', 'Spawned']);
  });

  it('despawn frees the slot for reuse, never the id', () => {
    const w = createWorld({ seed: 1 });
    spawnEntity(w, spec('van', 'CV-01'));
    const b = spawnEntity(w, spec('van', 'CV-02'));
    despawnEntity(w, b.id);
    expect(getEntity(w, b.id)).toBeNull();
    expect(w.entities.order).toEqual(['e000001']);
    expect(w.outbox.at(-1)).toMatchObject({ t: 'Despawned', id: b.id, kind: 'van', callSign: 'CV-02' });
    const c = spawnEntity(w, spec('boat', 'UNK-01'));
    expect(c.id).toBe('e000003');
    expect(c.slot).toBe(b.slot);
    expect(() => despawnEntity(w, 'e999999')).toThrow();
  });
});
