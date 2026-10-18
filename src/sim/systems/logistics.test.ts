import { economy, lc1Layout, logistics as ld } from '@data/index';
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../core/events';
import { hashWorld, serializeWorld, deserializeWorld } from '../core/serialize';
import { secondsToTicks as T } from '../core/time';
import { tankerFsm, TANKER_STATES } from '../entities/machines';
import { entity, id, mvpSetup, rejected, run, runUntil, stateChanges } from '../fixtures.test-utils';
import { pathLengthM } from '../math/path';
import { advance, step } from '../step';
import type { EntityOf, TankerState } from '../types';
import { farmMassKg } from './propellant';

const olm = lc1Layout.points.olm1;
const distToPad = (t: EntityOf<'tanker'>): number => Math.hypot(t.pos.x - olm.x, t.pos.z - olm.z);
const offloadTicks = (kg: number): number => Math.ceil(kg / (ld.tanker.offloadRateKgPerS / 30) - 1e-9);

describe('tanker FSM table', () => {
  it.each<[TankerState, string, TankerState | null]>([
    ['OFFMAP', 'depart', 'INBOUND'],
    ['INBOUND', 'gateClosed', 'GATE_WAIT'],
    ['GATE_WAIT', 'gateOpen', 'INBOUND'],
    ['INBOUND', 'atBay', 'OFFLOADING'],
    ['OFFLOADING', 'offloadEnd', 'OUTBOUND'],
    ['OUTBOUND', 'offMap', 'OFFMAP'],
    ['OFFMAP', 'atBay', null],
    ['GATE_WAIT', 'atBay', null],
    ['OFFLOADING', 'gateClosed', null],
  ])('%s --%s--> %s', (from, on, to) => {
    const { world, ids } = mvpSetup();
    const t = entity(world, id(ids, 'LX-01'), 'tanker');
    t.fsm.state = from;
    const fired = tankerFsm.fire(t.fsm, on as never, { world, e: t });
    expect(fired?.to ?? null).toBe(to);
    if (to) expect(world.outbox.at(-1)).toMatchObject({ t: 'EntityStateChanged', id: t.id, from, to });
    else expect(world.outbox).toHaveLength(0);
  });

  it('lists every state', () => {
    expect(TANKER_STATES).toEqual(tankerFsm.states);
  });
});

describe('OrderDelivery (AC 7)', () => {
  it('standard: fleet truck, fee event, gate at lead time, offload at rate, leaves; farm rises by delivered mass', () => {
    const { world, ids } = mvpSetup();
    const lx = entity(world, id(ids, 'LX-01'), 'tanker');
    const farm0 = farmMassKg(world, 'LOX');
    const boil0 = world.logistics.ledger.LOX.farmBoilOffKg;
    const ordered = step(world, [{ t: 'OrderDelivery', fluid: 'LOX', rush: false }]);
    expect(ordered).toEqual([
      {
        t: 'DeliveryOrdered',
        tick: 0,
        orderId: 'DO-001',
        tankerId: lx.id,
        callSign: 'LX-01',
        fluid: 'LOX',
        rush: false,
        cargoKg: ld.tanker.loxCapKg,
        feeCr: ld.delivery.standard.feeCrPerTruck,
        gateEtaTick: T(ld.delivery.standard.leadTimeS),
      },
      // 3.8 economy charges the haulage fee in the same tick.
      expect.objectContaining({
        t: 'LedgerPosted',
        item: 'HAULAGE_FEE',
        amountCr: -ld.delivery.standard.feeCrPerTruck,
      }),
    ]);
    expect(world.economy.moneyCr).toBe(economy.startMoneyCr - ld.delivery.standard.feeCrPerTruck);

    const log: SimEvent[] = [];
    log.push(...runUntil(world, () => lx.route?.pathId === 'tanker.gateToLoxBay'));
    const gateTick = world.tick - 1;
    expect(Math.abs(gateTick - T(ld.delivery.standard.leadTimeS))).toBeLessThanOrEqual(1);

    log.push(...runUntil(world, () => lx.fsm.state === 'OFFMAP'));
    expect(stateChanges(log, lx.id)).toEqual(['INBOUND', 'OFFLOADING', 'OUTBOUND', 'OFFMAP']);
    const at = (to: string): number => log.find((e) => e.t === 'EntityStateChanged' && e.to === to)?.tick ?? -1;
    expect(at('OUTBOUND') - at('OFFLOADING')).toBe(offloadTicks(ld.tanker.loxCapKg));
    // Off-map → gate drive starts exactly `drive` ticks before the ETA.
    const drive = Math.ceil(pathLengthM('tanker.offMapToGate') / (ld.tanker.speedOnSiteMPerS / 30) - 1e-9);
    expect(at('INBOUND')).toBe(T(ld.delivery.standard.leadTimeS) - drive);

    const done = log.find((e) => e.t === 'DeliveryCompleted');
    expect(done).toMatchObject({
      orderId: 'DO-001',
      deliveredKg: ld.tanker.loxCapKg,
      costCr: ld.tanker.loxCapKg * economy.priceCrPerKg.LOX,
      aborted: false,
    });
    const boiled = world.logistics.ledger.LOX.farmBoilOffKg - boil0;
    expect(boiled).toBeGreaterThan(0);
    expect(farmMassKg(world, 'LOX') - farm0).toBeCloseTo(ld.tanker.loxCapKg - boiled, 6);
    expect(lx.order).toBeNull();
    expect(lx.cargoKg).toBe(0);
    expect(world.logistics.ledger.LOX.deliveredKg).toBe(ld.tanker.loxCapKg);
    expect(world.economy.moneyCr).toBeCloseTo(
      economy.startMoneyCr - ld.delivery.standard.feeCrPerTruck - ld.tanker.loxCapKg * economy.priceCrPerKg.LOX,
      6,
    );
  });

  it('rush: charters an extra truck with the next serial, arrives after the rush lead time, despawns', () => {
    const { world } = mvpSetup();
    const events = step(world, [{ t: 'OrderDelivery', fluid: 'CH4', rush: true }]);
    expect(events.map((e) => e.t)).toEqual(['Spawned', 'DeliveryOrdered', 'LedgerPosted']);
    expect(events[2]).toMatchObject({ item: 'HAULAGE_FEE', amountCr: -ld.delivery.rush.feeCrPerTruck });
    expect(events[0]).toMatchObject({ kind: 'tanker', callSign: 'MX-03' });
    expect(events[1]).toMatchObject({
      callSign: 'MX-03',
      rush: true,
      cargoKg: ld.tanker.ch4CapKg,
      feeCr: ld.delivery.rush.feeCrPerTruck,
      gateEtaTick: T(ld.delivery.rush.leadTimeS),
    });
    const tankerId = events[0]?.t === 'Spawned' ? events[0].id : '';
    const mx = entity(world, tankerId, 'tanker');
    expect(mx.chartered).toBe(true);
    runUntil(world, () => mx.route?.pathId === 'tanker.gateToCh4Bay');
    expect(Math.abs(world.tick - 1 - T(ld.delivery.rush.leadTimeS))).toBeLessThanOrEqual(1);
    const log = runUntil(world, () => !(tankerId in world.entities.byId));
    expect(log.find((e) => e.t === 'DeliveryCompleted')).toMatchObject({ deliveredKg: ld.tanker.ch4CapKg });
    expect(log.at(-1)).toMatchObject({ t: 'Despawned', id: tankerId, callSign: 'MX-03' });
  });

  it('standard orders are limited by the fleet', () => {
    const { world } = mvpSetup();
    const order = { t: 'OrderDelivery', fluid: 'CH4', rush: false } as const;
    const events = step(world, [order, order, order]);
    expect(events.filter((e) => e.t === 'DeliveryOrdered')).toHaveLength(ld.fleet.mx);
    expect(rejected(events)).toEqual(['NO_TANKER_AVAILABLE']);
  });
});

describe('road closure and GATE_WAIT (AC 8)', () => {
  it('closes at T-00:40:00; arriving tankers wait at the gate and never enter the hazard radius', () => {
    const { world, cd, ids } = mvpSetup({ startTS: -2_460, phase: 'PropellantLoad', pollsPassed: ['load'] });
    const events = step(world, [{ t: 'OrderDelivery', fluid: 'LOX', rush: false }]);
    const lx = entity(world, id(ids, 'LX-01'), 'tanker');
    // Pull the ETA forward so it falls inside the closure (lead time is a data value; the rule is what's tested).
    if (lx.order) {
      lx.order.gateEtaTick = world.tick + T(1_200);
      lx.order.departTick = lx.order.gateEtaTick - T(400);
    }
    expect(events[0]?.t).toBe('DeliveryOrdered');
    const log = run(world, T(60));
    expect(log.find((e) => e.t === 'RoadClosureChanged')).toMatchObject({ closed: true, siteId: 'LC-1' });
    expect(world.logistics.roadClosed).toBe(true);
    let maxInside = 0;
    for (let i = 0; i < T(5_000) && cd.phase.state !== 'Scrubbed'; i++) {
      step(world);
      if (world.logistics.roadClosed && distToPad(lx) < ld.hazardPadRadiusM) maxInside++;
    }
    expect(maxInside).toBe(0);
    expect(lx.fsm.state).toBe('GATE_WAIT');
    expect(lx.pos).toEqual(lc1Layout.points.tankerGate);
    // Window closes → scrub → road reopens → the tanker drives on and offloads.
    const after = runUntil(world, () => cd.phase.state !== 'PropellantLoad' && cd.phase.state !== 'TerminalCount');
    after.push(...runUntil(world, () => lx.fsm.state === 'OFFLOADING'));
    expect(after.find((e) => e.t === 'RoadClosureChanged')).toMatchObject({ closed: false });
    expect(stateChanges(after, lx.id)).toEqual(['INBOUND', 'OFFLOADING']);
  });

  it('a truck offloading when the road closes stops and leaves with the rest of its cargo', () => {
    const { world, ids } = mvpSetup({ startTS: -3_000, phase: 'PropellantLoad', pollsPassed: ['load'] });
    const lx = entity(world, id(ids, 'LX-02'), 'tanker');
    lx.fsm.state = 'OFFLOADING';
    lx.cargoKg = lx.capKg;
    lx.order = { id: 'DO-X', rush: false, placedTick: 0, departTick: 0, gateEtaTick: 0, deliveredKg: 0 };
    const farm0 = farmMassKg(world, 'LOX');
    const log = runUntil(world, () => lx.fsm.state === 'OUTBOUND');
    const done = log.find((e) => e.t === 'DeliveryCompleted');
    expect(done).toMatchObject({ aborted: true });
    const delivered = done?.t === 'DeliveryCompleted' ? done.deliveredKg : 0;
    expect(Math.abs(delivered - 600 * ld.tanker.offloadRateKgPerS)).toBeLessThanOrEqual(
      ld.tanker.offloadRateKgPerS / 30,
    );
    expect(lx.cargoKg).toBeCloseTo(lx.capKg - delivered, 6);
    expect(farmMassKg(world, 'LOX')).toBeCloseTo(farm0 + delivered - world.logistics.ledger.LOX.farmBoilOffKg, 6);
  });

  it('a full farm ends the offload early', () => {
    const { world, ids } = mvpSetup();
    for (const tid of world.logistics.farm.CH4) entity(world, tid, 'tank').massKg = entity(world, tid, 'tank').capKg;
    const mx = entity(world, id(ids, 'MX-01'), 'tanker');
    mx.fsm.state = 'OFFLOADING';
    mx.cargoKg = 1_000;
    mx.order = { id: 'DO-Y', rush: false, placedTick: 0, departTick: 0, gateEtaTick: 0, deliveredKg: 0 };
    const log = run(world, 2);
    expect(log.find((e) => e.t === 'DeliveryCompleted')).toMatchObject({ aborted: true });
    expect(mx.fsm.state).toBe('OUTBOUND');
  });
});

describe('logistics determinism', () => {
  it('save/load mid-delivery reproduces the straight run', () => {
    const a = mvpSetup();
    const b = mvpSetup();
    const order = { t: 'OrderDelivery', fluid: 'LOX', rush: true } as const;
    step(a.world, [order]);
    step(b.world, [order]);
    advance(a.world, T(6_000));
    advance(b.world, T(5_500));
    const loaded = deserializeWorld(serializeWorld(b.world));
    advance(loaded, T(500));
    expect(hashWorld(loaded)).toBe(hashWorld(a.world));
  });
});
