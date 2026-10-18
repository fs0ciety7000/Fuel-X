import { describe, expect, it } from 'vitest';
import type { FsmState } from '../types';
import { defineFsm } from './fsm';
import type { FsmContext } from './fsm';
import { createWorld } from './world';
import type { World } from './world';

type Door = 'Closed' | 'Open' | 'Locked';
type DoorTrigger = 'open' | 'close' | 'lock' | 'unlock';
interface DoorCtx extends FsmContext {
  hasKey: boolean;
  log: string[];
}

const door = defineFsm<Door, DoorTrigger, DoorCtx>({
  name: 'door',
  states: ['Closed', 'Open', 'Locked'],
  transitions: [
    { from: 'Closed', to: 'Open', on: 'open' },
    { from: 'Open', to: 'Closed', on: 'close' },
    { from: 'Closed', to: 'Locked', on: 'lock', guard: (c) => c.hasKey, effect: (c) => c.log.push('locked') },
    { from: 'Locked', to: 'Closed', on: 'unlock', guard: (c) => c.hasKey },
    // Fallback: without a key, 'lock' on an open door shuts it.
    { from: ['Open'], to: 'Closed', on: 'lock' },
  ],
  event: (_c, from, to, on) => ({ t: 'EntityStateChanged', id: 'door', kind: 'building', from, to: `${to}:${on}` }),
});

function setup(hasKey = true): { world: World; m: FsmState<Door>; c: DoorCtx } {
  const world = createWorld({ seed: 1 });
  world.tick = 12;
  return { world, m: { state: 'Closed', enteredTick: 0 }, c: { world, hasKey, log: [] } };
}

describe('defineFsm', () => {
  it('rejects tables that reference unknown states', () => {
    expect(() =>
      defineFsm<'A' | 'B', 'go', FsmContext>({
        name: 'bad',
        states: ['A'],
        transitions: [{ from: 'A', to: 'B', on: 'go' }],
        event: () => ({ t: 'CommandRejected', cmd: 'Go', reason: 'x' }),
      }),
    ).toThrow(/unknown state 'B'/);
  });

  it.each<[Door, DoorTrigger, boolean, Door | null]>([
    ['Closed', 'open', true, 'Open'],
    ['Open', 'close', true, 'Closed'],
    ['Closed', 'lock', true, 'Locked'],
    ['Closed', 'lock', false, null], // guard fails
    ['Locked', 'unlock', true, 'Closed'],
    ['Locked', 'open', true, null], // not in table
    ['Open', 'open', true, null],
    ['Open', 'lock', true, 'Closed'], // array `from`
  ])('%s --%s (key=%s)--> %s', (from, on, key, to) => {
    const { world, m, c } = setup(key);
    m.state = from;
    const tr = door.fire(m, on, c);
    if (to === null) {
      expect(tr).toBeNull();
      expect(m).toEqual({ state: from, enteredTick: 0 });
      expect(world.outbox).toHaveLength(0);
    } else {
      expect(tr?.to).toBe(to);
      expect(m).toEqual({ state: to, enteredTick: 12 });
      expect(world.outbox).toEqual([
        { t: 'EntityStateChanged', tick: 12, id: 'door', kind: 'building', from, to: `${to}:${on}` },
      ]);
    }
  });

  it('runs the effect after the state change', () => {
    const { m, c } = setup();
    door.fire(m, 'lock', c);
    expect(c.log).toEqual(['locked']);
  });

  it('answers static table queries', () => {
    expect(door.hasTransition('Closed', 'Locked')).toBe(true);
    expect(door.hasTransition('Closed', 'Locked', 'open')).toBe(false);
    expect(door.hasTransition('Locked', 'Open')).toBe(false);
    expect(door.triggersFrom('Open')).toEqual(['close', 'lock']);
    expect(door.find('Closed', 'lock', setup(false).c)).toBeNull();
  });
});
