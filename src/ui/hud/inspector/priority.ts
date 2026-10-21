import type { InspectorVM, MetricVM } from '../../types';

// Compact inspector (DESIGN_SYSTEM §3.3): the 2-column metric grid keeps at most COMPACT_METRICS cells. Which ones is
// a presentational choice, so the per-class priority lives here, keyed by the projected `InspectorVM.kind` and the
// metric keys of `src/app/projection/project-entities.ts` (bridge types stay the source of truth; no new field).
// Each list puts the metrics behind the class's player decision first (GDD D1–D3), then monitoring.

export const COMPACT_METRICS = 6;

export const COMPACT_PRIORITY: Readonly<Record<string, readonly string[]>> = {
  // D3 catch / divert: engines, catch P, landing prop, tower wind; then the flight readouts.
  booster: [
    'engines',
    'catchP',
    'landingProp',
    'towerWind',
    'altitude',
    'velocity',
    'prop',
    'arms',
    'downrange',
    'heading',
    'clock',
    'wear',
  ],
  ship: ['altitude', 'velocity', 'engines', 'prop', 'downrange', 'heading', 'clock'],
  // Recovery / range / picket boats: where it is heading, then how fast.
  boat: ['target', 'speed'],
  transporter: ['cargo', 'speed'],
  // D1 supply margin: when it reaches the gate and what it carries.
  tanker: ['gate', 'cargo', 'fluid', 'speed', 'order'],
  tower: ['arms', 'interlock', 'towerWind', 'qd', 'carriage'],
  tank: ['fill', 'mass', 'boiledOff', 'cap'],
  wxStation: ['groundWind', 'gust', 'upperWind', 'windFrom'],
};

const alerting = (m: MetricVM): boolean => m.state === 'warn' || m.state === 'danger';

/**
 * Keys of the metrics shown at compact. Warn/danger metrics always make the cut (an alert is never hidden), then the
 * class priority, then unlisted keys in projection order. Display order stays the projection order, so a cell keeps
 * its position when the viewport crosses the compact breakpoint. Returns every key when nothing has to go.
 */
export function compactMetricKeys(vm: Pick<InspectorVM, 'kind' | 'metrics'>, max = COMPACT_METRICS): Set<string> {
  const all = vm.metrics.map((m) => m.key);
  if (vm.metrics.length <= max) return new Set(all);
  const order = COMPACT_PRIORITY[vm.kind ?? ''] ?? [];
  const rank = (m: MetricVM, i: number): number => {
    const r = order.indexOf(m.key);
    return (alerting(m) ? 0 : 2 * order.length + all.length) + (r >= 0 ? r : order.length + i);
  };
  const ranked = vm.metrics.map((m, i) => ({ key: m.key, r: rank(m, i) })).sort((a, b) => a.r - b.r);
  return new Set(ranked.slice(0, max).map((x) => x.key));
}
