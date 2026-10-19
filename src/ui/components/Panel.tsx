import { useId, type ReactNode } from 'react';
import type { Severity } from '../types';
import { Glyph } from './Glyph';
import { HazardBand } from './HazardBand';
import styles from './Panel.module.css';

export interface PanelProps {
  title: string;
  meta?: ReactNode;
  state?: Extract<Severity, 'neutral' | 'warn' | 'danger' | 'disabled'>;
  as?: 'section' | 'aside';
  level?: 2 | 3;
  className?: string | undefined;
  bodyClassName?: string;
  children?: ReactNode;
}

/** §4 card frame: 1 px ink frame, `[ TITLE ]` header, body = 1 px grid-gap compartments on ink-5. */
export function Panel({
  title,
  meta,
  state = 'neutral',
  as: Tag = 'section',
  level = 2,
  className,
  bodyClassName,
  children,
}: PanelProps) {
  const id = useId();
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <Tag className={[styles.panel, className].filter(Boolean).join(' ')} data-state={state} aria-labelledby={id}>
      <header className={styles.head}>
        {state === 'danger' ? <HazardBand /> : null}
        {state === 'warn' || state === 'danger' ? <Glyph id={state} /> : null}
        <H id={id} className={styles.title}>
          <span className={styles.bracket} aria-hidden="true">
            [{' '}
          </span>
          {title}
          <span className={styles.bracket} aria-hidden="true">
            {' '}
            ]
          </span>
        </H>
        {meta ? <div className={styles.meta}>{meta}</div> : null}
      </header>
      <div className={[styles.body, bodyClassName].filter(Boolean).join(' ')}>{children}</div>
    </Tag>
  );
}
