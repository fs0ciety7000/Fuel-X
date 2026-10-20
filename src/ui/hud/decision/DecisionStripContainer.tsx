import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { commands, projectionStore } from '@bridge/index';
import { Button, Dialog } from '../../components';
import type { DecisionOptionVM } from '../../types';
import { ownedByTarget } from '../frame/keys';
import { announce } from '../frame/live';
import { openAnnouncement, optionForKey, pressOutcome, startsCollapsed } from './decision';
import { DecisionStripView } from './DecisionStrip';

/**
 * Live decision strip (§6.28): one decision at a time as projected. A press sends `option.command` (or opens the
 * confirm dialog for irreversible options) and shows `SENT` until the next projection. Blocking decisions take
 * focus and are announced assertively when they open; option keys are scoped to the strip; `G` focuses it and `O`
 * toggles the advisory D1 strip from anywhere.
 */
export function DecisionStrip() {
  const [d, drop] = useStore(
    projectionStore,
    useShallow((p) => [p.decision, p.timeScale.drop?.label ?? null] as const),
  );
  const ref = useRef<HTMLElement | null>(null);
  const id = d ? `${d.kind}:${d.id}` : null;
  // Local state is keyed by the decision it belongs to, so a new decision starts fresh without effects.
  const [fold, setFold] = useState<{ id: string | null; collapsed: boolean }>({ id: null, collapsed: true });
  const collapsed = d ? (fold.id === id ? fold.collapsed : startsCollapsed(d)) : true;
  const setCollapsed = useCallback(
    (next: boolean | ((c: boolean) => boolean)): void =>
      setFold((f) => {
        const cur = f.id === id ? f.collapsed : d ? startsCollapsed(d) : true;
        return { id, collapsed: typeof next === 'function' ? next(cur) : next };
      }),
    [id, d],
  );
  // SENT lasts until the projection publishes a new decision object (≤ 100 ms while running).
  const [sent, setSent] = useState<{ d: unknown; option: string } | null>(null);
  const pending = sent && sent.d === d ? sent.option : null;
  const [ask, setAsk] = useState<{ id: string | null; option: DecisionOptionVM } | null>(null);
  const confirm = ask && ask.id === id ? ask.option : null;
  const setConfirm = (o: DecisionOptionVM | null): void => setAsk(o ? { id, option: o } : null);

  // A new blocking decision takes focus and is announced assertively.
  const openId = useRef<string | null>(null);
  useEffect(() => {
    if (id === openId.current) return;
    openId.current = id;
    if (d?.blocking) {
      announce(openAnnouncement(d), 'assertive');
      ref.current?.focus({ preventScroll: true });
    }
  }, [id, d]);

  // Global G / O (not while typing).
  useEffect(() => {
    if (!d) return;
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey || ownedByTarget(e.target, e.key)) return;
      const k = e.key.toLowerCase();
      if (k === 'g') {
        e.preventDefault();
        if (d.kind === 'PROP_MARGIN') setCollapsed(false);
        ref.current?.focus();
      } else if (k === 'o' && d.kind === 'PROP_MARGIN') {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [d, setCollapsed]);

  if (!d) return null;

  const send = (o: DecisionOptionVM): void => {
    if (!o.command) return;
    commands.send(o.command);
    setSent({ d, option: o.id });
    announce(`SENT · ${o.label}`);
  };
  const press = (o: DecisionOptionVM): void => {
    switch (pressOutcome(o)) {
      case 'send':
        send(o);
        break;
      case 'confirm':
        setConfirm(o);
        break;
      case 'collapse':
        setCollapsed(true);
        break;
      case 'blocked':
        announce(`${o.label} UNAVAILABLE${o.reason ? `, ${o.reason}` : ''}`);
        break;
    }
  };
  const onKey = (e: KeyboardEvent<HTMLElement>): void => {
    if (e.ctrlKey || e.metaKey || e.altKey || ownedByTarget(e.target, e.key)) return;
    if (d.kind === 'PROP_MARGIN' && e.key === 'Escape') {
      e.preventDefault();
      setCollapsed(true);
      return;
    }
    if (collapsed) return;
    const o = optionForKey(d.options, e.key);
    if (o) {
      e.preventDefault();
      e.stopPropagation();
      press(o);
    }
  };

  return (
    <>
      <DecisionStripView
        ref={ref}
        d={d}
        dropLabel={drop}
        pending={pending}
        collapsed={d.kind === 'PROP_MARGIN' && collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        onPress={press}
        onKeyDown={onKey}
      />
      <Dialog
        title={confirm ? `${confirm.label}?` : ''}
        open={confirm !== null}
        danger={confirm?.variant === 'danger'}
        consequences={confirm?.consequences ?? []}
        onCancel={() => setConfirm(null)}
        actions={
          <>
            <Button onClick={() => setConfirm(null)}>CANCEL</Button>
            <Button
              variant={confirm?.variant === 'danger' ? 'danger' : 'primary'}
              {...(confirm?.variant === 'danger' ? { glyph: 'danger' as const } : {})}
              onClick={() => {
                if (confirm) send(confirm);
                setConfirm(null);
              }}
            >
              {confirm?.label ?? ''}
            </Button>
          </>
        }
      >
        <p>{d.question}</p>
      </Dialog>
    </>
  );
}
