// Session controller (GDD §13.2.3, AC 32): starts runs (URL seed, REPLAY SAME SEED, NEW SEED) and exports the
// session log. Browser effects (URL, download, entropy, wall clock) are injected so it runs headless in tests.
import type { SimHost } from '../sim-host/types';
import { drawSeed, exportSession, searchWithSeed, sessionFileName } from './session';
import type { SessionFile } from './session';

export interface SessionEnv {
  /** u32 entropy (crypto) for NEW SEED. */
  entropy(): number;
  /** ISO wall time for file metadata. */
  nowIso(): string;
  /** Write `?seed=N` into the address bar (history.replaceState); absent = no URL. */
  setSearch?(search: string): void;
  /** Current query string (`location.search`). */
  getSearch?(): string;
  /** Save a file (browser: Blob + <a download>). */
  download?(name: string, json: string): void;
}

export interface RunOptions {
  autopilot?: boolean;
  /** Mirror the seed into the URL (default true). */
  url?: boolean;
}

export class SessionController {
  constructor(
    private readonly host: SimHost,
    private readonly env: SessionEnv,
    /** Composition-root hook after the world was replaced (time rules, projector, view, camera). */
    private readonly afterNewRun: () => void,
  ) {}

  get seed(): number {
    return this.host.inspect().seed;
  }

  /** Fresh `mvp` world with `seed` and an empty command log. */
  async start(seed: number, opts: RunOptions = {}): Promise<void> {
    const autopilot = opts.autopilot ?? this.host.inspect().autopilot;
    await this.host.newGame({ seed: seed >>> 0, scenario: 'mvp', autopilot });
    if ((opts.url ?? true) && this.env.setSearch)
      this.env.setSearch(searchWithSeed(this.env.getSearch?.() ?? '', seed));
    this.afterNewRun();
  }

  /** REPLAY SAME SEED: same seed, same autopilot setting, fresh world (not a playback of the inputs). */
  replaySameSeed(): Promise<void> {
    return this.start(this.seed);
  }

  /** NEW SEED: a different seed from the injected entropy. */
  newSeed(): Promise<number> {
    const seed = drawSeed(() => this.env.entropy(), this.seed);
    return this.start(seed).then(() => seed);
  }

  /** The EXPORT LOG payload. */
  exportSession(): SessionFile {
    return exportSession(this.host.sessionLog(), this.host.inspect().world, this.env.nowIso());
  }

  /** EXPORT LOG: downloads the session JSON; returns the file name. */
  exportLog(): string {
    const f = this.exportSession();
    const name = sessionFileName(f);
    this.env.download?.(name, JSON.stringify(f));
    return name;
  }
}
