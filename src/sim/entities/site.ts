// Entity factories: spawn the LC-1 layout (GDD §13.1) with kind-specific start fields from src/data.
import { lc1Layout, logistics, propellant, vehicles } from '@data/index';
import type { Fluid, Placement, Propellant } from '@data/index';
import { spawnEntity } from '../core/entities';
import type { EntitySpec } from '../core/entities';
import type { World } from '../core/world';
import { headingToQuat } from '../math/path';
import type { Entity, EntityBase, Id, Kind, PropTanks } from '../types';

/** Any kind's spawn spec (distributive, so object literals are checked per kind). */
export type AnyEntitySpec = { [K in Kind]: EntitySpec<K> }[Kind];

function base(p: Placement): Omit<EntityBase<Kind>, 'id' | 'slot'> {
  return {
    kind: p.kind,
    callSign: p.callSign,
    siteId: lc1Layout.siteId,
    pos: { x: p.pos.x, y: p.pos.y, z: p.pos.z },
    rot: headingToQuat(p.headingRad),
    asset: p.asset,
  };
}

export function emptyProp(stage: { loxCapKg: number; ch4CapKg: number }): PropTanks {
  return { loxKg: 0, ch4Kg: 0, loxCapKg: stage.loxCapKg, ch4CapKg: stage.ch4CapKg };
}

const TANK_FLUID: Record<string, Fluid> = { 'LOX-': 'LOX', 'CH4-': 'CH4', 'LN2-': 'LN2' };

function tankFluid(callSign: string): Fluid {
  const prefix = Object.keys(TANK_FLUID).find((k) => callSign.startsWith(k));
  if (!prefix) throw new Error(`tank ${callSign}: unknown fluid prefix`);
  return TANK_FLUID[prefix] as Fluid;
}

function tankerFluid(callSign: string): Propellant {
  return callSign.startsWith('MX-') ? 'CH4' : 'LOX';
}

export function tankerCapKg(fluid: Propellant): number {
  return fluid === 'LOX' ? logistics.tanker.loxCapKg : logistics.tanker.ch4CapKg;
}

/** Start mass of one farm tank: MVP inventory split evenly; LN2 is ambient (full, static). */
function tankStart(fluid: Fluid): { massKg: number; capKg: number } {
  const f = propellant.farm;
  switch (fluid) {
    case 'LOX':
      return { massKg: propellant.mvpStart.farmLoxKg / f.loxTankCount, capKg: f.loxTankCapKg };
    case 'CH4':
      return { massKg: propellant.mvpStart.farmCh4Kg / f.ch4TankCount, capKg: f.ch4TankCapKg };
    case 'LN2':
      return { massKg: f.ln2TankCapKg, capKg: f.ln2TankCapKg };
  }
}

function specFor(world: World, p: Placement): AnyEntitySpec {
  const b = base(p);
  const fsm = <S extends string>(state: S) => ({ state, enteredTick: world.tick });
  switch (p.kind) {
    case 'booster':
      return {
        ...b,
        kind: 'booster',
        fsm: fsm('IN_YARD'),
        prop: emptyProp(vehicles.booster),
        engines: { total: vehicles.booster.engines, lit: 0, failed: 0 },
        flight: null,
        recovery: null,
        wear: vehicles.mvpBooster.wear,
        flights: vehicles.mvpBooster.flightCount,
      } satisfies EntitySpec<'booster'>;
    case 'ship':
      return {
        ...b,
        kind: 'ship',
        fsm: fsm('IN_YARD'),
        prop: emptyProp(vehicles.ship),
        engines: { total: vehicles.ship.engines, lit: 0, failed: 0 },
        flight: null,
      } satisfies EntitySpec<'ship'>;
    case 'tank': {
      const fluid = tankFluid(p.callSign);
      return { ...b, kind: 'tank', fluid, ...tankStart(fluid), boiledOffKg: 0 } satisfies EntitySpec<'tank'>;
    }
    case 'tanker': {
      const fluid = tankerFluid(p.callSign);
      return {
        ...b,
        kind: 'tanker',
        fluid,
        fsm: fsm('OFFMAP'),
        capKg: tankerCapKg(fluid),
        cargoKg: 0,
        chartered: false,
        order: null,
        route: null,
      } satisfies EntitySpec<'tanker'>;
    }
    case 'tower':
      return { ...b, kind: 'tower', fsm: fsm('IDLE'), arms: 'OPEN', task: null } satisfies EntitySpec<'tower'>;
    case 'pad':
      return { ...b, kind: 'pad', boosterId: null } satisfies EntitySpec<'pad'>;
    case 'transporter':
      return {
        ...b,
        kind: 'transporter',
        fsm: fsm('IDLE'),
        cargo: null,
        route: null,
      } satisfies EntitySpec<'transporter'>;
    case 'crane':
      return { ...b, kind: 'crane', fsm: fsm('IDLE'), task: null } satisfies EntitySpec<'crane'>;
    case 'van':
      return { ...b, kind: 'van', fsm: fsm('AT_PAD'), route: null } satisfies EntitySpec<'van'>;
    case 'boat': {
      const patrol = lc1Layout.patrols[p.callSign];
      return {
        ...b,
        kind: 'boat',
        role: patrol ? 'picket' : 'recovery',
        fsm: fsm(patrol ? 'PATROL' : 'ON_STATION'),
        route: patrol ? { pathId: patrol, movedTicks: 0, speedMPerS: logistics.picketPatrolSpeedMPerS } : null,
        leg: null,
        targetId: null,
        escortEndTick: null,
      } satisfies EntitySpec<'boat'>;
    }
    default:
      // Weather stations (read world.weather) and buildings (ambient) carry no sim fields.
      return b as AnyEntitySpec;
  }
}

/**
 * Spawns every placement of the LC-1 layout in data order, registers the farm tanks, and returns the
 * entity ids by call-sign.
 */
export function spawnSiteLayout(world: World): Record<string, Id> {
  const ids: Record<string, Id> = {};
  for (const p of lc1Layout.placements) {
    const e = spawnEntity(world, specFor(world, p)) as Entity;
    ids[p.callSign] = e.id;
    if (e.kind === 'tank') world.logistics.farm[e.fluid].push(e.id);
  }
  return ids;
}
