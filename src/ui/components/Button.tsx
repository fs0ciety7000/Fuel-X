import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { GlyphId } from '../types';
import { cx, type DemoState } from './cx';
import { Glyph } from './Glyph';
import styles from './Button.module.css';

export interface ButtonProps {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  glyph?: GlyphId;
  /** Key hint rendered in `<kbd>`. */
  kbd?: string;
  /** Disabled with a reason (aria-disabled, stays focusable). */
  disabledReason?: string | null;
  busy?: boolean;
  small?: boolean;
  onClick?: () => void;
  demo?: DemoState;
  className?: string | undefined;
  ariaLabel?: string;
  id?: string;
  'aria-haspopup'?: 'dialog' | 'listbox' | 'menu';
  'aria-expanded'?: boolean;
  'aria-controls'?: string;
}

/** §6.33 button: primary (ink fill) · secondary (frame) · danger (accent fill + band on hover); `<kbd>` hint. */
export function Button({
  children,
  variant = 'secondary',
  glyph,
  kbd,
  disabledReason,
  busy = false,
  small = false,
  onClick,
  demo,
  className,
  ariaLabel,
  ...aria
}: ButtonProps) {
  const reasonId = useId();
  const disabled = Boolean(disabledReason) || busy;
  return (
    <button
      {...aria}
      type="button"
      className={cx(styles.button, small && styles.small, className)}
      data-variant={variant}
      data-demo={demo}
      aria-disabled={disabled || undefined}
      aria-busy={busy || undefined}
      aria-describedby={disabledReason ? reasonId : undefined}
      aria-label={ariaLabel}
      aria-keyshortcuts={kbd && kbd.length === 1 ? kbd : undefined}
      title={disabledReason ?? undefined}
      onClick={disabled ? undefined : onClick}
    >
      {busy ? <Glyph id="current" /> : glyph ? <Glyph id={glyph} /> : null}
      <span>{children}</span>
      {kbd ? <kbd className={styles.kbd}>{kbd}</kbd> : null}
      {disabledReason ? (
        <span id={reasonId} className={styles.reason}>
          {disabledReason}
        </span>
      ) : null}
    </button>
  );
}

export interface SegmentOption<V extends string | number> {
  value: V;
  label: ReactNode;
  ariaLabel?: string;
  disabledReason?: string | null;
  /** Above the current cap: hatched but still selectable (the request is remembered, GDD §6). */
  capReason?: string | null;
}

export interface SegmentedControlProps<V extends string | number> {
  label: string;
  options: SegmentOption<V>[];
  value: V;
  /** Marks the running value when it differs from the selected one (rate control). */
  effective?: V;
  onChange?: (v: V) => void;
  demo?: { value: V; state: DemoState };
}

/** §6.33 segmented control = radiogroup; roving tabindex, ←/→ moves + selects, capped cells hatch. */
export function SegmentedControl<V extends string | number>({
  label,
  options,
  value,
  effective,
  onChange,
  demo,
}: SegmentedControlProps<V>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const dir =
      e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const n = options.length;
    const next = (idx + dir + n) % n;
    refs.current[next]?.focus();
    const o = options[next];
    if (o && !o.disabledReason) onChange?.(o.value);
  };
  return (
    <div role="radiogroup" aria-label={label} className={styles.group} onKeyDown={onKey}>
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          className={styles.seg}
          aria-checked={o.value === value}
          aria-disabled={o.disabledReason ? true : undefined}
          aria-label={o.ariaLabel}
          title={o.disabledReason ?? o.capReason ?? undefined}
          data-capped={o.capReason ? 'true' : undefined}
          tabIndex={i === idx ? 0 : -1}
          data-effective={effective !== undefined && effective !== value && o.value === effective ? 'true' : undefined}
          data-demo={demo && demo.value === o.value ? demo.state : undefined}
          onClick={() => {
            if (!o.disabledReason) onChange?.(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
