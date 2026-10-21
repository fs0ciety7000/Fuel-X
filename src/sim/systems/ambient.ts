// Ambient logistics (7.3, GDD AC 26): background duty of the `ambient` transporters (SP-42). Pipeline slot 6b, right
// after logistics, so it sees this tick's road state, SP-41 (prep, slot 5) and the tankers.
//
// Loop: IDLE at the yard bay (dwell) → `depart` → MOVING out along `lc1Layout.ambientDuty[cs].out` → AT_PAD at the
// tank-farm apron (dwell) → `unloaded` → RETURNING along `back` → `home` → IDLE … at `transporter.speedEmptyMPerS`.
// - Keep-alive: a dwell is only taken while another tanker (INBOUND / OUTBOUND) or transporter (MOVING / RETURNING) is
//   moving; when nothing else moves the dwell ends at once, so the site never goes still (AC 26).
// - Road closure: the closure tick is bounded below by the T-clock (it cannot run faster than 1 s per s), so the duty
//   plans against `ticksToRoadClosure`: no departure inside it, a farm dwell ends in time to get home, an outbound leg
//   turns back mid-way (`turnBack`) when going on would make it late. Parked (IDLE) through the closure (terminal
//   count, flight, safing); resumes once the road reopens (after Safing, or after a scrub / recycle).
// - Wind: like SP-41 — above `windLimit.transporterMPerS` a moving SP-42 goes WIND_HOLD (resume deadband
//   `resumeMarginMPerS`), a dwelling one does not leave. A wind hold that makes it late just delays its parking.
// - It never touches SP-41 / CR-77 / tower tasks, commands or the economy (no cargo, no fees).
import { lc1Layout, logistics as ld } from '@data/index';
import type { Lc1PathId } from '@data/index';
import { entitiesOfKind } from '../core/entities';
import { secondsToTicks } from '../core/time';
import type { World } from '../core/world';
import { fire, transporterFsm } from '../entities/machines';
import type { EntityOf } from '../types';
import { ticksToRoadClosure } from './logistics';
import { advanceRoute, routeTicks, startRoute, startRouteAt } from './motion';

type Transporter = EntityOf<'transporter'>;
interface Duty {
  readonly out: Lc1PathId;
  readonly back: Lc1PathId;
}

const SPEED = ld.transporter.speedEmptyMPerS;
const DWELL_YARD_TICKS = secondsToTicks(ld.ambientTransporter.dwellYardS);
const DWELL_FARM_TICKS = secondsToTicks(ld.ambientTransporter.dwellFarmS);
/** A departure needs at least this many ticks before the closure (out one tick, back one tick). */
const MIN_TRIP_TICKS = 2;

/** True when any tanker or transporter other than `self` is on the move (AC 26 definition). */
export function otherLogisticsMoving(world: World, self: Transporter | null): boolean {
  for (const t of entitiesOfKind(world, 'tanker')) {
    if (t.fsm.state === 'INBOUND' || t.fsm.state === 'OUTBOUND') return true;
  }
  for (const t of entitiesOfKind(world, 'transporter')) {
    if (t !== self && (t.fsm.state === 'MOVING' || t.fsm.state === 'RETURNING')) return true;
  }
  return false;
}

function gusty(world: World, held: boolean): boolean {
  return world.weather.groundGustMPerS > ld.windLimit.transporterMPerS - (held ? ld.windLimit.resumeMarginMPerS : 0);
}

const dwellOver = (world: World, sp: Transporter, ticks: number): boolean =>
  world.tick - sp.fsm.enteredTick >= ticks || !otherLogisticsMoving(world, sp);

/** IDLE at the yard bay: leave when the dwell is over and a trip still fits before the road closes. */
function maybeDepart(world: World, sp: Transporter, duty: Duty, closureIn: number): void {
  if (closureIn < MIN_TRIP_TICKS || gusty(world, false)) return;
  if (!dwellOver(world, sp, DWELL_YARD_TICKS)) return;
  fire(world, transporterFsm, sp, 'depart');
  startRoute(sp, duty.out, SPEED);
}

/** AT_PAD at the farm apron: head home when the dwell is over or the road is about to close. */
function maybeLeaveFarm(world: World, sp: Transporter, duty: Duty, closureIn: number): void {
  if (gusty(world, false)) return;
  const late = closureIn <= routeTicks(duty.back, SPEED);
  if (!late && !dwellOver(world, sp, DWELL_FARM_TICKS)) return;
  fire(world, transporterFsm, sp, 'unloaded');
  startRoute(sp, duty.back, SPEED);
}

function updateAmbient(world: World, sp: Transporter, duty: Duty, closureIn: number): void {
  switch (sp.fsm.state) {
    case 'IDLE':
      maybeDepart(world, sp, duty, closureIn);
      return;
    case 'AT_PAD':
      maybeLeaveFarm(world, sp, duty, closureIn);
      return;
    case 'MOVING': {
      if (gusty(world, false)) {
        fire(world, transporterFsm, sp, 'windHigh');
        return;
      }
      const moved = sp.route?.movedTicks ?? 0;
      if (closureIn <= moved + 1) {
        // Back the way it came: position d along `out` = length − d along `back` (same length, same speed). The gap
        // closureIn − moved shrinks by 2 per counting tick, so it is caught at 0 or 1; on 1 the return is one tick
        // longer (a ≤ 7 cm step back along the path) so the bay is reached exactly on the closure tick.
        fire(world, transporterFsm, sp, 'turnBack');
        startRouteAt(sp, duty.back, SPEED, routeTicks(duty.back, SPEED) - Math.max(moved, closureIn));
        return;
      }
      if (!advanceRoute(sp)) return;
      fire(world, transporterFsm, sp, 'arrived');
      maybeLeaveFarm(world, sp, duty, closureIn);
      return;
    }
    case 'RETURNING':
      if (gusty(world, false)) {
        fire(world, transporterFsm, sp, 'windHigh');
        return;
      }
      if (!advanceRoute(sp)) return;
      fire(world, transporterFsm, sp, 'home');
      sp.route = null;
      maybeDepart(world, sp, duty, closureIn);
      return;
    case 'WIND_HOLD':
      if (!gusty(world, true)) {
        fire(world, transporterFsm, sp, sp.route?.pathId === duty.out ? 'windOkLoaded' : 'windOkEmpty');
      }
      return;
    case 'LOADING':
      return; // not part of the ambient loop
  }
}

/** Runs every `ambient` transporter with a duty in the LC-1 layout, in entity order. */
export function ambientSystem(world: World): void {
  let closureIn: number | null = null;
  for (const sp of entitiesOfKind(world, 'transporter')) {
    if (sp.role !== 'ambient' || sp.siteId !== lc1Layout.siteId) continue;
    const duty = lc1Layout.ambientDuty[sp.callSign];
    if (!duty) continue;
    closureIn ??= world.logistics.roadClosed ? 0 : ticksToRoadClosure(world);
    updateAmbient(world, sp, duty, closureIn);
  }
}
