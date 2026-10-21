// Debrief exit actions (GDD §13.2.3, AC 32): URL seed, REPLAY SAME SEED, NEW SEED, EXPORT LOG; RUN ENDED at debrief.
import { initialViewState } from '@bridge/stores';
import { secondsToTicks } from '@sim/index';
import { describe, expect, it } from 'vitest';
import { EventLog, SparkSampler, projectUi } from '../projection';
import { InlineSimHost } from '../sim-host/inline';
import { TimeControl } from '../time/time-control';
import { SessionController } from './controller';
import type { SessionEnv } from './controller';
import { dataRevision, drawSeed, searchWithSeed, seedFromSearch, sessionFileName } from './session';

const zero = (): number => 0;

function rig(entropy: number[] = [7, 1234]) {
  const host = new InlineSimHost(zero);
  let search = '?debug=1';
  const files: { name: string; json: string }[] = [];
  let resets = 0;
  const env: SessionEnv = {
    entropy: () => entropy.shift() ?? 99,
    nowIso: () => '2026-10-20T00:00:00.000Z',
    getSearch: () => search,
    setSearch: (s) => (search = s),
    download: (name, json) => files.push({ name, json }),
  };
  const ctl = new SessionController(host, env, () => resets++);
  return { host, ctl, files, search: () => search, resets: () => resets };
}

describe('session helpers', () => {
  it('parses and writes ?seed=, keeping other params', () => {
    expect(seedFromSearch('?seed=42')).toBe(42);
    expect(seedFromSearch('?debug=1&seed=0')).toBe(0);
    expect(seedFromSearch('?seed=4294967295')).toBe(4_294_967_295);
    for (const bad of ['', '?seed=', '?seed=-1', '?seed=1.5', '?seed=abc', '?seed=4294967296'])
      expect(seedFromSearch(bad)).toBeNull();
    expect(searchWithSeed('?debug=1&seed=3', 42)).toBe('?debug=1&seed=42');
    expect(searchWithSeed('', 7)).toBe('?seed=7');
  });

  it('draws a different seed and a stable data revision', () => {
    expect(drawSeed(() => 5, 5)).toBe(6);
    const xs = [5, 9];
    expect(drawSeed(() => xs.shift() ?? 0, 5)).toBe(9);
    expect(dataRevision()).toMatch(/^[0-9A-F]{8}$/);
    expect(dataRevision()).toBe(dataRevision());
    expect(sessionFileName({ scenario: 'mvp', seed: 42, tick: 30 })).toBe('fuelx-mvp-seed42-t30.json');
  });
});

describe('SessionController', () => {
  it('REPLAY SAME SEED reproduces the first 10 min of the event log exactly (same inputs)', async () => {
    const r = rig();
    await r.ctl.start(42);
    expect(r.search()).toBe('?debug=1&seed=42');
    const tenMin = secondsToTicks(600);
    await r.host.jump({ tick: tenMin });
    const first = r.host.sessionLog();
    await r.ctl.replaySameSeed();
    expect(r.host.inspect().seed).toBe(42);
    expect(r.host.inspect().world.tick).toBe(0);
    expect(r.host.sessionLog().commandLog).toEqual([]); // empty command log, fresh world
    await r.host.jump({ tick: tenMin });
    const second = r.host.sessionLog();
    expect(second.events.length).toBeGreaterThan(0);
    expect(second.events).toEqual(first.events);
    expect(second.commandLog).toEqual(first.commandLog);
    expect(r.resets()).toBe(2);
  });

  it('NEW SEED starts a different seed shown in the URL; EXPORT LOG has the seed and the full command log', async () => {
    const r = rig([42, 1234]);
    await r.ctl.start(42);
    const seed = await r.ctl.newSeed();
    expect(seed).toBe(1234); // 42 is the current seed: skipped
    expect(r.host.inspect().seed).toBe(1234);
    expect(r.search()).toBe('?debug=1&seed=1234');
    await r.host.jump({ tick: 90 });
    const name = r.ctl.exportLog();
    expect(r.files).toHaveLength(1);
    expect(r.files[0]?.name).toBe(name);
    const f = JSON.parse(r.files[0]?.json ?? '{}') as ReturnType<SessionController['exportSession']>;
    expect(f).toMatchObject({ format: 'fuelx-session', version: 1, scenario: 'mvp', seed: 1234, tick: 90 });
    expect(f.dataRevision).toBe(dataRevision());
    expect(f.commandLog).toEqual(r.host.sessionLog().commandLog);
    expect(f.commandLog.length).toBeGreaterThan(0); // autopilot StartRollout + orders at tick 0
    expect(f.events.length).toBe(r.host.sessionLog().events.length);
  });

  it('at Debrief: exit actions projected, seed in the header, rate control disabled RUN ENDED', async () => {
    const r = rig();
    await r.ctl.start(42);
    await r.host.jump({ phase: 'Debrief' });
    const { world, countdown } = r.host.inspect();
    const time = new TimeControl();
    time.setScale(100);
    const log = new EventLog();
    const ui = projectUi(world, null, initialViewState(), {
      countdown,
      time: {
        requested: time.requested,
        paused: time.paused,
        effective: time.effectiveScale(world, countdown),
        maxAllowed: time.maxAllowed(world, countdown),
        lagging: false,
        effectiveRate: 0,
      },
      spark: new SparkSampler(),
      events: log.list(),
      seq: 1,
    });
    expect(ui.debrief?.actions.map((a) => [a.id, a.session])).toEqual([
      ['REPLAY', 'REPLAY'],
      ['NEW_SEED', 'NEW_SEED'],
      ['EXPORT_LOG', 'EXPORT_LOG'],
      ['VIEW_SITE', 'VIEW_SITE'],
    ]);
    expect(ui.debrief?.seed).toBe(42);
    expect(ui.debrief?.meta).toBe(`REV ${dataRevision()} · SEED 42`);
    expect(ui.debrief?.decisions.every((d) => ['D1', 'D2', 'D3', 'D3B', ''].includes(d.code ?? 'x'))).toBe(true);
    expect(ui.debrief?.decisions.some((d) => d.code === 'D3')).toBe(true);
    // Readable verbs, not sim command kinds (6.7 open item).
    expect(ui.debrief?.decisions.map((d) => d.detail.split(' · ')[0])).not.toContain('STARTROLLOUT');
    expect(ui.debrief?.decisions.find((d) => d.code === 'D3')?.detail).toMatch(/^CATCH CALL · (CATCH|DIVERT) P /);
    expect(ui.timeScale).toMatchObject({
      runEnded: true,
      paused: true,
      effective: 0,
      maxAllowed: 0,
      lockReason: 'RUN ENDED',
      lockLabel: 'RUN ENDED',
    });
    expect(ui.timeScale.skip).toMatchObject({ enabled: false, reasonCode: 'RUN_ENDED', reason: 'RUN ENDED' });
    // the whole run fits the session log
    const f = r.ctl.exportSession();
    expect(f.eventsTruncated).toBe(false);
    expect(f.debrief).toHaveLength(1);
  });
});
