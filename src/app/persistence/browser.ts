// Browser effects for the persistence controller: IndexedDB store, `visibilitychange → hidden`, file download, URL.
import { searchWithSeed } from '../session/session';
import type { PersistenceEnv } from './controller';
import { openIdbSaveStore } from './store';
import type { SaveStore } from './store';

/** The page's save store (rejects without IndexedDB: autosave is then reported off, export / import still work). */
export function openBrowserSaveStore(): Promise<SaveStore> {
  return openIdbSaveStore(typeof indexedDB === 'undefined' ? undefined : indexedDB);
}

export function browserPersistenceEnv(): PersistenceEnv {
  const env: PersistenceEnv = { nowIso: () => new Date().toISOString() };
  if (typeof document === 'undefined' || typeof window === 'undefined') return env;
  return {
    ...env,
    onHidden: (fn) => {
      const h = (): void => {
        if (document.visibilityState === 'hidden') fn();
      };
      document.addEventListener('visibilitychange', h);
      return () => document.removeEventListener('visibilitychange', h);
    },
    download: (name, bytes, mime) => {
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    },
    showSeed: (seed) =>
      window.history.replaceState(window.history.state, '', searchWithSeed(window.location.search, seed)),
  };
}
