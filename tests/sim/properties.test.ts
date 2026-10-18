// Property tests (fast-check, ADR 0006): 200 cases. Each loads a snapshot of a reference run (start, prep,
// load, terminal count, ascent, descent), reseeds every RNG stream with the case seed, sends random player
// commands for 100 s of sim time and checks the invariants every tick:
//   propellant never negative, farm tanks within [0, capacity], mass conserved before liftoff, no NaN (canonical
//   JSON), phases monotonic except RECYCLE, money and positions finite, tower carriage outside the QD keep-out band
//   while the QD arm is out and within its travel.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { tower as td } from '@data/index';
import {
  PHASES,
  canonicalStringify,
  deserializeWorld,
  farmMassKg,
  seedAllStreams,
  serializeWorld,
  step,
} from '../../src/sim/index';
import type { Command, Countdown, Propellant, SimEvent, World } from '../../src/sim/index';
import { runMvp } from '../harness';

const CASE_TICKS = 3_000;

function snapshots(): string[] {
  const out: string[] = [];
  const at = new Set([1, 300_000, 530_000, 650_000]);
  runMvp({
    seed: 11,
    each: (world) => {
      const cd = world.countdowns.cd01;
      if (at.has(world.tick)) out.push(serializeWorld(world));
      if (cd?.liftoffTick != null && (world.tick === cd.liftoffTick + 3_000 || world.tick === cd.liftoffTick + 9_000)) {
        out.push(serializeWorld(world));
      }
    },
  });
  return out;
}

/** Farm + on-board + every sink − deliveries (kg): constant while the stages are on the ground. */
function massBalance(world: World, cd: Countdown, f: Propellant): number {
  const key = f === 'LOX' ? 'loxKg' : 'ch4Kg';
  const l = world.logistics.ledger[f];
  let onboard = 0;
  for (const id of [cd.boosterId, cd.shipId]) {
    const e = world.entities.byId[id];
    if (e?.kind === 'booster' || e?.kind === 'ship') onboard += e.prop[key];
  }
  return farmMassKg(world, f) + onboard + l.farmBoilOffKg + l.vehicleBoilOffKg + l.detankLostKg - l.deliveredKg;
}

function commandArb(cd: Countdown): fc.Arbitrary<Command> {
  return fc.oneof(
    fc.constant<Command>({ t: 'Go', countdownId: cd.id }),
    fc.constant<Command>({ t: 'Hold', countdownId: cd.id }),
    fc.constant<Command>({ t: 'Recycle', countdownId: cd.id }),
    fc.constant<Command>({ t: 'Scrub', countdownId: cd.id }),
    fc.constant<Command>({ t: 'Stack', padId: cd.padId }),
    fc.constant<Command>({ t: 'StartRollout', boosterId: cd.boosterId }),
    fc.record({
      t: fc.constant('OrderDelivery' as const),
      fluid: fc.constantFrom<Propellant>('LOX', 'CH4'),
      rush: fc.boolean(),
    }),
    fc.record({
      t: fc.constant('CatchDecision' as const),
      boosterId: fc.constant(cd.boosterId),
      choice: fc.constantFrom('CATCH' as const, 'DIVERT' as const),
    }),
    fc.record({
      t: fc.constant('LeakResponse' as const),
      choice: fc.constantFrom('DEGRADED' as const, 'HOLD_FIX' as const),
    }),
  );
}

describe('sim invariants over 200 seeded cases (fast-check)', () => {
  const snaps = snapshots();
  const sample = deserializeWorld(snaps[0] ?? '');
  const sampleCd = sample.countdowns.cd01 as Countdown;

  it('collects a snapshot in every phase family', () => {
    expect(snaps).toHaveLength(6);
  });

  it('hold for random seeds, snapshots and command sequences', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: snaps.length - 1 }),
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.array(fc.record({ at: fc.integer({ min: 0, max: CASE_TICKS - 1 }), cmd: commandArb(sampleCd) }), {
          maxLength: 8,
        }),
        (snap, seed, script) => {
          const world = deserializeWorld(snaps[snap] ?? '');
          world.seed = seed;
          world.rng = seedAllStreams(seed);
          const cd = world.countdowns.cd01 as Countdown;
          const balance0 = { LOX: massBalance(world, cd, 'LOX'), CH4: massBalance(world, cd, 'CH4') };
          const grounded = cd.liftoffTick === null;
          for (let i = 0; i < CASE_TICKS; i++) {
            const cmds = script.filter((s) => s.at === i).map((s) => s.cmd);
            const events: SimEvent[] = step(world, cmds);
            world.outbox.length = 0;
            for (const e of events) {
              if (e.t !== 'PhaseChanged') continue;
              const monotonic =
                PHASES.indexOf(e.to) > PHASES.indexOf(e.from) || (e.trigger === 'Recycle' && e.to === e.from);
              if (!monotonic) throw new Error(`phase ${e.from} → ${e.to} (${e.trigger})`);
            }
            for (const id of world.entities.order) {
              const e = world.entities.byId[id];
              if (!e || !Number.isFinite(e.pos.x + e.pos.y + e.pos.z)) throw new Error(`bad position ${id}`);
              if ((e.kind === 'booster' || e.kind === 'ship') && (e.prop.loxKg < -1e-6 || e.prop.ch4Kg < -1e-6)) {
                throw new Error(`negative propellant on ${e.callSign}`);
              }
              if (e.kind === 'tank' && (e.massKg < -1e-6 || e.massKg > e.capKg + 1e-6))
                throw new Error(`tank ${e.callSign}`);
              if (e.kind === 'tanker' && e.cargoKg < -1e-6) throw new Error(`tanker ${e.callSign}`);
              if (e.kind === 'tower') {
                const c = e.carriageM;
                if (e.qd !== 'STOWED' && c > td.qdArm.keepOutLoM && c < td.qdArm.keepOutHiM)
                  throw new Error(`carriage ${c} m in the QD band (${e.qd})`);
                if (c < td.carriage.minM || c > td.carriage.maxM) throw new Error(`carriage ${c} m out of travel`);
              }
            }
            if (!Number.isFinite(world.economy.moneyCr)) throw new Error('money');
          }
          if (grounded && cd.liftoffTick === null) {
            for (const f of ['LOX', 'CH4'] as const) {
              const drift = Math.abs(massBalance(world, cd, f) - balance0[f]);
              if (drift > 1e-9 * 6e6) throw new Error(`${f} mass drift ${drift} kg`);
            }
          }
          canonicalStringify(world); // throws on NaN / undefined / non-plain values
          return true;
        },
      ),
      { numRuns: 200, seed: 20261018 },
    );
  });
});
