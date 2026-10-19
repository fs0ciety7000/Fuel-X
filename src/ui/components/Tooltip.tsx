import { useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { cx } from './cx';
import styles from './Overlay.module.css';

const HOVER_INTENT_MS = 300;

export interface TooltipProps {
  text: string;
  /** Trigger; receives `aria-describedby` through the wrapper's described element. */
  children: (describedBy: string | undefined) => ReactElement;
  /** Force open (gallery). */
  open?: boolean;
}

/** §6.32 tooltip: plain text, opens at once on focus, after hover intent on pointer; Esc closes. */
export function Tooltip({ text, children, open: forced }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const clear = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  const shown = forced ?? open;
  return (
    <span
      className={styles.anchor}
      onPointerEnter={() => {
        clear();
        timer.current = window.setTimeout(() => setOpen(true), HOVER_INTENT_MS);
      }}
      onPointerLeave={() => {
        clear();
        setOpen(false);
      }}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      {children(id)}
      {shown ? (
        <span id={id} role="tooltip" className={styles.tooltip}>
          {text}
        </span>
      ) : (
        <span id={id} hidden>
          {text}
        </span>
      )}
    </span>
  );
}

export interface PopoverProps {
  /** Renders the trigger with the props it must spread. */
  trigger: (p: {
    'aria-haspopup': 'dialog';
    'aria-expanded': boolean;
    'aria-controls': string;
    onClick: () => void;
    id: string;
  }) => ReactElement;
  children: ReactNode;
  label: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Render in flow (gallery). */
  inline?: boolean;
}

/** §6.32 popover: interactive sheet under its trigger; Esc / outside click close and return focus. */
export function Popover({ trigger, children, label, open: controlled, onOpenChange, inline = false }: PopoverProps) {
  const id = useId();
  const [own, setOwn] = useState(false);
  const open = controlled ?? own;
  const set = (v: boolean): void => {
    setOwn(v);
    onOpenChange?.(v);
  };
  const triggerId = `${id}-trigger`;
  const triggerEl = (): HTMLElement | null => document.getElementById(triggerId);
  const sheet = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open || inline) return;
    const onDown = (e: PointerEvent): void => {
      const t = e.target as Node;
      if (!sheet.current?.contains(t) && !triggerEl()?.contains(t)) set(false);
    };
    document.addEventListener('pointerdown', onDown);
    sheet.current?.focus();
    return () => document.removeEventListener('pointerdown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, inline]);
  return (
    <span className={cx(styles.anchor, inline && styles.anchorInline)}>
      {trigger({
        'aria-haspopup': 'dialog',
        'aria-expanded': open,
        'aria-controls': id,
        onClick: () => set(!open),
        id: triggerId,
      })}
      {open ? (
        <div
          id={id}
          ref={sheet}
          role="dialog"
          aria-label={label}
          tabIndex={-1}
          className={cx(styles.popover, inline && styles.static)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              set(false);
              triggerEl()?.focus();
            }
          }}
        >
          {children}
        </div>
      ) : null}
    </span>
  );
}
