import type { ComponentType } from 'react';
import type { HudSlotName } from './frame/slots';
import { CountdownTimeline } from './timeline/CountdownTimeline';
import { TopBar } from './topbar/TopBar';
import { AltitudeScale, CompassTape, MapControls } from './world';

// What fills each HUD slot in the game (DESIGN_SYSTEM §3.5). One connected component per slot, no props: it reads
// the throttled projection itself. To mount yours, import it here and add one line — nothing else in the frame
// changes. Unlisted slots render nothing. Owners: 6.3 top · 6.4 flight / inspect / tabs · 6.5 poll / strip / time ·
// 6.6 alt / compass / ctrl · 6.7 toasts / overlay.
export const HUD_MOUNTS: Partial<Record<HudSlotName, ComponentType>> = {
  top: TopBar,
  time: CountdownTimeline,
  alt: AltitudeScale,
  compass: CompassTape,
  ctrl: MapControls,
};
