// Persistence controller (8.3, ARCHITECTURE §10): autosave ring in IndexedDB, resume offer on boot, export / import
// of `.fuelx.json.gz` save files. Browser effects (storage, page visibility, download, URL, wall clock) are injected
// so it runs headless in tests. It only talks to the sim through the SimHost (`save` / `load` / `inspect`).
import { persistenceStore as defaultState } from '@bridge/index';
import type { PersistenceHandlers, PersistenceState, ResumeOfferVM } from '@bridge/index';
import type { SimEvent } from '@sim/types';
import type { StoreApi } from 'zustand/vanilla';
import { formatTClock } from '../jump';
import { PHASE_LABEL } from '../projection/labels';
import type { SimHost } from '../sim-host/types';
import { APP_VERSION } from '../version';
import { checkSave, decodeSaveBytes, encodeSaveFile, persistenceErrorText, saveBaseName } from './codec';
import { AUTOSAVE_RING } from './config';
import { autosaveKey, latestAutosave } from './store';
import type { AutosaveReason, SaveRecord, SaveStore } from './store';

export interface PersistenceEnv {
  /** ISO wall time (save metadata only). */
  nowIso(): string;
  /** Run `fn` when the page becomes hidden (`visibilitychange → hidden`); returns the unsubscribe. */
  onHidden?(fn: () => void): () => void;
  /** Save a file (browser: Blob + <a download>). */
  download?(name: string, bytes: Uint8Array, mime: string): void;
  /** Mirror a loaded run's seed into the address bar (`?seed=N`). */
  showSeed?(seed: number): void;
}

export interface PersistenceDeps {
  host: SimHost;
  /** Event batches after every frame (the app bus). */
  bus: { onBatch(fn: (batch: readonly SimEvent[]) => void): () => void };
  /** Storage; a rejected promise turns autosave off (`STORAGE UNAVAILABLE`), export / import keep working. */
  store: Promise<SaveStore>;
  env: PersistenceEnv;
  /** Pause / release the run (the boot hold, CONTINUE and IMPORT resume paused). */
  setPaused(on: boolean): void;
  /** Composition-root reset after a load (time rules, projector, view, camera cut). */
  afterLoad(): void;
  state?: StoreApi<PersistenceState>;
  /** Autosave ring size (default `AUTOSAVE_RING`). */
  ring?: number;
  game?: string;
}

export interface BootOptions {
  /** `?seed=N`: a link to another seed starts that run; the same seed as the autosave still offers CONTINUE. */
  urlSeed: number | null;
  /** `?autopilot=1` demo page: no offer, no autosave. */
  autopilot: boolean;
  /** Starts the page's fresh run (held paused until the offer is answered). */
  start(): Promise<void>;
}

/** Autosave metadata without the save body (debug hooks, tests). */
export type AutosaveMeta = Omit<SaveRecord, 'json'>;

const REASON_LABEL: Record<AutosaveReason, string> = {
  milestone: 'MILESTONE',
  debrief: 'DEBRIEF',
  hidden: 'TAB HIDDEN',
  import: 'IMPORTED',
  continue: 'CONTINUED',
  manual: 'MANUAL',
};

/** `2026-10-21T14:22:09.000Z` → `2026-10-21 14:22 UTC`. */
export function wallLabel(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  return m ? `${m[1]} ${m[2]} UTC` : iso;
}

function reasonLabel(r: Pick<SaveRecord, 'reason' | 'detail'>): string {
  return r.reason === 'milestone' && r.detail
    ? `${REASON_LABEL.milestone} ${r.detail.replaceAll('_', ' ')}`
    : REASON_LABEL[r.reason];
}

const tClockLabel = (r: Pick<SaveRecord, 'tClockTicks'>): string =>
  r.tClockTicks === null ? '—' : formatTClock(r.tClockTicks);

/** `T-04:44:59 · 2026-10-21 14:22 UTC · MILESTONE STANDARD ORDER LAST CALL`. */
const autosaveLabel = (r: SaveRecord): string => `${tClockLabel(r)} · ${wallLabel(r.savedAt)} · ${reasonLabel(r)}`;

export function offerVM(r: SaveRecord): ResumeOfferVM {
  return {
    seed: String(r.seed),
    tClock: tClockLabel(r),
    phase: r.phase ? PHASE_LABEL[r.phase] : '—',
    savedAt: wallLabel(r.savedAt),
    reason: reasonLabel(r),
  };
}

export class PersistenceController {
  readonly state: StoreApi<PersistenceState>;
  private readonly ring: number;
  private readonly game: string;
  private store: SaveStore | null = null;
  private storeFailed = false;
  private readonly storeReady: Promise<SaveStore | null>;
  /** Next ring write number (continues from the stored records). */
  private seq = 0;
  private seqLoaded = false;
  /** Bumped by every new run / load: dedupes autosaves of the same run at the same tick. */
  private runSerial = 0;
  private lastWrite: { serial: number; tick: number } | null = null;
  /** Boot lookup in progress (the run is held paused, autosave off). */
  private booting = false;
  /** Boot's own `start()` is running (its new-run hook is not a supersede). */
  private bootStarting = false;
  private offerRecord: SaveRecord | null = null;
  /** Serialises storage writes so `seq` order = commit order. */
  private queue: Promise<unknown> = Promise.resolve();
  private readonly offs: (() => void)[] = [];

  constructor(private readonly deps: PersistenceDeps) {
    this.state = deps.state ?? defaultState;
    this.ring = Math.max(1, deps.ring ?? AUTOSAVE_RING);
    this.game = deps.game ?? APP_VERSION;
    this.storeReady = deps.store.then(
      async (s) => {
        this.store = s;
        await this.loadSeq(s);
        return s;
      },
      () => {
        this.storeFailed = true;
        this.state.setState({ autosaveOff: 'STORAGE UNAVAILABLE' });
        return null;
      },
    );
    this.offs.push(deps.bus.onBatch((batch) => this.onEvents(batch)));
    if (deps.env.onHidden) this.offs.push(deps.env.onHidden(() => void this.autosave('hidden')));
  }

  /** Bound to the bridge `persistence` port by the composition root. */
  readonly handlers: PersistenceHandlers = {
    continueRun: () => void this.continueRun(),
    newRun: () => this.declineOffer(),
    exportSave: () => void this.exportSave(),
    importSave: (file) => void this.importFile(file),
  };

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
  }

  /** Resolves when queued storage writes have settled (tests, debug hooks). */
  idle(): Promise<void> {
    return this.queue.then(() => undefined);
  }

  private async loadSeq(s: SaveStore): Promise<void> {
    try {
      const latest = latestAutosave(await s.list());
      this.seq = Math.max(this.seq, latest ? latest.seq + 1 : 0);
    } catch {
      // unreadable store: start the ring at 0
    }
    this.seqLoaded = true;
  }

  private onEvents(batch: readonly SimEvent[]): void {
    let reason: AutosaveReason | null = null;
    let detail: string | undefined;
    for (const e of batch) {
      if (e.t === 'PhaseChanged' && e.to === 'Debrief') reason = 'debrief';
      else if (e.t === 'Milestone' && reason === null) {
        reason = 'milestone';
        detail = e.name;
      }
    }
    if (reason) void this.autosave(reason, detail);
  }

  /** Composition-root hook after every new run (URL seed, REPLAY, NEW SEED, debug `seed`). */
  onNewRun(): void {
    this.runSerial++;
    this.lastWrite = null;
    if (this.bootStarting) return;
    // A run started by someone else while the offer was open / being looked up supersedes it.
    if (this.booting || this.offerRecord) this.release(false);
  }

  /** Drops the offer state; `paused` = keep the run paused (CONTINUE / IMPORT) or run it (NEW RUN). */
  private release(paused: boolean): void {
    this.booting = false;
    this.offerRecord = null;
    this.state.setState({ offer: null });
    this.deps.setPaused(paused);
  }

  /** Boot: start the fresh run held paused, look for an unfinished autosave and offer CONTINUE vs NEW RUN. */
  async boot(opts: BootOptions): Promise<void> {
    this.booting = true;
    this.deps.setPaused(true);
    if (opts.autopilot) this.state.setState({ autosaveOff: 'DEMO RUN (AUTOPILOT)' });
    this.bootStarting = true;
    try {
      await opts.start();
    } finally {
      this.bootStarting = false;
    }
    let offer: SaveRecord | null = null;
    try {
      const store = await this.storeReady;
      if (store && !opts.autopilot) {
        const latest = latestAutosave(await store.list());
        const fits = latest && !latest.finished && !latest.autopilot;
        if (fits && (opts.urlSeed === null || opts.urlSeed === latest.seed)) offer = latest;
      }
    } catch {
      offer = null;
    }
    if (!this.booting) return; // superseded by another run while looking
    if (!offer) {
      this.release(false);
      return;
    }
    this.offerRecord = offer;
    this.state.setState({ offer: offerVM(offer), status: null });
  }

  /** NEW RUN on the offer: the fresh world booted with the page runs; the autosave stays in the ring. */
  declineOffer(): void {
    if (!this.offerRecord) return;
    this.release(false);
  }

  /** CONTINUE: loads the offered autosave; the run resumes paused on its saved tick. */
  async continueRun(): Promise<boolean> {
    const rec = this.offerRecord;
    if (!rec) return false;
    this.state.setState({ busy: true, status: null });
    try {
      checkSave(rec.json);
      await this.deps.host.load(rec.json);
    } catch (e) {
      this.state.setState({ busy: false, status: { state: 'danger', text: persistenceErrorText(e) } });
      return false;
    }
    this.afterLoaded();
    this.state.setState({ busy: false, status: null, lastAutosave: autosaveLabel(rec) });
    return true;
  }

  private afterLoaded(): void {
    this.runSerial++;
    const { world } = this.deps.host.inspect();
    // The loaded state is already on disk when it came from the ring: do not write it again at the same tick.
    this.lastWrite = { serial: this.runSerial, tick: world.tick };
    this.deps.afterLoad();
    this.release(true);
    this.deps.env.showSeed?.(world.seed);
  }

  /** Writes the current run into the ring (skipped: autopilot runs, boot / offer pending, same tick, no storage). */
  autosave(reason: AutosaveReason, detail?: string): Promise<SaveRecord | null> {
    if (this.booting || this.offerRecord || this.storeFailed) return Promise.resolve(null);
    const { world, countdown, seed, autopilot } = this.deps.host.inspect();
    if (autopilot) return Promise.resolve(null);
    if (this.lastWrite && this.lastWrite.serial === this.runSerial && this.lastWrite.tick === world.tick) {
      return Promise.resolve(null);
    }
    this.lastWrite = { serial: this.runSerial, tick: world.tick };
    const savedAt = this.deps.env.nowIso();
    const base = {
      reason,
      ...(detail ? { detail } : {}),
      savedAt,
      seed,
      tick: world.tick,
      tClockTicks: countdown ? countdown.tClockTicks : null,
      phase: countdown ? countdown.phase.state : null,
      finished: !countdown || countdown.phase.state === 'Debrief',
      autopilot,
      game: this.game,
      schema: world.schema,
    };
    // Serialise now (the world moves on); the write itself waits for the store and the previous write.
    const json = this.deps.host.save({ game: this.game, createdAt: savedAt });
    const write = async (): Promise<SaveRecord | null> => {
      const store = this.store ?? (await this.storeReady);
      if (!store) return null;
      if (!this.seqLoaded) await this.loadSeq(store);
      const seq = this.seq++;
      const rec: SaveRecord = { key: autosaveKey(seq, this.ring), seq, ...base, json: await json };
      await store.put(rec);
      this.state.setState({ lastAutosave: autosaveLabel(rec) });
      return rec;
    };
    const p = this.queue.then(write, write).catch(() => {
      this.state.setState({ lastAutosave: 'AUTOSAVE FAILED · STORAGE ERROR' });
      return null;
    });
    this.queue = p;
    return p;
  }

  /** EXPORT SAVE: the current run as a file. Returns the file name (null on error). */
  async exportSave(): Promise<string | null> {
    this.state.setState({ busy: true, status: null });
    try {
      const { world, seed } = this.deps.host.inspect();
      const json = await this.deps.host.save({ game: this.game, createdAt: this.deps.env.nowIso() });
      const file = await encodeSaveFile(json, saveBaseName(seed, world.tick));
      this.deps.env.download?.(file.name, file.bytes, file.mime);
      this.state.setState({ busy: false, status: { state: 'ok', text: `EXPORTED ${file.name.toUpperCase()}` } });
      return file.name;
    } catch (e) {
      this.state.setState({ busy: false, status: { state: 'danger', text: persistenceErrorText(e) } });
      return null;
    }
  }

  /** IMPORT SAVE from a picked file. */
  async importFile(file: Blob): Promise<boolean> {
    this.state.setState({ busy: true, status: null });
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch (e) {
      this.state.setState({ busy: false, status: { state: 'danger', text: persistenceErrorText(e) } });
      return false;
    }
    return this.importBytes(bytes);
  }

  /**
   * Decode (gunzip), validate + migrate, then load. Any failure leaves the current run untouched and reports a
   * specific reason. The imported run resumes paused and is autosaved, so a reload offers it.
   */
  async importBytes(bytes: Uint8Array): Promise<boolean> {
    this.state.setState({ busy: true, status: null });
    let migrated: number | null = null;
    try {
      const json = await decodeSaveBytes(bytes);
      const checked = checkSave(json);
      if (checked.fromSchema < checked.world.schema) migrated = checked.fromSchema;
      await this.deps.host.load(json);
      this.afterLoaded();
    } catch (e) {
      this.state.setState({ busy: false, status: { state: 'danger', text: persistenceErrorText(e) } });
      return false;
    }
    const { world, countdown } = this.deps.host.inspect();
    const where = countdown ? `${formatTClock(countdown.tClockTicks)} · ${PHASE_LABEL[countdown.phase.state]}` : '';
    const text = ['LOADED', `SEED ${world.seed}`, where, migrated !== null ? `MIGRATED FROM SCHEMA ${migrated}` : '']
      .filter(Boolean)
      .join(' · ');
    this.state.setState({ busy: false, status: { state: 'ok', text } });
    this.lastWrite = null;
    await this.autosave('import');
    return true;
  }

  /** Ring contents, latest first, without the save bodies (debug hooks). */
  async autosaves(): Promise<AutosaveMeta[]> {
    await this.idle();
    const store = await this.storeReady;
    if (!store) return [];
    const list = await store.list();
    return list
      .filter((r) => r.key.startsWith('auto-'))
      .sort((a, b) => b.seq - a.seq)
      .map(({ json: _json, ...meta }) => meta);
  }

  /** Latest autosave body (debug hooks / e2e: compare a resumed world with what was written). */
  async latestAutosaveJson(): Promise<string | null> {
    await this.idle();
    const store = await this.storeReady;
    if (!store) return null;
    return latestAutosave(await store.list())?.json ?? null;
  }
}
