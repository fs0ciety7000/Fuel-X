import { projectionStore, view, viewStore } from '@bridge/index';
import { useEffect } from 'react';
import { useStore } from 'zustand';
import { List, Tabs } from '../../components';
import type { TabDef } from '../../components/Tabs';
import type { ActionVM, HudTab, ListsVM } from '../../types';
import { EventLog } from '../events/EventLog';
import { sendAction } from '../inspector/Inspector';
import { TAB_ORDER, tabForKey } from './keys';
import { RangeList, TankList, TaskList } from './rows';
import styles from './TabbedPanel.module.css';

// §6.14 tabbed panel: VEHICLES (follow logistics) · TANKS (D1 margin) · TASKS (D1 order rows, prep) · RANGE (D2
// evidence) · EVENTS (review). Active tab lives in viewStore (`view.tab`) so `Alt+1…5`, the top-bar badges and
// the toasts' `+N MORE` all land on the same panel.

const LABEL: Record<HudTab, string> = {
  vehicles: 'VEHICLES',
  tanks: 'TANKS',
  tasks: 'TASKS',
  range: 'RANGE',
  events: 'EVENTS',
};

/** Tab defs with the §6.14 badge: danger count if any, else warn count. Pure, exported for tests. */
export function tabDefs(lists: Pick<ListsVM, 'badges'>): TabDef[] {
  return TAB_ORDER.map((id) => {
    const b = lists.badges?.[id];
    const badge =
      b && b.danger > 0
        ? { count: b.danger, state: 'danger' as const }
        : b && b.warn > 0
          ? { count: b.warn, state: 'warn' as const }
          : undefined;
    return { id, label: LABEL[id], ...(badge ? { badge } : {}) };
  });
}

/** Items in the active tab (header count). */
export function tabCount(lists: ListsVM, tab: HudTab): number {
  return tab === 'range' ? lists.range.length + (lists.rangeAssets?.length ?? 0) : lists[tab].length;
}

export interface TabbedPanelProps {
  lists: ListsVM;
  tab: HudTab;
  onTab?: (tab: HudTab) => void;
  onSelect?: (id: string) => void;
  onFollow?: (id: string) => void;
  onAction?: (a: ActionVM) => void;
}

export function TabbedPanel({ lists, tab, onTab, onSelect, onFollow, onAction }: TabbedPanelProps) {
  const sel = onSelect ? { onSelect } : {};
  const fol = onFollow ? { onFollow } : {};
  return (
    <section className={styles.panel} aria-label="Site panels" data-testid="tabbed-panel" data-tab={tab}>
      <Tabs
        label="Site lists"
        tabs={tabDefs(lists)}
        active={tab}
        onChange={(id) => onTab?.(id as HudTab)}
        className={styles.tabs}
      >
        <p className={styles.header}>
          <span>{LABEL[tab]}</span>
          <span>
            {tabCount(lists, tab)} ITEMS <kbd className={styles.kbd}>ALT {TAB_ORDER.indexOf(tab) + 1}</kbd>
          </span>
        </p>
        {tab === 'vehicles' ? (
          <List label="Vehicles" rows={lists.vehicles} emptyText="NO VEHICLES" {...sel} {...fol} />
        ) : tab === 'tanks' ? (
          <TankList rows={lists.tanks} {...sel} />
        ) : tab === 'tasks' ? (
          <TaskList rows={lists.tasks} {...sel} {...(onAction ? { onAction } : {})} />
        ) : tab === 'range' ? (
          <RangeList stations={lists.range} assets={lists.rangeAssets ?? []} {...sel} {...fol} />
        ) : (
          <EventLog events={lists.events} {...sel} />
        )}
      </Tabs>
    </section>
  );
}

/** Store-connected panel for the HUD `right` slot (below the inspector). Binds `Alt+1…5`. */
export function TabbedPanelContainer() {
  const lists = useStore(projectionStore, (p) => p.lists);
  const tab = useStore(viewStore, (s) => s.tab);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = tabForKey(e);
      if (!t) return;
      e.preventDefault();
      view.tab(t);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <TabbedPanel
      lists={lists}
      tab={tab}
      onTab={(t) => view.tab(t)}
      onSelect={(id) => view.select(id)}
      onFollow={(id) => view.follow(id)}
      onAction={sendAction}
    />
  );
}
