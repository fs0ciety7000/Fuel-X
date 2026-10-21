import { persistence, persistenceStore } from '@bridge/index';
import type { PersistenceStatusVM, ResumeOfferVM } from '@bridge/index';
import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { Button, Dialog, Glyph } from '../../components';
import styles from './Persistence.module.css';

// 8.3 (ARCHITECTURE §10): the boot resume offer (CONTINUE vs NEW RUN) and the SAVE · LOAD sheet (export / import a
// `.fuelx.json.gz`). Both are §6.27 dialogs; every text comes from the app's persistence state.

/** `Ctrl/⌘+S` opens the SAVE · LOAD sheet (the browser's "save page" is pre-empted on /play). */
export function isSaveMenuKey(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's';
}

function Status({ s }: { s: PersistenceStatusVM | null }) {
  if (!s) return null;
  return (
    <p
      className={styles.status}
      data-state={s.state}
      role={s.state === 'danger' ? 'alert' : 'status'}
      data-testid="persistence-status"
    >
      {s.state === 'danger' ? <Glyph id="danger" label="ERROR" /> : null}
      {s.text}
    </p>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className={styles.facts}>
      {rows.map(([k, v]) => (
        <div key={k} className={styles.fact}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface ResumeDialogProps {
  offer: ResumeOfferVM | null;
  busy?: boolean;
  status?: PersistenceStatusVM | null;
  onContinue: () => void;
  onNewRun: () => void;
  inline?: boolean;
}

/** Boot offer: must be answered (Esc does nothing); CONTINUE is the default focus and never discards progress. */
export function ResumeDialog({
  offer,
  busy = false,
  status = null,
  onContinue,
  onNewRun,
  inline = false,
}: ResumeDialogProps) {
  return (
    <Dialog
      title="RESUME RUN"
      open={offer !== null}
      inline={inline}
      className={inline ? undefined : styles.modal}
      actions={
        <>
          <Button variant="primary" kbd="⏎" busy={busy} onClick={onContinue}>
            CONTINUE
          </Button>
          <Button disabledReason={busy ? 'LOADING' : null} onClick={onNewRun}>
            NEW RUN
          </Button>
        </>
      }
    >
      {offer ? (
        <>
          <p className={styles.lede}>AN UNFINISHED RUN WAS AUTOSAVED IN THIS BROWSER.</p>
          <Facts
            rows={[
              ['SEED', offer.seed],
              ['T-CLOCK', offer.tClock],
              ['PHASE', offer.phase],
              ['SAVED', offer.savedAt],
              ['AT', offer.reason],
            ]}
          />
          <Status s={status} />
        </>
      ) : null}
    </Dialog>
  );
}

/** Connected: resume offer + SAVE · LOAD sheet (mounted in the overlay slot). */
export function PersistenceContainer() {
  const s = useStore(
    persistenceStore,
    useShallow((p) => ({
      offer: p.offer,
      menuOpen: p.menuOpen,
      busy: p.busy,
      status: p.status,
      lastAutosave: p.lastAutosave,
      autosaveOff: p.autosaveOff,
    })),
  );
  const file = useRef<HTMLInputElement | null>(null);
  const blocked = s.offer !== null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!isSaveMenuKey(e)) return;
      e.preventDefault();
      if (!blocked) persistence.openMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [blocked]);

  const autosave = s.autosaveOff ? `OFF · ${s.autosaveOff}` : (s.lastAutosave ?? 'NONE YET THIS SESSION');
  return (
    <>
      <ResumeDialog
        offer={s.offer}
        busy={s.busy}
        status={s.status}
        onContinue={persistence.continueRun}
        onNewRun={persistence.newRun}
      />
      <Dialog
        title="SAVE · LOAD"
        open={s.menuOpen && !blocked}
        onCancel={persistence.closeMenu}
        className={styles.modal}
        actions={
          <>
            <Button kbd="Esc" onClick={persistence.closeMenu}>
              CLOSE
            </Button>
            <Button busy={s.busy} onClick={() => file.current?.click()} aria-haspopup="dialog">
              IMPORT SAVE
            </Button>
            <Button variant="primary" busy={s.busy} onClick={persistence.exportSave}>
              EXPORT SAVE
            </Button>
          </>
        }
      >
        <Facts
          rows={[
            ['AUTOSAVE', autosave],
            ['FILE', '.FUELX.JSON.GZ · IMPORT ACCEPTS .GZ OR .JSON'],
          ]}
        />
        <input
          ref={file}
          className={styles.file}
          type="file"
          accept=".gz,.json,application/gzip,application/json"
          aria-label="Save file to import"
          data-testid="save-import-input"
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            if (f) persistence.importSave(f);
          }}
        />
        <Status s={s.status} />
      </Dialog>
    </>
  );
}
