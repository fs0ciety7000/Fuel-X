// Lazy chunk entry of the persistence (8.1 F2): `Game` reaches this module only through `import('./runtime')` in
// `LazyPersistence`'s loader. Opens the browser's save store and wires the controller to the page's effects.
import { browserPersistenceEnv, openBrowserSaveStore } from './browser';
import { PersistenceController } from './controller';
import type { PersistenceDeps } from './controller';

export function createBrowserPersistence(deps: Omit<PersistenceDeps, 'store' | 'env'>): PersistenceController {
  return new PersistenceController({ ...deps, store: openBrowserSaveStore(), env: browserPersistenceEnv() });
}
