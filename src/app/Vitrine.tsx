import { VitrineStage } from '@render/systems/VitrineStage';
import { VitrinePage } from '@ui/vitrine/VitrinePage';

// Public front door. The pad shell stays on play.html until Phases 5–6 replace it.
export function Vitrine() {
  return <VitrinePage stage={<VitrineStage />} />;
}
