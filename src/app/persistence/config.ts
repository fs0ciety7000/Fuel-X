// Persistence settings (8.3, ARCHITECTURE §10). App config, not game tunables: nothing here changes the simulation.

/** Autosave ring size: keys `auto-0` … `auto-(N−1)`, the oldest is overwritten. */
export const AUTOSAVE_RING = 5;
/** IndexedDB database / object store (store `saves`, keyPath `key`: `auto-<n>`, `slot-<n>`). */
export const DB_NAME = 'fuelx';
export const DB_VERSION = 1;
export const DB_STORE = 'saves';
/** Give up opening IndexedDB after this long (blocked upgrade, hung private mode): autosave turns off. */
export const DB_OPEN_TIMEOUT_MS = 3_000;
/** Import guard: a save is ~15–60 KB of JSON; anything above this is not one of ours. */
export const MAX_IMPORT_BYTES = 32 * 1024 * 1024;
/** Export file suffixes. */
export const SAVE_EXT_GZ = '.fuelx.json.gz';
export const SAVE_EXT_JSON = '.fuelx.json';
