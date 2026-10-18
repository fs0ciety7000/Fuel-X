// Canonical serialization (ARCHITECTURE §6, §10): sorted keys, strict JSON values only, so the same
// world always yields the same bytes and hash, before and after a save/load round-trip.
import { hashHex } from './hash';
import { WORLD_SCHEMA } from './world';
import type { World } from './world';

function isPlainObject(v: object): boolean {
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function write(value: unknown, path: string, out: string[]): void {
  if (value === null) {
    out.push('null');
    return;
  }
  switch (typeof value) {
    case 'boolean':
      out.push(value ? 'true' : 'false');
      return;
    case 'number':
      if (!Number.isFinite(value)) throw new Error(`canonicalStringify: non-finite number at ${path}`);
      out.push(JSON.stringify(value));
      return;
    case 'string':
      out.push(JSON.stringify(value));
      return;
    case 'object': {
      if (Array.isArray(value)) {
        out.push('[');
        value.forEach((item, i) => {
          if (i > 0) out.push(',');
          write(item, `${path}[${i}]`, out);
        });
        out.push(']');
        return;
      }
      if (!isPlainObject(value)) throw new Error(`canonicalStringify: non-plain object at ${path}`);
      const rec = value as Record<string, unknown>;
      out.push('{');
      Object.keys(rec)
        .sort()
        .forEach((key, i) => {
          if (i > 0) out.push(',');
          out.push(JSON.stringify(key), ':');
          write(rec[key], `${path}.${key}`, out);
        });
      out.push('}');
      return;
    }
    default:
      throw new Error(`canonicalStringify: unsupported ${typeof value} at ${path}`);
  }
}

/** JSON with recursively sorted keys. Throws on undefined, NaN/±Infinity, functions, Map/Set, class instances. */
export function canonicalStringify(value: unknown): string {
  const out: string[] = [];
  write(value, '$', out);
  return out.join('');
}

export function serializeWorld(world: World): string {
  return canonicalStringify(world);
}

export function deserializeWorld(json: string): World {
  return validateWorld(JSON.parse(json));
}

/** Checks a parsed world (current schema, required fields); throws on anything else. */
export function validateWorld(parsed: unknown): World {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('WORLD_INVALID: not an object');
  }
  const w = parsed as Partial<World>;
  if (w.schema !== WORLD_SCHEMA) {
    throw new Error(`WORLD_INVALID: schema ${String(w.schema)} (expected ${WORLD_SCHEMA}; migrate first)`);
  }
  if (
    typeof w.tick !== 'number' ||
    !w.entities ||
    !w.rng ||
    !w.countdowns ||
    !w.logistics ||
    !w.economy ||
    !w.config ||
    !w.weather ||
    !Array.isArray(w.outbox)
  ) {
    throw new Error('WORLD_INVALID: missing world fields');
  }
  return parsed as World;
}

/** Hash of the canonical form: equal hashes ⇔ equal worlds (modulo collisions). */
export function hashWorld(world: World): string {
  return hashHex(serializeWorld(world));
}
