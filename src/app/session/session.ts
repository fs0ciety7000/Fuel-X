// Run session helpers (GDD §13.2.3, AC 32): `/play?seed=` parsing, new-seed entropy (allowed outside the sim), the
// data revision and the EXPORT LOG file. Pure except `drawSeed`'s injected entropy.
import * as data from '@data/index';
import { WORLD_SCHEMA, canonicalStringify, hashHex } from '@sim/index';
import type { Debrief, SimEvent, StampedCommand, World } from '@sim/types';
import type { SessionLog } from '../sim-host/types';
import { APP_VERSION } from '../version';

export const SESSION_FORMAT = 'fuelx-session';
export const SESSION_VERSION = 1;
const MAX_SEED = 0xffff_ffff;

/** `?seed=N` (decimal integer 0 … 2^32 − 1) → seed, else null. */
export function seedFromSearch(search: string): number | null {
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null || !/^\d{1,10}$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return Number.isSafeInteger(n) && n <= MAX_SEED ? n : null;
}

/** `?autopilot=1` hands the count to the scripted director (demo / attract mode); the player decides otherwise. */
export function autopilotFromSearch(search: string): boolean {
  return new URLSearchParams(search).get('autopilot') === '1';
}

/** The same query string with `seed` set (other params, e.g. `debug=1`, are kept). */
export function searchWithSeed(search: string, seed: number): string {
  const q = new URLSearchParams(search);
  q.set('seed', String(seed >>> 0));
  return `?${q.toString()}`;
}

/** A seed from `entropy` (u32) that differs from `avoid`. */
export function drawSeed(entropy: () => number, avoid?: number): number {
  for (let i = 0; i < 8; i++) {
    const s = entropy() >>> 0;
    if (s !== avoid) return s;
  }
  return ((avoid ?? 0) + 1) >>> 0;
}

let revision: string | null = null;
/** Data revision: first 8 hex of the canonical hash of every `src/data` export (tunables + scenario). */
export function dataRevision(): string {
  revision ??= hashHex(canonicalStringify(data)).slice(0, 8).toUpperCase();
  return revision;
}

export interface SessionFile {
  format: typeof SESSION_FORMAT;
  version: typeof SESSION_VERSION;
  game: string;
  schema: number;
  /** Host wall clock, ISO (metadata only). */
  createdAt: string;
  scenario: 'mvp';
  seed: number;
  dataRevision: string;
  autopilot: boolean;
  fromTick: number;
  tick: number;
  commandLog: StampedCommand[];
  events: SimEvent[];
  eventsTruncated: boolean;
  /** Debrief of the run's attempt(s), when reached. */
  debrief: Debrief[];
}

/** EXPORT LOG payload (loading it back is post-MVP). */
export function exportSession(log: SessionLog, world: Readonly<World>, createdAt: string): SessionFile {
  return {
    format: SESSION_FORMAT,
    version: SESSION_VERSION,
    game: APP_VERSION,
    schema: WORLD_SCHEMA,
    createdAt,
    scenario: log.scenario,
    seed: log.seed,
    dataRevision: dataRevision(),
    autopilot: log.autopilot,
    fromTick: log.fromTick,
    tick: log.tick,
    commandLog: log.commandLog,
    events: log.events,
    eventsTruncated: log.eventsTruncated,
    debrief: Object.keys(world.debriefs)
      .sort()
      .map((k) => world.debriefs[k])
      .filter((d): d is Debrief => d !== undefined),
  };
}

/** `fuelx-mvp-seed42-t540000.json`. */
export function sessionFileName(f: Pick<SessionFile, 'scenario' | 'seed' | 'tick'>): string {
  return `fuelx-${f.scenario}-seed${f.seed}-t${f.tick}.json`;
}
