import { STANDARD_AUTOPILOT, autopilotCommands, createMvpScenario, findByCallSign, step } from '@sim/index';
import type { MvpScenario } from '@sim/index';
import type { World } from '@sim/types';
import { describe, expect, it } from 'vitest';
import { ANIM, ANIM_STRIDE, FX_T_MIN_S, RECOVERY_ZONE, SLOT_STRIDE, createRenderSnapshot } from '@render/snapshot';
import { CRANE_GEOM, craneHookWorld, craneRig, craneTip, quatFromYaw, yawOf } from './anim-writer';
import { SnapshotWriter } from './snapshot-writer';

function run(world: World, writer: SnapshotWriter, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    step(world);
    world.outbox.length = 0;
    writer.write(world);
  }
}

/** Autopilot run until `until` (the writer only joins for the last ticks it is given). */
function drive(sc: MvpScenario, until: (w: World) => boolean, writer?: SnapshotWriter): void {
  const { world, countdown } = sc;
  while (!until(world)) {
    step(world, autopilotCommands(world, countdown.id, STANDARD_AUTOPILOT));
    world.outbox.length = 0;
    writer?.write(world);
  }
}

describe('AnimWriter', () => {
  it('copies the tower mechanism fields into the tower channels', () => {
    const { world } = createMvpScenario({ seed: 42 });
    const snap = createRenderSnapshot(256);
    const writer = new SnapshotWriter(snap);
    const t = findByCallSign(world, 'TOWER-1');
    if (t?.kind !== 'tower') throw new Error('layout');
    t.carriageM = 101;
    t.armLRad = 0.3;
    t.armRRad = -0.3;
    t.qdArmRad = 1.2;
    writer.write(world);
    const o = t.slot * ANIM_STRIDE;
    expect(snap.animCurr[o + ANIM.tower.carriageM]).toBe(101);
    expect(snap.animCurr[o + ANIM.tower.armLRad]).toBeCloseTo(0.3, 6);
    expect(snap.animCurr[o + ANIM.tower.armRRad]).toBeCloseTo(-0.3, 6);
    expect(snap.animCurr[o + ANIM.tower.qdArmRad]).toBeCloseTo(1.2, 6);
  });

  it('matches the CRANE as-built rest tip (≈ 94.7 m high, 36 m ahead) and round-trips yaw', () => {
    const tip = craneTip(CRANE_GEOM.luffRest);
    expect(tip.y).toBeCloseTo(94.8, 1);
    expect(tip.z).toBeCloseTo(36.0, 1);
    expect(yawOf(quatFromYaw(1.1))).toBeCloseTo(1.1, 12);
  });

  it('hangs the stage from the hook continuously through the crane lift', () => {
    const { world } = createMvpScenario({ seed: 42 });
    const crane = findByCallSign(world, 'CR-77');
    const b = findByCallSign(world, 'B-09');
    if (crane?.kind !== 'crane' || b?.kind !== 'booster') throw new Error('layout');
    // drive the lift task directly (the rig is a pure function of task progress)
    crane.fsm.state = 'LIFTING';
    crane.task = { stageId: b.id, elapsedTicks: 0, durationTicks: 1000 };
    let last = { ...b.pos };
    let maxStep = 0;
    for (let i = 0; i <= 1000; i++) {
      crane.task.elapsedTicks = i;
      const r = craneRig(world, crane);
      const p = r.hang?.pos ?? b.pos;
      maxStep = Math.max(maxStep, Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z));
      last = { ...p };
      expect(r.pose.hook).toBeGreaterThanOrEqual(CRANE_GEOM.hookMin);
      expect(r.pose.hook).toBeLessThanOrEqual(CRANE_GEOM.hookMax);
    }
    expect(maxStep).toBeLessThan(1.5); // no jump at hook-on / set-down
    // at the hook-on keyframe the hook sits on the booster top
    crane.task.elapsedTicks = 150;
    const hk = craneHookWorld(crane, craneRig(world, crane).pose);
    expect(hk.y).toBeCloseTo(b.pos.y + 71, 0);
  });

  it('rate-limits ground-vehicle yaw and spins the wheels while moving', () => {
    const { world } = createMvpScenario({ seed: 42 });
    const snap = createRenderSnapshot(256);
    const writer = new SnapshotWriter(snap);
    writer.write(world);
    const sp = findByCallSign(world, 'SP-41');
    if (sp?.kind !== 'transporter') throw new Error('layout');
    const yaw0 = yawOf(sp.rot);
    sp.rot = quatFromYaw(yaw0 + Math.PI / 2);
    sp.pos = { ...sp.pos, z: sp.pos.z - 0.05 };
    writer.write(world);
    const o = sp.slot * SLOT_STRIDE;
    const q = {
      x: snap.curr[o + 3] ?? 0,
      y: snap.curr[o + 4] ?? 0,
      z: snap.curr[o + 5] ?? 0,
      w: snap.curr[o + 6] ?? 1,
    };
    const d = yawOf(q) - yaw0;
    const turned = Math.abs(d - Math.PI * 2 * Math.round(d / (Math.PI * 2)));
    expect(turned).toBeGreaterThan(0);
    expect(turned).toBeLessThan(0.01); // 10°/s × 1/30 s
    run(world, writer, 1);
    expect(snap.animCurr[sp.slot * ANIM_STRIDE + ANIM.transporter.yawRateRadPerS]).not.toBe(0);
  });

  it('places stages at the sim origin (no render lift) and drives pad, fins and gimbal through the flight', () => {
    const sc = createMvpScenario({ seed: 42 });
    sc.world.outbox.length = 0;
    const { world } = sc;
    const snap = createRenderSnapshot(256);
    const writer = new SnapshotWriter(snap);
    const b = findByCallSign(world, 'B-09');
    const s = findByCallSign(world, 'S-21');
    const pad = findByCallSign(world, 'OLM-1');
    const tower = findByCallSign(world, 'TOWER-1');
    if (b?.kind !== 'booster' || s?.kind !== 'ship' || pad?.kind !== 'pad' || tower?.kind !== 'tower') {
      throw new Error('layout');
    }
    const y = (slot: number): number => snap.curr[slot * SLOT_STRIDE + 1] ?? NaN;
    const a = (slot: number, ch: number): number => snap.animCurr[slot * ANIM_STRIDE + ch] ?? NaN;

    drive(sc, (w) => w.tick >= 666_003); // T-00:10:00
    writer.write(world);
    expect(y(b.slot)).toBe(b.pos.y);
    expect(y(b.slot)).toBeCloseTo(20, 6);
    expect(y(s.slot)).toBeCloseTo(91, 6);
    expect(a(tower.slot, ANIM.tower.qdArmRad)).toBeCloseTo(Math.PI / 2, 4);
    expect(a(pad.slot, ANIM.pad.bqdM)).toBe(0);
    // FX inputs (5.6): T-clock clamped before the count's last 30 s, road closed → pad hazard radius
    expect(a(pad.slot, ANIM.pad.delugeS)).toBe(FX_T_MIN_S);
    expect(a(pad.slot, ANIM.pad.hazardM)).toBe(3_000);

    drive(sc, (w) => b.fsm.state === 'ASCENT' && w.tick > 684_003 + 300, writer); // T+10 s
    expect(a(b.slot, ANIM.booster.litFrac)).toBe(1);
    expect(a(pad.slot, ANIM.pad.clampsM)).toBeCloseTo(-0.8, 6);
    expect(a(pad.slot, ANIM.pad.bqdM)).toBeCloseTo(-1.5, 6);
    expect(a(pad.slot, ANIM.pad.delugeS)).toBeCloseTo(10, 1);

    drive(sc, (w) => b.fsm.state === 'BOOSTBACK' && w.tick > 688_953 + 300, writer); // boostback +10 s
    const fins = Math.abs(a(b.slot, ANIM.booster.finARad)) + Math.abs(a(b.slot, ANIM.booster.finBRad));
    expect(fins).toBeGreaterThan(0.01);
    expect(Math.abs(a(b.slot, ANIM.booster.finARad))).toBeLessThanOrEqual(0.53);
    expect(a(b.slot, ANIM.booster.litFrac)).toBeCloseTo(13 / 33, 5);
    const rv = findByCallSign(world, 'RV-1');
    const pk = findByCallSign(world, 'PK-03');
    if (!rv || !pk) throw new Error('layout');
    expect(a(rv.slot, ANIM.vessel_recovery.zoneMode)).toBe(RECOVERY_ZONE.STANDBY); // decision open

    // a fresh writer (load / jump) starts the rate-limited channels at their targets, not at rest
    writer.invalidate();
    writer.write(world);
    const fins2 = Math.abs(a(b.slot, ANIM.booster.finARad)) + Math.abs(a(b.slot, ANIM.booster.finBRad));
    expect(fins2).toBeGreaterThan(0.05);
    expect(a(pad.slot, ANIM.pad.clampsM)).toBeCloseTo(-0.8, 6);
    // …and boats at their commanded speed, so a jump shows the patrol wake on the first frame
    expect(a(pk.slot, ANIM.boat_range.speedMPerS)).toBeGreaterThan(1);
  });
});
