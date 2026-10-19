// Typed pub/sub outside the sim (ARCHITECTURE §5): dispatched once per frame with the drained batch.
// Subscribers never call back into the sim synchronously; they send commands.
import type { SimEvent, SimEventType } from '@sim/types';

type Handler<T extends SimEventType> = (e: Extract<SimEvent, { t: T }>) => void;

export class EventBus {
  private readonly handlers = new Map<SimEventType, Set<(e: SimEvent) => void>>();
  private readonly any = new Set<(batch: readonly SimEvent[]) => void>();

  on<T extends SimEventType>(type: T, fn: Handler<T>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    const h = fn as (e: SimEvent) => void;
    set.add(h);
    return () => set.delete(h);
  }

  onBatch(fn: (batch: readonly SimEvent[]) => void): () => void {
    this.any.add(fn);
    return () => this.any.delete(fn);
  }

  dispatch(batch: readonly SimEvent[]): void {
    for (const fn of this.any) fn(batch);
    if (this.handlers.size === 0) return;
    for (const e of batch) {
      const set = this.handlers.get(e.t);
      if (set) for (const fn of set) fn(e);
    }
  }
}
