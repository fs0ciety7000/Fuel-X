import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  MAX_LABELS,
  altitudeAria,
  altitudeClassOf,
  altitudeReadout,
  altitudeScaleM,
  altitudeTickLabels,
  compareLabels,
  createLabelSlot,
  declutter,
  headingOfQuat,
  headingReadout,
  labelRangeM,
} from './world-overlay';
import type { LabelSlot, Rect } from './world-overlay';

function slot(id: string, priority: number, x: number, y: number, dist = 100): LabelSlot {
  return { ...createLabelSlot(id), priority, x, y, w: 60, h: 20, dist, visible: true };
}

describe('label declutter', () => {
  it('places tags by priority and collapses lower-priority overlaps to the anchor square', () => {
    const rest = slot('TK-1', 0, 500, 500, 50);
    const sel = slot('B-09', 5, 510, 505, 900);
    const far = slot('PK-03', 1, 900, 500);
    const list = [rest, far, sel].sort(compareLabels);
    expect(list.map((s) => s.id)).toEqual(['B-09', 'PK-03', 'TK-1']);
    const n = declutter(list, [], 16, []);
    expect(n).toBe(3);
    expect(sel.mode).toBe('tag');
    expect(rest.mode).toBe('anchor');
    expect(far.mode).toBe('tag');
  });

  it('hides labels under HUD cards, invisible ones and everything past the cap', () => {
    const card: Rect = { left: 0, top: 0, right: 300, bottom: 1080 };
    const under = slot('A', 4, 100, 400);
    const gone = { ...slot('B', 5, 800, 400), visible: false };
    const list = [under, gone];
    for (let i = 0; i < MAX_LABELS + 10; i++)
      list.push(slot(`N${i}`, 1, 400 + (i % 10) * 100, 200 + Math.floor(i / 10) * 50));
    list.sort(compareLabels);
    const n = declutter(list, [card], 16, []);
    expect(under.mode).toBe('hidden');
    expect(gone.mode).toBe('hidden');
    expect(n).toBe(MAX_LABELS);
    expect(list.filter((s) => s.mode !== 'hidden')).toHaveLength(MAX_LABELS);
  });

  it('keeps followed / alert labels at any range, tanks only close', () => {
    expect(labelRangeM(3)).toBe(Number.POSITIVE_INFINITY);
    expect(labelRangeM(0)).toBeLessThan(labelRangeM(1));
  });
});

describe('altitude scale', () => {
  it('picks a stepped scale per class with hysteresis on the way down', () => {
    expect(altitudeClassOf('booster')).toBe('stage');
    expect(altitudeClassOf('vessel_recovery')).toBe('vessel');
    expect(altitudeClassOf('transporter')).toBeNull();
    expect(altitudeScaleM('vessel', 3)).toBe(200);
    expect(altitudeScaleM('stage', 20)).toBe(2_000);
    expect(altitudeScaleM('stage', 8_300)).toBe(10_000);
    expect(altitudeScaleM('stage', 45_000)).toBe(60_000);
    // descending through 9.5 km keeps 60 km until below 85 % of 10 km
    expect(altitudeScaleM('stage', 9_500, 60_000)).toBe(60_000);
    expect(altitudeScaleM('stage', 8_000, 60_000)).toBe(10_000);
  });

  it('labels the ticks and formats the readout', () => {
    expect(altitudeTickLabels(60_000)).toEqual(['00', '15', '30', '45', '60']);
    expect(altitudeTickLabels(200)).toEqual(['00', '50', '100', '150', '200']);
    expect(altitudeTickLabels(2_000)).toEqual(['00', '0.5', '1', '1.5', '2']);
    expect(altitudeReadout(600.4)).toBe('600 M');
    expect(altitudeReadout(8_300)).toBe('8.3 KM');
    expect(altitudeAria(8_300)).toBe('Altitude 8.3 kilometres');
  });
});

describe('compass', () => {
  it('reads the forward (+Z) compass heading of an entity', () => {
    const q = new Quaternion();
    const at = (deg: number): number => {
      // yaw so that local +Z points along compass bearing `deg` (+x east, −z north)
      const b = (deg * Math.PI) / 180;
      const f = new Vector3(Math.sin(b), 0, -Math.cos(b));
      q.setFromUnitVectors(new Vector3(0, 0, 1), f);
      return headingOfQuat(q.x, q.y, q.z, q.w);
    };
    expect(at(0)).toBeCloseTo(0, 6);
    expect(at(90)).toBeCloseTo(90, 6);
    expect(at(222)).toBeCloseTo(222, 6);
    expect(headingReadout(7.4)).toBe('007°');
    expect(headingReadout(359.7)).toBe('000°');
  });
});
