import {
  catchModel as cm,
  countdown as cdData,
  flightProfile as fp,
  lc1Layout,
  siteGeometry as geo,
  tower as td,
  vehicles,
} from '@data/index';
import { describe, expect, it } from 'vitest';
import type { Command } from '../core/commands';
import type { SimEvent } from '../core/events';
import { rngFromState, seedStream } from '../core/rng';
import { deserializeWorld, hashWorld, serializeWorld } from '../core/serialize';
import { secondsToTicks as T } from '../core/time';
import { BOOSTER_STATES, SHIP_STATES, boosterFsm, shipFsm } from '../entities/machines';
import { entity, id, mvpSetup, rejected, run, runUntil, stateChanges } from '../fixtures.test-utils';
import type { MvpSetup } from '../fixtures.test-utils';
import { rotateVec } from '../math/attitude';
import { catchProbability, erf } from '../math/catch';
import { step } from '../step';
import type { BoosterState, EntityOf, FlightEventName, Phase, ShipState } from '../types';
import { engineOut } from './flight';

// --- Fixtures -----------------------------------------------------------------------------------

interface FlightSetup extends MvpSetup {
  booster: EntityOf<'booster'>;
  ship: EntityOf<'ship'>;
  tower: EntityOf<'tower'>;
  liftoff: number;
  log: SimEvent[];
}

/** T-00:00:05 in terminal count, both stages full and stacked; runs through the liftoff tick. */
function toLiftoff(seed = 7): FlightSetup {
  const s = mvpSetup({ seed, startTS: -5, phase: 'TerminalCount', pollsPassed: ['load', 'terminal', 'final'] });
  const booster = entity(s.world, s.cd.boosterId, 'booster');
  const ship = entity(s.world, s.cd.shipId, 'ship');
  booster.pos = { x: 0, y: geo.pad.vehicleMountM, z: 0 }; // stacked asset origins (5.0b)
  ship.pos = { x: 0, y: geo.pad.vehicleMountM + geo.booster.shipMountM, z: 0 };
  for (const st of [booster, ship]) {
    st.fsm.state = 'LOADED';
    st.prop.loxKg = st.prop.loxCapKg;
    st.prop.ch4Kg = st.prop.ch4CapKg;
  }
  s.cd.inputs.loadComplete = true;
  s.cd.inputs.stackComplete = true;
  s.cd.inputs.rolloutComplete = true;
  const log = runUntil(s.world, () => s.cd.liftoffTick !== null);
  const tower = entity(s.world, id(s.ids, 'TOWER-1'), 'tower');
  return { ...s, booster, ship, tower, liftoff: s.cd.liftoffTick ?? -1, log };
}

/** Mission-time tick of a flight event (relative to liftoff), or −1. */
function at(f: FlightSetup, event: FlightEventName, kind: 'booster' | 'ship' = 'booster'): number {
  const e = f.log.find((x) => x.t === 'FlightEvent' && x.event === event && x.kind === kind);
  return e ? e.tick - f.liftoff : -1;
}

/** Runs to Debrief, calling `each` before every tick with the mission time in s. */
function fly(f: FlightSetup, each: (tS: number) => unknown = () => null): FlightSetup {
  while (f.cd.phase.state !== 'Debrief') {
    const r = each((f.world.tick - f.liftoff) / 30);
    const cmds = Array.isArray(r) ? (r as Command[]) : [];
    f.log.push(...step(f.world, cmds));
    if (f.world.tick - f.liftoff > T(4_000)) throw new Error('flight did not end');
  }
  return f;
}

const flightEvents = (log: readonly SimEvent[], kind: 'booster' | 'ship'): FlightEventName[] =>
  log.flatMap((e) => (e.t === 'FlightEvent' && e.kind === kind ? [e.event] : []));

const outcome = (f: FlightSetup) => f.log.find((e) => e.t === 'RecoveryOutcome');

// --- FSM tables ---------------------------------------------------------------------------------

describe('stage FSM tables', () => {
  it.each<[BoosterState, string, BoosterState | null]>([
    ['IN_YARD', 'craneLoaded', 'ON_TRANSPORTER'],
    ['ON_TRANSPORTER', 'stackStart', 'STACKING'],
    ['STACKING', 'stacked', 'STACKED'],
    ['STACKED', 'loadStart', 'LOADING'],
    ['LOADING', 'loadFull', 'LOADED'],
    ['LOADED', 'scrub', 'DETANKING'],
    ['DETANKING', 'detanked', 'STACKED'],
    ['LOADED', 'liftoff', 'ASCENT'],
    ['ASCENT', 'boostbackStart', 'BOOSTBACK'],
    ['BOOSTBACK', 'boostbackEnd', 'DESCENT'],
    ['BOOSTBACK', 'divert', 'DIVERTED'],
    ['DESCENT', 'divert', 'DIVERTED'],
    ['DESCENT', 'caught', 'CAUGHT_SAFING'],
    ['DIVERTED', 'lost', 'LOST'],
    ['DESCENT', 'lost', 'LOST'],
    ['STACKED', 'liftoff', null],
    ['DIVERTED', 'caught', null],
    ['DIVERTED', 'boostbackEnd', null],
    ['CAUGHT_SAFING', 'lost', null],
  ])('booster %s --%s--> %s', (from, on, to) => {
    const { world, cd } = mvpSetup();
    const b = entity(world, cd.boosterId, 'booster');
    b.fsm.state = from;
    expect(boosterFsm.fire(b.fsm, on as never, { world, e: b })?.to ?? null).toBe(to);
    expect(world.outbox).toHaveLength(to ? 1 : 0);
  });

  it.each<[ShipState, string, ShipState | null]>([
    ['LOADED', 'liftoff', 'ASCENT'],
    ['ASCENT', 'separation', 'SEPARATED'],
    ['SEPARATED', 'seco', 'SECO'],
    ['SECO', 'leave', 'OFF_SCENE'],
    ['ASCENT', 'seco', null],
    ['OFF_SCENE', 'liftoff', null],
  ])('ship %s --%s--> %s', (from, on, to) => {
    const { world, cd } = mvpSetup();
    const s = entity(world, cd.shipId, 'ship');
    s.fsm.state = from;
    expect(shipFsm.fire(s.fsm, on as never, { world, e: s })?.to ?? null).toBe(to);
  });

  it('list every state', () => {
    expect(boosterFsm.states).toEqual(BOOSTER_STATES);
    expect(shipFsm.states).toEqual(SHIP_STATES);
  });
});

// --- Catch model ----------------------------------------------------------------------------------

describe('catch model (BALANCING §7)', () => {
  it('erf matches reference values', () => {
    expect(erf(0)).toBeCloseTo(0, 6);
    expect(erf(0.5)).toBeCloseTo(0.5204999, 6);
    expect(erf(1)).toBeCloseTo(0.8427008, 6);
    expect(erf(-1)).toBeCloseTo(-0.8427008, 6);
    expect(erf(3)).toBeCloseTo(0.9999779, 6);
  });

  it.each<[string, number, number, number, number, number]>([
    // name, engines out, tower wind m/s, landing prop kg, σ m, p
    // BALANCING §7 reference cases (pass 1, §13): σ reference is tower wind 11 m/s.
    ['nominal', 0, 0, 90_000, 0.6, 0.997],
    ['nominal, tower wind 14.3 m/s', 0, 14.3, 90_000, 1.095, 0.9],
    ['nominal, tower wind 16.9 m/s (ground launch limit)', 0, 16.9, 90_000, 1.485, 0.775],
    ['ascent engine-out (65 t), calm', 1, 0, 65_000, 1.6, 0.74],
    ['ascent engine-out, tower wind 14 m/s', 1, 14, 65_000, 2.05, 0.62],
    ['boostback engine-out (55 t, low prop), calm', 1, 0, 55_000, 2.0, 0.63],
    ['boostback engine-out, tower wind 14 m/s', 1, 14, 55_000, 2.45, 0.537],
    ['boostback engine-out, tower wind 16 m/s', 1, 16, 55_000, 2.75, 0.49],
  ])('%s', (_n, enginesOut, towerWindMPerS, landingPropKg, sigma, p) => {
    const r = catchProbability({ enginesOut, towerWindMPerS, landingPropKg });
    expect(r.sigmaM).toBeCloseTo(sigma, 9);
    expect(r.p).toBeCloseTo(p, 2);
  });

  it('a boostback engine-out is low-prop, an ascent one is not (lowPropRefKg between 55 t and 65 t)', () => {
    expect(cm.lowPropRefKg).toBeGreaterThan(55_000);
    expect(cm.lowPropRefKg).toBeLessThanOrEqual(65_000);
  });
});

// --- Nominal flight (AC 16) ---------------------------------------------------------------------

describe('nominal flight, no input (AC 16, 19–21)', () => {
  const f = fly(toLiftoff());

  it('MECO at T+155 s ± 2 s near 68 km; catch at T+415 s ± 5 s', () => {
    expect(Math.abs(at(f, 'MECO') / 30 - 155)).toBeLessThanOrEqual(fp.tolerance.mecoS);
    const meco = f.log.find((e) => e.t === 'FlightEvent' && e.event === 'MECO');
    expect(meco?.t === 'FlightEvent' && meco.altitudeM).toBeCloseTo(68_000, -3);
    expect(Math.abs(at(f, 'CATCH') / 30 - 415)).toBeLessThanOrEqual(fp.tolerance.catchS);
    expect(at(f, 'MECO')).toBe(T(155)); // exactly on profile without anomalies
  });

  it('emits every profile event in order; S-21 separates, reaches SECO and leaves', () => {
    expect(flightEvents(f.log, 'booster')).toEqual(fp.booster.map((k) => k.event));
    expect(flightEvents(f.log, 'ship')).toEqual(['SECO']);
    expect(at(f, 'SECO', 'ship')).toBe(T(fp.ship.secoTS));
    expect(stateChanges(f.log, f.ship.id)).toEqual(['ASCENT', 'SEPARATED', 'SECO', 'OFF_SCENE']);
    expect(f.ship.id in f.world.entities.byId).toBe(false);
    expect(f.log.find((e) => e.t === 'Despawned' && e.id === f.ship.id)).toBeTruthy();
  });

  it('engines lit follow the phases: 33 → 0 → 13 → 0 → 3 → 0; ship 6 after separation', () => {
    const lit = (eid: string): number[] =>
      f.log.flatMap((e) => (e.t === 'EnginesChanged' && e.id === eid ? [e.lit] : []));
    expect(lit(f.booster.id)).toEqual([
      vehicles.booster.engines,
      0,
      vehicles.booster.boostbackEngines,
      0,
      vehicles.booster.landingEngines,
      0,
    ]);
    expect(lit(f.ship.id)).toEqual([vehicles.ship.engines, 0]);
  });

  it('asks for the catch decision at boostback start with the landing-burn deadline', () => {
    const req = f.log.find((e) => e.t === 'DecisionRequired' && e.decision === 'CATCH');
    expect(req?.tick).toBe(f.liftoff + at(f, 'BOOSTBACK_START'));
    expect(req?.tick).toBeLessThanOrEqual(f.liftoff + at(f, 'BOOSTBACK_END'));
    expect(req?.t === 'DecisionRequired' && req.deadlineTick).toBe(f.liftoff + at(f, 'LANDING_BURN'));
  });

  it('auto policy catches at the deadline (p ≈ 0.997 ≥ autoCatchThreshold); arms close; booster CAUGHT_SAFING', () => {
    const c = f.log.find((e) => e.t === 'RecoveryCommitted');
    expect(c).toMatchObject({ mode: 'CATCH', by: 'AUTO' });
    expect(c?.tick).toBe(f.liftoff + at(f, 'LANDING_BURN'));
    expect(f.booster.recovery?.p).toBeCloseTo(0.997, 3);
    expect(outcome(f)).toMatchObject({ result: 'CAUGHT', mode: 'CATCH' });
    expect(f.booster.fsm.state).toBe('CAUGHT_SAFING');
    expect(f.booster.pos).toEqual(lc1Layout.points.catchPoint);
    expect(f.tower.arms).toBe('CLOSED');
    expect(stateChanges(f.log, f.tower.id)).toEqual(['CATCH_READY', 'CATCHING', 'IDLE']);
    expect(stateChanges(f.log, f.booster.id)).toEqual(['ASCENT', 'BOOSTBACK', 'DESCENT', 'CAUGHT_SAFING']);
  });

  it('drives the countdown through Boostback, TowerCatch, Safing to Debrief', () => {
    const phases = f.log.flatMap((e) => (e.t === 'PhaseChanged' ? [e.to] : []));
    expect(phases).toEqual<Phase[]>(['Liftoff', 'Boostback', 'TowerCatch', 'Safing', 'Debrief']);
    const sep = f.log.find((e) => e.t === 'PhaseChanged' && e.to === 'Boostback');
    expect(sep?.tick).toBe(f.liftoff + at(f, 'HOT_STAGING') + 1);
    const safing = f.log.find((e) => e.t === 'PhaseChanged' && e.to === 'Safing');
    expect(safing?.tick).toBe(f.liftoff + at(f, 'CATCH') + 1);
    expect(f.cd.inputs).toMatchObject({ stageSeparated: true, recoveryMode: 'CATCH', recoveryComplete: true });
  });

  it('is deterministic', () => {
    const again = fly(toLiftoff());
    expect(again.log).toEqual(f.log);
    expect(hashWorld(again.world)).toBe(hashWorld(f.world));
  });
});

describe('eased liftoff and throttle in flight (5.10)', () => {
  const f = toLiftoff();
  const b0 = { ...f.booster.engines };
  const samples = new Map<number, { alt: number; v: number; vv: number; dr: number; thr: number; shipThr: number }>();
  fly(f, (tS) => {
    const s = Math.round(tS * 30) / 30;
    if (s * 2 !== Math.round(s * 2)) return; // every 0.5 s
    const ship = f.world.entities.byId[f.ship.id];
    const bf = f.booster.flight;
    if (!bf) return;
    samples.set(s, {
      alt: bf.altitudeM,
      v: bf.speedMPerS,
      vv: bf.verticalSpeedMPerS,
      dr: bf.downrangeM,
      thr: f.booster.engines.throttle,
      shipThr: ship?.kind === 'ship' ? ship.engines.throttle : 0,
    });
  });
  const get = (t: number) => {
    const s = samples.get(t);
    if (!s) throw new Error(`no sample at T+${t}`);
    return s;
  };

  it('accelerates from rest: v and h at T+1, 3, 8, 20 s within the BALANCING ranges', () => {
    expect(get(1)).toMatchObject({ dr: 0 });
    expect(get(1).alt).toBeGreaterThan(21);
    expect(get(1).alt).toBeLessThan(24);
    expect(get(1).v).toBeLessThan(6);
    expect(get(3).alt).toBeLessThan(45);
    expect(get(3).v).toBeLessThan(17);
    expect(get(8).alt).toBeGreaterThan(150);
    expect(get(8).alt).toBeLessThan(190);
    expect(get(20).alt).toBeGreaterThan(950);
    expect(get(20).alt).toBeLessThan(1_150);
    expect(get(20).v).toBeGreaterThan(95);
    expect(get(20).v).toBeLessThan(125);
  });

  it('altitude and vertical speed rise monotonically to Max-Q; clears the 146 m tower tip at T+7–8 s', () => {
    for (let t = 1; t <= 62; t += 0.5) {
      expect(get(t).alt).toBeGreaterThan(get(t - 0.5).alt);
      if (t >= 1.5) expect(get(t).vv).toBeGreaterThan(get(t - 0.5).vv);
    }
    expect(get(7).alt).toBeLessThan(146);
    expect(get(8).alt).toBeGreaterThan(146);
  });

  it('throttle: 1 off the mount, Max-Q bucket, 0 after MECO, boostback 1, landing ramp to 0.4', () => {
    expect(b0).toMatchObject({ lit: vehicles.booster.engines, throttle: 1 }); // set on the liftoff tick
    expect(get(1).thr).toBe(1);
    expect(get(62).thr).toBe(fp.throttle.maxQBucket.level);
    expect(get(100).thr).toBe(1);
    expect(get(158).thr).toBe(0);
    expect(get(190).thr).toBe(fp.throttle.boostback);
    expect(get(230).thr).toBe(0);
    expect(get(381).thr).toBeLessThan(1);
    expect(get(414).thr).toBeGreaterThan(fp.throttle.landingEnd);
    expect(get(414).thr).toBeLessThan(0.45);
    expect(f.booster.engines.throttle).toBe(0); // caught, engines off
    expect(get(100).shipThr).toBe(0); // stacked, unlit
    expect(get(200).shipThr).toBe(fp.throttle.ship);
  });
});

describe('flight telemetry (AC 17 inputs)', () => {
  it('altitude, speed, propellant, heading and position follow the profile in SI', () => {
    const f = toLiftoff();
    const samples: Record<number, { alt: number; v: number; prop: number; hdg: number; vz: number; x: number }> = {};
    fly(f, (tS) => {
      const fl = f.booster.flight;
      if (fl && [62, 100, 230, 300].includes(Math.round(tS * 30) / 30)) {
        samples[Math.round(tS)] = {
          alt: fl.altitudeM,
          v: fl.speedMPerS,
          prop: f.booster.prop.loxKg + f.booster.prop.ch4Kg,
          hdg: fl.headingRad,
          vz: fl.verticalSpeedMPerS,
          x: f.booster.pos.x,
        };
      }
    });
    // Sampled before the tick runs: values are those of the previous tick (mission time − 1 tick).
    expect(samples[62]?.alt).toBeCloseTo(12_000, -2);
    expect(samples[62]?.v).toBeCloseTo(450, -1);
    expect(samples[62]?.prop).toBeCloseTo(2_100_000, -4);
    expect(samples[100]?.hdg).toBeCloseTo(fp.launchHeadingRad, 9); // outbound, east
    expect(samples[100]?.vz).toBeGreaterThan(0);
    expect(samples[300]?.hdg).toBeCloseTo(fp.launchHeadingRad + Math.PI, 9); // returning
    expect(samples[300]?.vz).toBeLessThan(0);
    expect(samples[230]?.x).toBeGreaterThan(samples[300]?.x ?? Infinity);
  });
});

describe('mount heights and attitude (5.0b)', () => {
  const DEG = Math.PI / 180;
  const f = toLiftoff();
  interface Sample {
    tilt: number;
    shipTilt: number | null;
    y: number;
    shipY: number | null;
    up: { x: number; y: number; z: number };
    shipGap: number | null;
  }
  const at0 = { y: f.booster.pos.y, alt: f.booster.flight?.altitudeM, shipY: f.ship.pos.y };
  const samples = new Map<number, Sample>();
  fly(f, (tS) => {
    const s = Math.round(tS * 30) / 30;
    if (!Number.isInteger(s)) return;
    const b = f.booster;
    const ship = f.world.entities.byId[f.ship.id];
    const sf = ship?.kind === 'ship' && ship.flight && !ship.flight.done ? ship : null;
    const top = rotateVec(b.rot, { x: 0, y: geo.booster.shipMountM, z: 0 });
    samples.set(s, {
      tilt: b.flight?.tiltRad ?? 0,
      shipTilt: sf?.flight?.tiltRad ?? null,
      y: b.pos.y,
      shipY: sf ? sf.pos.y : null,
      up: rotateVec(b.rot, { x: 0, y: 1, z: 0 }),
      shipGap: sf
        ? Math.hypot(sf.pos.x - b.pos.x - top.x, sf.pos.y - b.pos.y - top.y, sf.pos.z - b.pos.z - top.z)
        : null,
    });
  });
  const get = (t: number): Sample => {
    const s = samples.get(t);
    if (!s) throw new Error(`no sample at T+${t}`);
    return s;
  };

  it('lifts off from the mount deck (20 m) with the ship origin on the booster top (91 m)', () => {
    expect(at0.y).toBe(geo.pad.vehicleMountM);
    expect(at0.alt).toBe(geo.pad.vehicleMountM);
    expect(at0.shipY).toBe(geo.pad.vehicleMountM + geo.booster.shipMountM);
  });

  it('rises vertically, then pitches over toward the profile climb angle (no faster than the rate limit)', () => {
    expect(get(5).tilt).toBe(0);
    expect(get(30).tilt).toBeGreaterThan(5 * DEG);
    // Near Max-Q the eased liftoff climbs at ≈ atan2(4 000, 11 980) ≈ 18.5° (5.10: 18.7° at T+60); Max-Q → MECO 45°.
    expect(get(60).tilt).toBeCloseTo(Math.atan2(4_000, 12_000 - geo.pad.vehicleMountM), 2);
    expect(get(150).tilt).toBeCloseTo(45 * DEG, 2);
    for (let t = 2; t < 160; t++) {
      expect(Math.abs(get(t).tilt - get(t - 1).tilt)).toBeLessThanOrEqual(fp.attitude.ascentRateRadPerS + 1e-9);
    }
    // +Y axis leans east (launch heading π/2 = +X), stays in the launch plane.
    expect(get(100).up.x).toBeGreaterThan(0);
    expect(get(100).up.z).toBeCloseTo(0, 12);
  });

  it('carries the ship on the tilted booster axis until hot staging; the ship then flies its own attitude', () => {
    for (const t of [10, 80, 159]) expect(get(t).shipGap).toBeCloseTo(0, 6);
    expect(get(159).shipTilt).toBe(get(159).tilt);
    const ship = get(400).shipTilt ?? 0;
    expect(ship).toBeGreaterThan(80 * DEG); // near-horizontal toward SECO (Δdownrange ≫ Δaltitude)
    expect(ship).toBeLessThan(90 * DEG);
  });

  it('flips for boostback (nose back toward the site), then rights itself for the landing burn and catch', () => {
    expect(get(190).tilt).toBeCloseTo(fp.attitude.boostbackTiltRad, 9);
    expect(get(190).up.x).toBeLessThan(0);
    expect(get(170).tilt).toBeLessThan(get(165).tilt);
    expect(get(400).tilt).toBeCloseTo(0, 9);
    expect(f.booster.flight?.tiltRad).toBe(0);
    expect(f.booster.rot).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });

  it('catches with the booster origin at 60 m, so its catch pins meet the carriage catch points (126 m)', () => {
    expect(outcome(f)).toMatchObject({ result: 'CAUGHT' });
    expect(f.booster.pos.y).toBe(geo.tower.catchCarriageM - geo.booster.catchPinM);
    expect(f.booster.pos.y + td.pins.boosterCatchPinM).toBe(f.tower.carriageM);
    expect(f.tower.carriageM).toBe(geo.tower.catchCarriageM);
  });
});

// --- Decisions (AC 19–20) ----------------------------------------------------------------------

describe('CatchDecision', () => {
  it('GO FOR CATCH during boostback commits at once and arms the tower', () => {
    const f = toLiftoff();
    fly(f, (tS) =>
      tS >= 170 && f.booster.recovery?.mode === null
        ? [{ t: 'CatchDecision', boosterId: f.booster.id, choice: 'CATCH' }]
        : [],
    );
    expect(f.log.find((e) => e.t === 'RecoveryCommitted')).toMatchObject({ mode: 'CATCH', by: 'PLAYER' });
    const tc = f.log.find((e) => e.t === 'PhaseChanged' && e.to === 'TowerCatch');
    expect(tc && tc.tick - f.liftoff).toBe(T(170)); // commands apply before the countdown runs
    expect(outcome(f)).toMatchObject({ result: 'CAUGHT' });
  });

  it('DIVERT flies to the offshore point and loses the booster; the tower is untouched', () => {
    const f = toLiftoff();
    fly(f, (tS) =>
      tS >= 200 && f.booster.recovery?.mode === null
        ? [{ t: 'CatchDecision', boosterId: f.booster.id, choice: 'DIVERT' }]
        : [],
    );
    expect(flightEvents(f.log, 'booster').slice(-2)).toEqual(['LANDING_BURN', 'SPLASHDOWN']);
    expect(at(f, 'SPLASHDOWN')).toBe(T(fp.divert.splashdownTS));
    expect(f.booster.pos.x).toBeCloseTo(lc1Layout.points.divertPoint.x, 6);
    expect(f.booster.pos.y).toBe(0);
    expect(outcome(f)).toMatchObject({ result: 'DIVERTED', mode: 'DIVERT', roll: null });
    expect(stateChanges(f.log, f.booster.id)).toEqual(['ASCENT', 'BOOSTBACK', 'DIVERTED', 'LOST']);
    expect(stateChanges(f.log, f.tower.id)).toEqual([]);
    const phases = f.log.flatMap((e) => (e.t === 'PhaseChanged' ? [e.to] : []));
    expect(phases).toEqual<Phase[]>(['Liftoff', 'Boostback', 'Divert', 'Safing', 'Debrief']);
    expect(flightEvents(f.log, 'ship')).toEqual(['SECO']); // contract event even when the booster is lost
  });

  it('rejects decisions outside the window, twice, or for an unknown booster', () => {
    const f = toLiftoff();
    const decide = (choice: 'CATCH' | 'DIVERT'): Command => ({ t: 'CatchDecision', boosterId: f.booster.id, choice });
    expect(rejected(step(f.world, [decide('CATCH')]))).toEqual(['NO_CATCH_DECISION_PENDING']);
    runUntil(f.world, () => f.booster.recovery?.decisionRequiredTick !== null);
    expect(rejected(step(f.world, [decide('DIVERT')]))).toEqual([]);
    expect(rejected(step(f.world, [decide('CATCH')]))).toEqual(['ALREADY_DECIDED']);
    expect(rejected(step(f.world, [{ t: 'CatchDecision', boosterId: 'e999999', choice: 'CATCH' }]))).toEqual([
      'UNKNOWN_BOOSTER',
    ]);
  });
});

describe('auto policy without input (AC 19)', () => {
  it.each<[string, (f: FlightSetup, tS: number) => void, 'CATCH' | 'DIVERT', 'AUTO' | 'FORCED']>([
    ['nominal → catch', () => {}, 'CATCH', 'AUTO'],
    [
      'one ascent engine-out, calm (p ≈ 0.74, LEAN) → catch',
      (f, tS) => void (tS === 30 && engineOut(f.world, f.booster.id)),
      'CATCH',
      'AUTO',
    ],
    [
      'tower wind 14 m/s, no engine-out (p ≈ 0.91) → catch',
      (f) => void (f.world.weather.towerWindMPerS = 14),
      'CATCH',
      'AUTO',
    ],
    [
      'ascent engine-out + tower wind 14 m/s (p ≈ 0.62, CONTESTED) → divert',
      (f, tS) => {
        f.world.weather.towerWindMPerS = 14;
        if (tS === 30) engineOut(f.world, f.booster.id);
      },
      'DIVERT',
      'AUTO',
    ],
    [
      'boostback engine-out, calm (p ≈ 0.63, low prop, CONTESTED) → divert',
      (f) =>
        void (
          f.booster.fsm.state === 'BOOSTBACK' &&
          f.booster.engines.failed === 0 &&
          engineOut(f.world, f.booster.id)
        ),
      'DIVERT',
      'AUTO',
    ],
    [
      'tower wind above the catch limit → forced divert',
      (f) => void (f.world.weather.towerWindMPerS = cm.towerWindLimitCatchMPerS + 1),
      'DIVERT',
      'FORCED',
    ],
  ])('%s', (_name, perturb, mode, by) => {
    const f = toLiftoff();
    fly(f, (tS) => perturb(f, tS));
    expect(f.log.find((e) => e.t === 'RecoveryCommitted')).toMatchObject({ mode, by });
  });

  it('a forced divert commits as soon as the decision opens', () => {
    const f = toLiftoff();
    f.world.weather.towerWindMPerS = cm.towerWindLimitCatchMPerS + 5;
    fly(f);
    const c = f.log.find((e) => e.t === 'RecoveryCommitted');
    expect(c).toMatchObject({ mode: 'DIVERT', by: 'FORCED' });
    expect(c?.tick).toBe(f.liftoff + at(f, 'BOOSTBACK_START'));
    expect(f.booster.recovery?.forcedDivert).toBe('TOWER_WIND');
  });
});

// --- Engine-out hook (AC 18) ---------------------------------------------------------------------

describe('engineOut hook (A4, fired by 3.7)', () => {
  it('in ascent: 32 of 33 lit, MECO slips by the configured delay, σ up, landing margin down', () => {
    const f = toLiftoff();
    run(f.world, T(30));
    const p0 = f.booster.recovery?.p ?? 0;
    expect(engineOut(f.world, f.booster.id)).toBe(true);
    expect(f.booster.engines).toMatchObject({ lit: vehicles.booster.engines - 1, failed: 1 });
    f.log.push(...run(f.world, 1));
    expect(f.booster.recovery?.p).toBeLessThan(p0);
    expect(f.booster.recovery?.p).toBeCloseTo(0.74, 2);
    expect(f.booster.recovery?.landingPropKg).toBe(
      (fp.booster.find((k) => k.event === 'LANDING_BURN')?.boosterPropKg ?? 0) -
        fp.engineOut.ascentLandingPropPenaltyKg,
    );
    fly(f);
    expect(Math.abs(at(f, 'MECO') - T(155 + fp.engineOut.ascentMecoDelayS))).toBeLessThanOrEqual(1);
    expect(at(f, 'LANDING_BURN') - at(f, 'MECO')).toBe(T(380 - 155)); // later events keep their spacing
  });

  it('in boostback: 12 of 13 lit; two outs leave too little landing propellant → forced divert', () => {
    const f = toLiftoff();
    runUntil(f.world, () => f.booster.fsm.state === 'BOOSTBACK');
    expect(engineOut(f.world, f.booster.id)).toBe(true);
    expect(f.booster.engines.lit).toBe(vehicles.booster.boostbackEngines - 1);
    expect(engineOut(f.world, f.booster.id)).toBe(true);
    f.log.push(...run(f.world, 1));
    expect(f.booster.recovery?.forcedDivert).toBe('LOW_PROPELLANT');
    expect(f.booster.recovery?.mode).toBe('DIVERT');
  });

  it('has no effect outside ascent/boostback or for non-boosters', () => {
    const f = toLiftoff();
    expect(engineOut(f.world, f.ship.id)).toBe(false);
    expect(engineOut(f.world, f.booster.id, 0)).toBe(false);
    runUntil(f.world, () => f.booster.fsm.state === 'DESCENT');
    expect(engineOut(f.world, f.booster.id)).toBe(false);
    const pre = mvpSetup();
    expect(engineOut(pre.world, pre.cd.boosterId)).toBe(false);
  });
});

// --- Seeded outcome (AC 20) ----------------------------------------------------------------------

describe('catch outcome', () => {
  /** GO FOR CATCH with 1 ascent engine-out + 14 m/s tower wind (p ≈ 0.62). */
  function contested(seed: number): FlightSetup {
    const f = toLiftoff(seed);
    f.world.weather.towerWindMPerS = 14;
    return fly(f, (tS) => {
      if (tS === 30) engineOut(f.world, f.booster.id);
      return f.booster.recovery?.decisionRequiredTick !== null && f.booster.recovery?.mode === null
        ? [{ t: 'CatchDecision', boosterId: f.booster.id, choice: 'CATCH' }]
        : [];
    });
  }

  it('is one roll on the seeded catch stream; same seed → same outcome; both outcomes occur', () => {
    const results = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const f = contested(seed);
      const o = outcome(f);
      const firstDraw = rngFromState(seedStream(seed, 'catch')).float();
      expect(o).toMatchObject({ roll: firstDraw });
      expect(o?.t === 'RecoveryOutcome' && o.result).toBe(
        firstDraw < (f.booster.recovery?.p ?? 0) ? 'CAUGHT' : 'CATCH_FAILED',
      );
      expect(f.booster.recovery?.p).toBeCloseTo(0.62, 2);
      results.add(o?.t === 'RecoveryOutcome' ? o.result : '');
      if (seed <= 2) expect(contested(seed).log).toEqual(f.log);
    }
    expect([...results].sort()).toEqual(['CATCH_FAILED', 'CAUGHT']);
  });

  it('a failed catch loses the booster and damages TOWER-1', () => {
    let f: FlightSetup | null = null;
    for (let seed = 1; seed <= 20 && !f; seed++) {
      const g = contested(seed);
      if (g.booster.recovery?.result === 'CATCH_FAILED') f = g;
    }
    expect(f).not.toBeNull();
    if (!f) return;
    expect(f.booster.fsm.state).toBe('LOST');
    expect(f.tower.fsm.state).toBe('DAMAGED');
    expect(f.tower.arms).toBe('OPEN');
    expect(f.cd.phase.state).toBe('Debrief');
  });
});

// --- End to end ---------------------------------------------------------------------------------

describe('T-06:00:00 → Debrief with the real systems, StartRollout + Stack only', () => {
  it('walks every phase, only the final poll holds (one GO), catches on the auto policy', () => {
    const s = mvpSetup();
    const log: SimEvent[] = [];
    log.push(...step(s.world, [{ t: 'StartRollout', boosterId: s.cd.boosterId }]));
    let stacked = false;
    while (s.cd.phase.state !== 'Debrief' && s.world.tick < T(30_000)) {
      const cmds: Command[] = !stacked && s.cd.inputs.rolloutComplete ? [{ t: 'Stack', padId: s.cd.padId }] : [];
      stacked ||= cmds.length > 0;
      // The final poll always asks for the GO (countdown.autoGoAtPoll.final = false).
      if (s.cd.hold?.reason === 'POLL') cmds.push({ t: 'Go', countdownId: s.cd.id });
      log.push(...step(s.world, cmds));
    }
    const phases = log.flatMap((e) => (e.t === 'PhaseChanged' ? [e.to] : []));
    expect(phases).toEqual<Phase[]>([
      'Rollout',
      'Stack',
      'PropellantLoad',
      'TerminalCount',
      'Liftoff',
      'Boostback',
      'TowerCatch',
      'Safing',
      'Debrief',
    ]);
    expect(log.flatMap((e) => (e.t === 'HoldStarted' ? [e.poll] : []))).toEqual(['final']);
    expect(s.cd.liftoffTick).toBe(T(-cdData.scenarioStartTS) - 1 + 1);
    expect(log.find((e) => e.t === 'RecoveryOutcome')).toMatchObject({ result: 'CAUGHT' });
    expect(
      log.filter((e) => e.t === 'RoadClosureChanged').map((e) => e.t === 'RoadClosureChanged' && e.closed),
    ).toEqual([true, false]);
  });
});

describe('flight save/load', () => {
  it('save mid-boostback, load, finish ≡ straight run', () => {
    const straight = fly(toLiftoff(3));
    const f = toLiftoff(3);
    run(f.world, T(190));
    const loaded = deserializeWorld(serializeWorld(f.world));
    while (loaded.countdowns[f.cd.id]?.phase.state !== 'Debrief') step(loaded);
    expect(hashWorld(loaded)).toBe(hashWorld(straight.world));
  });
});
