// Save files (ARCHITECTURE §10): `{ format: 'fuelx-save', schema, game, createdAt, world, commandLog? }` as
// canonical JSON (sorted keys). `createdAt` is metadata passed in by the host (the sim has no wall clock).
// Compression (gzip) and storage (IndexedDB, file export) belong to src/app/persistence (Phase 8).
import type { StampedCommand } from '../core/commands';
import { canonicalStringify, validateWorld } from '../core/serialize';
import { WORLD_SCHEMA } from '../core/world';
import type { World } from '../core/world';
import { MIGRATIONS, migrateWorld } from './migrations';
import type { Migration, RawWorld } from './migrations';

export const SAVE_FORMAT = 'fuelx-save';

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  schema: number;
  /** App version that wrote the save. */
  game: string;
  /** ISO timestamp, metadata only. */
  createdAt: string;
  world: World;
  /** Seed + this log reproduce the session (bug reports, replays). */
  commandLog?: StampedCommand[];
}

export interface SaveMeta {
  game: string;
  createdAt: string;
  commandLog?: readonly StampedCommand[];
}

export interface LoadedSave {
  world: World;
  commandLog: StampedCommand[];
  game: string;
  createdAt: string;
  /** Schema the file was written with (< current when migrated). */
  fromSchema: number;
}

/** Serialises `world` into a save file (canonical JSON). */
export function createSave(world: World, meta: SaveMeta): string {
  const file: SaveFile = {
    format: SAVE_FORMAT,
    schema: world.schema,
    game: meta.game,
    createdAt: meta.createdAt,
    world,
    ...(meta.commandLog ? { commandLog: [...meta.commandLog] } : {}),
  };
  return canonicalStringify(file);
}

/**
 * Parses a save, migrates an older schema, validates the world. Errors are UPPER_SNAKE codes (i18n keys):
 * `SAVE_NOT_JSON`, `SAVE_BAD_FORMAT`, `SAVE_FROM_NEWER_GAME`, `SAVE_MIGRATION_MISSING`, `WORLD_INVALID`.
 */
export function loadSave(json: string, migrations: Readonly<Record<number, Migration>> = MIGRATIONS): LoadedSave {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('SAVE_NOT_JSON');
  }
  const file = parsed as Partial<SaveFile> | null;
  if (!file || typeof file !== 'object' || file.format !== SAVE_FORMAT || !Number.isInteger(file.schema)) {
    throw new Error('SAVE_BAD_FORMAT');
  }
  const schema = file.schema as number;
  if (schema > WORLD_SCHEMA) {
    throw new Error(`SAVE_FROM_NEWER_GAME: schema ${schema}, this game reads up to ${WORLD_SCHEMA}`);
  }
  if (!file.world || typeof file.world !== 'object') throw new Error('SAVE_BAD_FORMAT');
  const raw = migrateWorld(file.world as unknown as RawWorld, schema, WORLD_SCHEMA, migrations);
  return {
    world: validateWorld(raw),
    commandLog: Array.isArray(file.commandLog) ? file.commandLog : [],
    game: String(file.game ?? ''),
    createdAt: String(file.createdAt ?? ''),
    fromSchema: schema,
  };
}
