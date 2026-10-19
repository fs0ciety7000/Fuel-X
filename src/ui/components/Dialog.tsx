import { useEffect, useId, useRef, type ReactNode } from 'react';
import type { ConsequenceVM } from '../types';
import { cx } from './cx';
import { Glyph } from './Glyph';
import { HazardBand } from './HazardBand';
import { Value } from './Value';
import styles from './Overlay.module.css';

export interface DialogProps {
  title: string;
  open: boolean;
  danger?: boolean;
  consequences?: ConsequenceVM[];
  children?: ReactNode;
  /** Buttons; the first should be the safe default (CANCEL) and gets focus. */
  actions: ReactNode;
  onCancel?: () => void;
  /** Render in flow without `showModal` (gallery). */
  inline?: boolean;
  className?: string | undefined;
}

/** §6.27 confirm dialog: native modal `<dialog>`, 2 px ink frame, danger band for irreversible actions; Esc cancels. */
export function Dialog({
  title,
  open,
  danger = false,
  consequences,
  children,
  actions,
  onCancel,
  inline = false,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d || inline) return;
    if (open && !d.open) {
      d.showModal();
      d.querySelector<HTMLElement>('[data-autofocus], button')?.focus();
    } else if (!open && d.open) d.close();
  }, [open, inline]);
  if (inline && !open) return null;
  return (
    <dialog
      ref={ref}
      className={cx(styles.dialog, inline && styles.inline, className)}
      data-state={danger ? 'danger' : 'neutral'}
      aria-labelledby={id}
      open={inline ? true : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onCancel?.();
      }}
    >
      <h2 id={id} className={styles.dialogHead}>
        {danger ? <HazardBand /> : null}
        {danger ? <Glyph id="danger" /> : null}
        {title}
      </h2>
      <div className={styles.dialogBody}>
        {children}
        {consequences && consequences.length ? (
          <dl className={styles.consequences}>
            {consequences.map((c) => (
              <div key={c.label} style={{ display: 'contents' }}>
                <dt>{c.label}</dt>
                <dd>
                  <Value v={c.value} />
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        <div className={styles.dialogActions}>{actions}</div>
      </div>
    </dialog>
  );
}
