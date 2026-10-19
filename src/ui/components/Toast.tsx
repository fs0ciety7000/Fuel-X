import type { ReactNode } from 'react';
import type { EventVM } from '../types';
import { Glyph } from './Glyph';
import { HazardBand } from './HazardBand';
import styles from './Overlay.module.css';

export interface ToastProps {
  event: EventVM;
  actions?: ReactNode;
  onDismiss?: () => void;
}

const GLYPH = {
  neutral: 'idle',
  info: 'pending',
  ok: 'ok',
  active: 'current',
  warn: 'warn',
  danger: 'danger',
  disabled: 'offline',
} as const;

/** §6.23 toast: `role=alert` for danger (sticky until ACK), `status` otherwise; severity = edge mass + glyph. */
export function Toast({ event, actions, onDismiss }: ToastProps) {
  const danger = event.state === 'danger';
  return (
    <div className={styles.toast} data-state={event.state} role={danger ? 'alert' : 'status'}>
      <span className={styles.toastEdge}>{danger ? <HazardBand /> : null}</span>
      <div className={styles.toastBody}>
        <p className={styles.toastLine}>
          <Glyph id={GLYPH[event.state]} />
          <time className={styles.toastTime}>{event.time}</time>
          <span className={styles.toastEntity}>{event.entityCode ?? ''}</span>
          <span>{event.message}</span>
          {onDismiss && !danger ? (
            <button type="button" className={styles.iconButton} aria-label="Dismiss" onClick={onDismiss}>
              <Glyph id="close" />
            </button>
          ) : (
            <span />
          )}
        </p>
        {actions ? <div className={styles.toastActions}>{actions}</div> : null}
      </div>
    </div>
  );
}

/** Toast container: max 3 visible, overflow → `+N MORE`. */
export function ToastStack({ children, overflow = 0 }: { children: ReactNode; overflow?: number }) {
  return (
    <div className={styles.stack} role="region" aria-label="Notifications">
      {children}
      {overflow > 0 ? <p className={styles.more}>+{overflow} MORE · EVENTS TAB</p> : null}
    </div>
  );
}
