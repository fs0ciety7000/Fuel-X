// Flight attempt factory: the MVP countdown plus its prep assets (GDD §12–13).
import { mvpFlight } from '@data/index';
import type { World } from '../core/world';
import { createCountdown } from '../systems/countdown';
import type { CreateCountdownOptions } from '../systems/countdown';
import type { Countdown, Id } from '../types';

function need(ids: Record<string, Id>, callSign: string): Id {
  const id = ids[callSign];
  if (!id) throw new Error(`createMvpFlight: ${callSign} not spawned`);
  return id;
}

/** Countdown for `mvpFlight` (B-09 / S-21 on OLM-1) + PrepState (TOWER-1, SP-41, CR-77). */
export function createMvpFlight(
  world: World,
  ids: Record<string, Id>,
  opts: Pick<CreateCountdownOptions, 'startTS' | 'autoGoWhenAllGreen'> = {},
): Countdown {
  const cd = createCountdown(world, {
    flightName: mvpFlight.name,
    siteId: mvpFlight.siteId,
    contractId: mvpFlight.contractId,
    boosterId: need(ids, mvpFlight.booster),
    shipId: need(ids, mvpFlight.ship),
    padId: need(ids, mvpFlight.mount),
    ...opts,
  });
  world.prep[cd.id] = {
    towerId: need(ids, mvpFlight.tower),
    transporterId: need(ids, mvpFlight.transporter),
    craneId: need(ids, mvpFlight.crane),
    stackRequested: false,
  };
  return cd;
}
