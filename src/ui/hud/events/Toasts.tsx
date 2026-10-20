import { projectionStore, view } from '@bridge/index';
import { useEffect, useReducer } from 'react';
import { useStore } from 'zustand';
import { Button, Toast } from '../../components';
import type { AlertsVM, EventVM } from '../../types';
import styles from './events.module.css';
import {
  dismiss,
  ingest,
  initialToasts,
  nextExpiry,
  pause,
  prune,
  resume,
  visible,
  type ToastItem,
  type ToastState,
} from './toast-queue';

// §6.23 toast stack (top-centre `toast` area): max 3, newest on top, `+N MORE` → Events tab. Danger is sticky until
// ACK; hover / focus inside the stack pauses every timer. Enter = 200 ms slide (primitive), exit = hard cut.

type Act =
  | { t: 'ingest'; alerts: Pick<AlertsVM, 'items'>; events: readonly EventVM[]; now: number }
  | { t: 'prune' | 'pause' | 'resume'; now: number }
  | { t: 'dismiss'; key: string };

function reduce(s: ToastState, a: Act): ToastState {
  const next = step(s, a);
  // The stack unmounts when empty, so a hover pause could never be released: drop it with the last toast.
  return next.items.length === 0 && next.pausedAt !== null ? { ...next, pausedAt: null } : next;
}

function step(s: ToastState, a: Act): ToastState {
  switch (a.t) {
    case 'ingest':
      return ingest(s, a.alerts, a.events, a.now);
    case 'prune':
      return prune(s, a.now);
    case 'pause':
      return pause(s, a.now);
    case 'resume':
      return resume(s, a.now);
    case 'dismiss':
      return dismiss(s, a.key);
  }
}

export interface ToastViewProps {
  items: ToastItem[];
  overflow: number;
  onAck?: (t: ToastItem) => void;
  onDismiss?: (t: ToastItem) => void;
  onFollow?: (entityId: string) => void;
  onMore?: () => void;
  onPause?: (paused: boolean) => void;
}

/** Presentational stack (gallery + HUD). */
export function ToastView({ items, overflow, onAck, onDismiss, onFollow, onMore, onPause }: ToastViewProps) {
  return (
    <div
      className={styles.stack}
      role="region"
      aria-label="Notifications"
      data-testid="toasts"
      onPointerEnter={() => onPause?.(true)}
      onPointerLeave={() => onPause?.(false)}
      onFocus={() => onPause?.(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onPause?.(false);
      }}
    >
      {items.map((t) => {
        const danger = t.event.state === 'danger';
        const entity = t.event.entityId;
        return (
          <Toast
            key={t.key}
            event={t.event}
            {...(!danger && onDismiss ? { onDismiss: () => onDismiss(t) } : {})}
            actions={
              entity || danger || t.source === 'alert' ? (
                <>
                  {entity && onFollow ? (
                    <Button small onClick={() => onFollow(entity)}>
                      FOLLOW
                    </Button>
                  ) : null}
                  {t.source === 'alert' || danger ? (
                    <Button small variant={danger ? 'primary' : 'secondary'} onClick={() => onAck?.(t)}>
                      ACK
                    </Button>
                  ) : null}
                </>
              ) : undefined
            }
          />
        );
      })}
      {overflow > 0 ? (
        <button type="button" className={styles.more} onClick={onMore}>
          +{overflow} MORE · EVENTS TAB
        </button>
      ) : null}
    </div>
  );
}

/** Store-connected toasts for the HUD `toasts` slot. */
export function ToastsContainer() {
  const alerts = useStore(projectionStore, (p) => p.alerts);
  const events = useStore(projectionStore, (p) => p.lists.events);
  const [s, dispatch] = useReducer(reduce, undefined, initialToasts);
  useEffect(() => dispatch({ t: 'ingest', alerts, events, now: Date.now() }), [alerts, events]);
  const next = nextExpiry(s);
  useEffect(() => {
    if (next === null) return;
    const id = window.setTimeout(() => dispatch({ t: 'prune', now: Date.now() }), Math.max(0, next - Date.now()));
    return () => window.clearTimeout(id);
  }, [next]);
  const { shown, overflow } = visible(s);
  if (!shown.length) return null;
  return (
    <ToastView
      items={shown}
      overflow={overflow}
      onFollow={(id) => view.follow(id)}
      onMore={() => view.tab('events')}
      onPause={(p) => dispatch({ t: p ? 'pause' : 'resume', now: Date.now() })}
      onDismiss={(t) => dispatch({ t: 'dismiss', key: t.key })}
      onAck={(t) => {
        if (t.source === 'alert') view.ackAlert(t.event.id);
        dispatch({ t: 'dismiss', key: t.key });
      }}
    />
  );
}
