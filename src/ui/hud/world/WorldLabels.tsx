import { memo } from 'react';
import { useStore } from 'zustand';
import { projectionStore, view } from '@bridge/index';
import { LabelTag } from '../../components';
import type { TagState } from '../../components';
import type { LabelVM } from '../../types';
import { DOM } from './dom-contract';
import styles from './WorldLabels.module.css';

// In-world label layer (DESIGN_SYSTEM §6.20, ARCHITECTURE §8, task 6.6). React renders one tag per projected label
// (≤ 10 Hz, rows keep their identity through the projector's structural sharing, so unchanged tags never re-render);
// the render WorldOverlaySystem positions them every frame (transform + data-mode = tag / anchor / hidden) through
// the data attributes of `./dom-contract`. Never pass `style` here: render owns it.

export function tagState(l: Pick<LabelVM, 'selected' | 'state'>): TagState {
  const alert = l.state === 'warn' || l.state === 'danger';
  if (l.selected) return alert ? 'selected-alert' : 'selected';
  if (alert) return 'alert';
  return l.state === 'disabled' ? 'disabled' : 'default';
}

/**
 * Accessible name of a tag (§6.20): the projector's `ariaLabel` (`SP-42, TRANSPORTER, AMBIENT · WIND HOLD · GUST
 * 15.0 M/S, WARNING`) when present, so status and severity are not carried by colour alone (8.2); else
 * `B-09, booster` (+ status). `, following` is appended from the view state.
 */
export function tagDescription(
  l: Pick<LabelVM, 'callSign' | 'kind' | 'following'> & Partial<Pick<LabelVM, 'ariaLabel' | 'statusLabel'>>,
): string {
  const base = l.ariaLabel || [l.callSign, l.kind?.toLowerCase(), l.statusLabel].filter(Boolean).join(', ');
  return l.following ? `${base}, following` : base;
}

const dataAttrs = (l: LabelVM): Record<string, string | number> => ({
  [DOM.label]: l.id,
  [DOM.priority]: l.priority ?? 1,
});

const WorldLabel = memo(function WorldLabel({ label }: { label: LabelVM }) {
  const state = tagState(label);
  return (
    <div className={styles.label} {...dataAttrs(label)} data-selected={label.selected || undefined}>
      <span className={styles.anchor} aria-hidden="true" />
      <span className={styles.leader} aria-hidden="true" />
      <span
        className={styles.tag}
        {...{ [DOM.labelTag]: '' }}
        onDoubleClick={() => view.follow(label.id)}
        onKeyDown={(e) => {
          // Enter = select + camera (DESIGN_SYSTEM §8); click / Space = select
          if (e.key === 'Enter') {
            e.preventDefault();
            view.follow(label.id);
          }
        }}
      >
        <LabelTag
          callSign={label.callSign}
          glyph={label.glyph}
          state={state}
          description={tagDescription(label)}
          onSelect={() => view.select(label.id)}
        />
      </span>
    </div>
  );
});

/** Full-viewport layer (z `world-labels`), transparent to the pointer except on the tags themselves (§3.4). */
export function WorldLabels() {
  const labels = useStore(projectionStore, (p) => p.labels);
  return (
    <div className={styles.layer} {...{ [DOM.labelLayer]: '' }} aria-label="World labels" role="group">
      {labels.map((l) => (
        <WorldLabel key={l.id} label={l} />
      ))}
    </div>
  );
}
