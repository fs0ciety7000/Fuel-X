import { projectionStore } from '@bridge/index';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

// Placeholder projection subscriber (6.1) until the 6.3 HUD frame: proves the store path end to end and gives
// `perf-audit` a real React subscriber to count commits against (≤ 12/s). Re-renders only when one of these
// display strings changes (shallow compare), at most at the projection rate.
export function ProjectionReadout({ className }: { className?: string | undefined }) {
  const v = useStore(
    projectionStore,
    useShallow((p) => [
      p.view?.siteId ?? '',
      p.clock.tClock,
      p.clock.holding ? p.clock.holdLabel : p.clock.phaseLabel,
      p.timeScale.readout,
      p.range.label,
      p.alerts.label,
      p.decision ? `DECISION ${p.decision.kind}` : '',
    ]),
  );
  return (
    <p className={className} data-testid="projection-readout">
      {v.filter(Boolean).join(' · ')}
    </p>
  );
}
