// Persistence behind a dynamic import (8.1 F2, ARCHITECTURE §10, §13.3). The composition root holds this facade; the
// controller, codec (gzip, save checks), IndexedDB store and browser effects are one lazy chunk, fetched by `boot()`
// while the page's fresh run is held paused. Nothing is lost while it loads: autosaves are skipped during the boot
// lookup anyway, the run cannot reach a milestone while it is paused, and port calls made in the window wait for it.
// This module must only `import type` from the rest of `./persistence` (else the chunk is back in the initial graph).
import type { PersistenceHandlers } from '@bridge/index';
import type { AutosaveMeta, BootOptions } from './controller';

/** The part of `PersistenceController` the composition root and the debug hooks use. */
export interface PersistenceRuntime {
  readonly handlers: PersistenceHandlers;
  boot(opts: BootOptions): Promise<void>;
  onNewRun(): void;
  autosaves(): Promise<AutosaveMeta[]>;
  latestAutosaveJson(): Promise<string | null>;
}

export class LazyPersistence {
  private runtime: PersistenceRuntime | null = null;
  private pending: Promise<PersistenceRuntime> | null = null;
  /** Boot's own `start()` is running (its new-run hook is not a foreign run). */
  private bootStarting = false;
  /** A run was started by someone else (debug `seed`) before the controller existed: no offer for this page. */
  private foreignRun = false;

  constructor(
    private readonly loader: () => Promise<PersistenceRuntime>,
    /** Hold / release the run (same hook the controller gets). */
    private readonly setPaused: (on: boolean) => void,
  ) {}

  /** Loads the controller chunk once (a failed fetch is retried by the next call). */
  load(): Promise<PersistenceRuntime> {
    this.pending ??= this.loader().then(
      (r) => (this.runtime = r),
      (e: unknown) => {
        this.pending = null;
        throw e;
      },
    );
    return this.pending;
  }

  get loaded(): boolean {
    return this.runtime !== null;
  }

  private use(fn: (r: PersistenceRuntime) => void): void {
    if (this.runtime) fn(this.runtime);
    else void this.load().then(fn, () => undefined);
  }

  /** Bound to the bridge `persistence` port by the composition root (calls before the chunk wait for it). */
  readonly handlers: PersistenceHandlers = {
    continueRun: () => this.use((r) => r.handlers.continueRun()),
    newRun: () => this.use((r) => r.handlers.newRun()),
    exportSave: () => this.use((r) => r.handlers.exportSave()),
    importSave: (file) => this.use((r) => r.handlers.importSave(file)),
  };

  /**
   * Boot: hold the run, start the page's fresh run while the chunk loads, then let the controller look for an
   * unfinished autosave. Without the chunk (offline after an update) the run is released without persistence.
   */
  async boot(opts: BootOptions): Promise<void> {
    this.setPaused(true);
    const loading = this.load();
    this.bootStarting = true;
    try {
      await opts.start();
    } finally {
      this.bootStarting = false;
    }
    let runtime: PersistenceRuntime;
    try {
      runtime = await loading;
    } catch {
      this.setPaused(false);
      return;
    }
    if (this.foreignRun) {
      this.setPaused(false);
      return;
    }
    await runtime.boot({ ...opts, start: () => Promise.resolve() });
  }

  /** Composition-root hook after every new run. */
  onNewRun(): void {
    if (this.runtime) this.runtime.onNewRun();
    else if (!this.bootStarting) this.foreignRun = true;
  }

  async autosaves(): Promise<AutosaveMeta[]> {
    return (await this.load()).autosaves();
  }

  async latestAutosaveJson(): Promise<string | null> {
    return (await this.load()).latestAutosaveJson();
  }
}
