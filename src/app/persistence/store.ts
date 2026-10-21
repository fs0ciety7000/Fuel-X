// Save storage behind an interface (8.3): a thin in-house IndexedDB wrapper for the browser and an in-memory
// adapter for tests / browsers without storage. No dependency: the five calls we need fit in ~80 lines.
//
// Records hold the save as a canonical JSON *string*, uncompressed: IndexedDB values are structured clones (no size
// issue at ~15–60 KB), and keeping the write free of async compression lets the `visibilitychange → hidden` autosave
// start its transaction in the same task as the event (a tab being closed does not wait for a CompressionStream).
import type { Phase } from '@sim/types';
import { DB_NAME, DB_OPEN_TIMEOUT_MS, DB_STORE, DB_VERSION } from './config';

export type AutosaveReason = 'milestone' | 'debrief' | 'hidden' | 'import' | 'continue' | 'manual';

export interface SaveRecord {
  /** `auto-<n>` (ring) or `slot-<n>` (manual slots, API only in the MVP). */
  key: string;
  /** Monotonic write counter across the ring: the highest is the latest autosave. */
  seq: number;
  reason: AutosaveReason;
  /** Milestone name when `reason === 'milestone'`. */
  detail?: string;
  /** Host wall clock, ISO (metadata only). */
  savedAt: string;
  seed: number;
  tick: number;
  /** T-clock of the run's countdown, ticks (null without a countdown). */
  tClockTicks: number | null;
  phase: Phase | null;
  /** The run reached Debrief: nothing to resume. */
  finished: boolean;
  autopilot: boolean;
  /** App version and world schema that wrote it. */
  game: string;
  schema: number;
  /** The save file (`createSave`, canonical JSON). */
  json: string;
}

export interface SaveStore {
  readonly kind: 'indexeddb' | 'memory';
  list(): Promise<SaveRecord[]>;
  get(key: string): Promise<SaveRecord | null>;
  put(record: SaveRecord): Promise<void>;
  delete(key: string): Promise<void>;
}

/** In-memory adapter (tests; fallback when IndexedDB is missing or blocked — saves then die with the tab). */
export class MemorySaveStore implements SaveStore {
  readonly kind = 'memory' as const;
  private readonly map = new Map<string, SaveRecord>();

  list(): Promise<SaveRecord[]> {
    return Promise.resolve([...this.map.values()].map((r) => ({ ...r })));
  }

  get(key: string): Promise<SaveRecord | null> {
    const r = this.map.get(key);
    return Promise.resolve(r ? { ...r } : null);
  }

  put(record: SaveRecord): Promise<void> {
    this.map.set(record.key, { ...record });
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.map.delete(key);
    return Promise.resolve();
  }
}

const req = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IDB_REQUEST_FAILED'));
  });

/** IndexedDB adapter: one connection kept open for the page, one transaction per call. */
export class IdbSaveStore implements SaveStore {
  readonly kind = 'indexeddb' as const;

  constructor(private readonly db: IDBDatabase) {
    // Another tab upgrading the schema: let it, this tab falls back to failing writes (reported, never thrown).
    db.onversionchange = () => db.close();
  }

  private store(mode: IDBTransactionMode): { tx: IDBTransaction; os: IDBObjectStore } {
    const tx = this.db.transaction(DB_STORE, mode);
    return { tx, os: tx.objectStore(DB_STORE) };
  }

  list(): Promise<SaveRecord[]> {
    return req(this.store('readonly').os.getAll() as IDBRequest<SaveRecord[]>);
  }

  async get(key: string): Promise<SaveRecord | null> {
    const r = (await req(this.store('readonly').os.get(key))) as SaveRecord | undefined;
    return r ?? null;
  }

  put(record: SaveRecord): Promise<void> {
    return this.write((os) => os.put(record));
  }

  delete(key: string): Promise<void> {
    return this.write((os) => os.delete(key));
  }

  /** Resolves when the transaction commits (not just when the request succeeds). */
  private write(op: (os: IDBObjectStore) => IDBRequest): Promise<void> {
    return new Promise((resolve, reject) => {
      const { tx, os } = this.store('readwrite');
      op(os);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IDB_WRITE_FAILED'));
      tx.onabort = () => reject(tx.error ?? new Error('IDB_WRITE_ABORTED'));
    });
  }
}

/** Opens (creating / upgrading) the `fuelx` database. Rejects without IndexedDB, on error, block or timeout. */
export function openIdbSaveStore(
  factory: IDBFactory | undefined = globalThis.indexedDB,
  timeoutMs: number = DB_OPEN_TIMEOUT_MS,
): Promise<SaveStore> {
  return new Promise((resolve, reject) => {
    if (!factory) {
      reject(new Error('IDB_UNAVAILABLE'));
      return;
    }
    let settled = false;
    const done = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => done(() => reject(new Error('IDB_TIMEOUT'))), timeoutMs);
    let open: IDBOpenDBRequest;
    try {
      open = factory.open(DB_NAME, DB_VERSION);
    } catch (e) {
      done(() => reject(e instanceof Error ? e : new Error('IDB_UNAVAILABLE')));
      return;
    }
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'key' });
    };
    open.onsuccess = () => {
      const db = open.result;
      if (settled) db.close();
      else done(() => resolve(new IdbSaveStore(db)));
    };
    open.onerror = () => done(() => reject(open.error ?? new Error('IDB_OPEN_FAILED')));
    open.onblocked = () => done(() => reject(new Error('IDB_BLOCKED')));
  });
}

/** Ring key for write number `seq`. */
export const autosaveKey = (seq: number, ring: number): string => `auto-${seq % ring}`;

/** Latest autosave (highest `seq` among `auto-*` keys), or null. */
export function latestAutosave(records: readonly SaveRecord[]): SaveRecord | null {
  let best: SaveRecord | null = null;
  for (const r of records) if (r.key.startsWith('auto-') && (!best || r.seq > best.seq)) best = r;
  return best;
}
