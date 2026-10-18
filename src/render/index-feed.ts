// Tiny external store for the snapshot index: RenderSync publishes when `index.version` changes (spawn /
// despawn / load only), EntityViews read it with useSyncExternalStore → React commits only then.
import type { SnapshotIndex } from './snapshot';

export class IndexFeed {
  private current: SnapshotIndex = { version: -1, slots: [] };
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  readonly get = (): SnapshotIndex => this.current;

  publish(index: SnapshotIndex): void {
    if (index === this.current) return;
    this.current = index;
    for (const fn of this.listeners) fn();
  }
}
