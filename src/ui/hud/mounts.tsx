import type { ComponentType } from 'react';
import type { HudSlotName } from './frame/slots';
import { DebriefContainer } from './debrief';
import { DecisionStrip, PollPanel } from './decision';
import { ToastsContainer } from './events';
import { FlightCardContainer } from './flight';
import { InspectorContainer } from './inspector';
import { PersistenceContainer } from './persistence';
import { TabbedPanelContainer } from './tabs';
import { CountdownTimeline } from './timeline/CountdownTimeline';
import { PhaseStamp } from './stamp';
import { TopBar } from './topbar/TopBar';
import { AltitudeScale, CompassTape, MapControls } from './world';

// What fills each HUD slot in the game (DESIGN_SYSTEM §3.5). One connected component per slot, no props: it reads
// the throttled projection itself. To mount yours, import it here and add one line — nothing else in the frame
// changes. Unlisted slots render nothing. Owners: 6.3 top · 6.4 flight / inspect / tabs · 6.5 poll / strip / time ·
// 6.6 alt / compass / ctrl · 6.7 toasts / overlay.
/** Overlay slot (§3.5): the phase stamp (§6.26) and the debrief sheet (§6.29) share the centred layer. */
function Overlay() {
  return (
    <>
      <PhaseStamp />
      <DebriefContainer />
      <PersistenceContainer />
    </>
  );
}

export const HUD_MOUNTS: Partial<Record<HudSlotName, ComponentType>> = {
  top: TopBar,
  time: CountdownTimeline,
  poll: PollPanel,
  strip: DecisionStrip,
  alt: AltitudeScale,
  compass: CompassTape,
  ctrl: MapControls,
  flight: FlightCardContainer,
  inspect: InspectorContainer,
  tabs: TabbedPanelContainer,
  toasts: ToastsContainer,
  overlay: Overlay,
};
