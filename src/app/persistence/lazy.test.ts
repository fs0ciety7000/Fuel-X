// 8.1 F2: the persistence controller is a lazy chunk behind `LazyPersistence`. The facade must keep the 8.3 boot
// contract (run held paused until the lookup, boot's own run is not a supersede, a foreign run drops the offer) and
// never drop a port call made while the chunk loads.
import { describe, expect, it } from 'vitest';
import type { BootOptions } from './controller';
import { LazyPersistence } from './lazy';
import type { PersistenceRuntime } from './lazy';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeRuntime(log: string[]): PersistenceRuntime {
  return {
    handlers: {
      continueRun: () => log.push('continue'),
      newRun: () => log.push('new'),
      exportSave: () => log.push('export'),
      importSave: (f) => log.push(`import:${f.size}`),
    },
    boot: async (opts: BootOptions) => {
      log.push(`boot:${String(opts.urlSeed)}`);
      await opts.start();
      log.push('looked-up');
    },
    onNewRun: () => log.push('runtime-new-run'),
    autosaves: () => Promise.resolve([]),
    latestAutosaveJson: () => Promise.resolve('{}'),
  };
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('LazyPersistence', () => {
  it('boot: holds the run, starts it while the chunk loads, then hands the lookup to the controller', async () => {
    const log: string[] = [];
    const chunk = deferred<PersistenceRuntime>();
    let loads = 0;
    const lp = new LazyPersistence(
      () => {
        loads++;
        return chunk.promise;
      },
      (on) => log.push(on ? 'pause' : 'release'),
    );
    const done = lp.boot({
      urlSeed: 42,
      autopilot: false,
      start: () => {
        log.push('start');
        lp.onNewRun(); // boot's own run: not a supersede
        return Promise.resolve();
      },
    });
    await flush();
    expect(log).toEqual(['pause', 'start']);
    expect(lp.loaded).toBe(false);
    chunk.resolve(fakeRuntime(log));
    await done;
    expect(log).toEqual(['pause', 'start', 'boot:42', 'looked-up']);
    expect(loads).toBe(1);
    lp.onNewRun();
    expect(log.at(-1)).toBe('runtime-new-run');
  });

  it('a run started by someone else before the chunk arrives releases the page without an offer', async () => {
    const log: string[] = [];
    const chunk = deferred<PersistenceRuntime>();
    const lp = new LazyPersistence(
      () => chunk.promise,
      (on) => log.push(on ? 'pause' : 'release'),
    );
    const done = lp.boot({ urlSeed: null, autopilot: false, start: () => Promise.resolve() });
    await flush();
    lp.onNewRun(); // debug `seed()` during the import
    chunk.resolve(fakeRuntime(log));
    await done;
    expect(log).toEqual(['pause', 'release']);
  });

  it('port calls made while the chunk loads are delivered once it has loaded (none dropped)', async () => {
    const log: string[] = [];
    const chunk = deferred<PersistenceRuntime>();
    const lp = new LazyPersistence(
      () => chunk.promise,
      () => undefined,
    );
    lp.handlers.exportSave();
    lp.handlers.importSave(new Blob(['abc']));
    expect(log).toEqual([]);
    chunk.resolve(fakeRuntime(log));
    await flush();
    expect(log).toEqual(['export', 'import:3']);
    lp.handlers.newRun(); // loaded: synchronous
    expect(log.at(-1)).toBe('new');
    await expect(lp.latestAutosaveJson()).resolves.toBe('{}');
  });

  it('a failed chunk fetch releases the run and is retried by the next call', async () => {
    const log: string[] = [];
    let attempt = 0;
    const lp = new LazyPersistence(
      () => (++attempt === 1 ? Promise.reject(new Error('offline')) : Promise.resolve(fakeRuntime(log))),
      (on) => log.push(on ? 'pause' : 'release'),
    );
    await lp.boot({ urlSeed: null, autopilot: false, start: () => Promise.resolve() });
    expect(log).toEqual(['pause', 'release']);
    await expect(lp.autosaves()).resolves.toEqual([]);
    expect(attempt).toBe(2);
  });
});
