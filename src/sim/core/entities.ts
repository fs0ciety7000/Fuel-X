// Entity table with stable ordering (ARCHITECTURE §6): ids are serials, iteration uses `order`.
import type { Entity, EntityOf, Id, Kind } from '../types';
import { emit } from './events';
import type { World } from './world';

export type EntitySpec<K extends Kind> = Omit<EntityOf<K>, 'id' | 'slot'>;

export function formatEntityId(serial: number): Id {
  return `e${String(serial).padStart(6, '0')}`;
}

/** Adds an entity at the end of `order`, assigns id + render slot, emits `Spawned`. */
export function spawnEntity<K extends Kind>(world: World, spec: EntitySpec<K>): EntityOf<K> {
  const table = world.entities;
  const id = formatEntityId(table.nextSerial++);
  const slot = table.freeSlots.pop() ?? table.nextSlot++;
  const entity = { ...spec, id, slot } as EntityOf<K>;
  table.byId[id] = entity as Entity;
  table.order.push(id);
  emit(world, { t: 'Spawned', id, kind: entity.kind, callSign: entity.callSign });
  return entity;
}

/** Removes an entity, frees its slot, emits `Despawned`. */
export function despawnEntity(world: World, id: Id): void {
  const table = world.entities;
  const entity = table.byId[id];
  if (!entity) throw new Error(`despawnEntity: unknown id ${id}`);
  Reflect.deleteProperty(table.byId, id);
  table.order.splice(table.order.indexOf(id), 1);
  table.freeSlots.push(entity.slot);
  emit(world, { t: 'Despawned', id, kind: entity.kind, callSign: entity.callSign });
}

export function getEntity(world: World, id: Id): Entity | null {
  return world.entities.byId[id] ?? null;
}

// Per-kind index cache (hot path: several systems walk one kind each tick). Keyed by the entity table object;
// stale when an entity was spawned (`nextSerial`) or despawned (`order.length`). Not part of the world.
interface KindIndex {
  serial: number;
  count: number;
  byKind: Partial<Record<Kind, Entity[]>>;
}
const KIND_CACHE = new WeakMap<object, KindIndex>();

/** Entities of one kind, in stable insertion order (cached view: do not mutate the array). */
export function entitiesOfKind<K extends Kind>(world: World, kind: K): readonly EntityOf<K>[] {
  const table = world.entities;
  let idx = KIND_CACHE.get(table);
  if (!idx || idx.serial !== table.nextSerial || idx.count !== table.order.length) {
    const byKind: Partial<Record<Kind, Entity[]>> = {};
    for (const id of table.order) {
      const e = table.byId[id];
      if (e) (byKind[e.kind] ??= []).push(e);
    }
    idx = { serial: table.nextSerial, count: table.order.length, byKind };
    KIND_CACHE.set(table, idx);
  }
  return (idx.byKind[kind] ?? []) as EntityOf<K>[];
}

export function findByCallSign(world: World, callSign: string): Entity | null {
  for (const id of world.entities.order) {
    const e = world.entities.byId[id];
    if (e?.callSign === callSign) return e;
  }
  return null;
}
