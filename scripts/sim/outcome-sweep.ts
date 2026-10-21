// 7.5b outcome sweep (BALANCING §15.3): scenario `mvp`, seeds 0..N-1 × standard / frugal / hedger (policies.ts),
// each run stepped to Debrief, in 4 worker processes (like anomaly-sweep.ts). Reports per policy the outcome split,
// weather scrubs, NO-GO holds per run (and the WEATHER driver behind them), the longest T-clock stretch before the
// load poll with no decision / poll / hold / anomaly / milestone, and how often frugal and hedger end differently
// (does D1 matter?).
// Usage: npx tsx scripts/sim/outcome-sweep.ts [runs=200] [--seeds 7,17]
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { autopilotCommands, createMvpScenario, step } from '../../src/sim/index.ts';
import { POLICIES } from './policies.ts';
import type { PolicyName } from './policies.ts';

interface RunReport {
  seed: number;
  policy: PolicyName;
  outcome: string;
  moneyDeltaM: number;
  holdMin: number;
  /** NO_GO holds started before liftoff. */
  noGoHolds: number;
  /** WEATHER drivers seen while a NO_GO hold was active (driver → peak value). */
  weatherDrivers: Record<string, number>;
  /** Reason of the hold active when the run scrubbed (null if it flew). */
  scrubHold: string | null;
  /** Hold minutes by cause: reason, and for NO_GO holds the NO-GO stations with their drivers. */
  holdBy: Record<string, number>;
  /** Longest T-clock stretch from scenario start to the load poll with nothing salient, min. */
  quietMin: number;
  anomalies: string[];
}

const SALIENT = new Set(['DecisionRequired', 'AnomalyFired', 'PollOpened', 'HoldStarted', 'Milestone']);

export function runOne(seed: number, policy: PolicyName): RunReport {
  const opts = POLICIES[policy];
  const { world, countdown: cd } = createMvpScenario({ seed });
  world.outbox.length = 0;
  let noGoHolds = 0;
  const weatherDrivers: Record<string, number> = {};
  let quietFrom = cd.tClockTicks;
  let longestQuiet = 0;
  let loadPollSeen = false;
  let scrubHold: string | null = null;
  const holdBy: Record<string, number> = {};
  for (let i = 0; i < 2_000_000 && cd.phase.state !== 'Debrief'; i++) {
    const holdBefore = cd.hold?.reason ?? null;
    step(world, autopilotCommands(world, cd.id, opts));
    for (const e of world.outbox) {
      if (e.t === 'HoldStarted' && e.reason === 'NO_GO' && cd.liftoffTick === null) noGoHolds++;
      if (e.t === 'PhaseChanged' && e.to === 'Scrubbed') scrubHold = holdBefore ?? 'NONE';
      if (!loadPollSeen && SALIENT.has(e.t)) {
        longestQuiet = Math.max(longestQuiet, cd.tClockTicks - quietFrom);
        quietFrom = cd.tClockTicks;
        if (e.t === 'PollOpened' && e.poll === 'load') loadPollSeen = true;
      }
    }
    world.outbox.length = 0;
    if (cd.clock.state === 'Holding' && cd.hold) {
      const st = world.range[cd.id]?.stations;
      const nogo = st
        ? Object.entries(st)
            .filter(([, v]) => v.status === 'NO_GO')
            .map(([k, v]) => `${k}/${v.driver}`)
        : [];
      const key =
        cd.hold.reason === 'NO_GO' || cd.hold.reason === 'POLL'
          ? `${cd.hold.reason}:${nogo.join('+') || '-'}`
          : cd.hold.reason;
      holdBy[key] = (holdBy[key] ?? 0) + 1 / 1800;
    }
    if (cd.hold?.reason === 'NO_GO') {
      const r = world.range[cd.id]?.stations.WEATHER;
      if (r && r.status === 'NO_GO') weatherDrivers[r.driver] = Math.max(weatherDrivers[r.driver] ?? 0, r.value);
    }
  }
  const d = world.debriefs[cd.id];
  return {
    seed,
    policy,
    outcome: d?.outcome ?? cd.phase.state,
    moneyDeltaM: (d?.moneyDeltaCr ?? 0) / 1e6,
    holdMin: (d?.holdS ?? 0) / 60,
    noGoHolds,
    weatherDrivers,
    scrubHold,
    holdBy,
    quietMin: longestQuiet / 30 / 60,
    anomalies: (d?.anomalies ?? []).map((a) => a.anomaly),
  };
}

const workerIdx = process.argv.indexOf('--worker');
if (workerIdx >= 0) {
  const policy = process.argv[workerIdx + 1] as PolicyName;
  const seeds = (process.argv[workerIdx + 2] ?? '').split(',').map(Number);
  process.stdout.write(JSON.stringify(seeds.map((s) => runOne(s, policy))));
} else {
  const seedsIdx = process.argv.indexOf('--seeds');
  const seedList =
    seedsIdx >= 0
      ? (process.argv[seedsIdx + 1] ?? '').split(',').map(Number)
      : Array.from({ length: Number(process.argv[2] ?? 200) }, (_, i) => i);
  const threads = 4;
  const t0 = performance.now();
  const sweep = async (policy: PolicyName): Promise<RunReport[]> => {
    const parts = await Promise.all(
      Array.from({ length: threads }, (_, w) => {
        const seeds = seedList.filter((_, i) => i % threads === w);
        if (seeds.length === 0) return Promise.resolve([] as RunReport[]);
        return new Promise<RunReport[]>((resolve, reject) => {
          const self = fileURLToPath(import.meta.url);
          const child = spawn(process.execPath, [...process.execArgv, self, '--worker', policy, seeds.join(',')]);
          let out = '';
          child.stdout.on('data', (d: Buffer) => (out += d.toString()));
          child.stderr.pipe(process.stderr);
          child.on('error', reject);
          child.on('close', (code) =>
            code === 0 ? resolve(JSON.parse(out) as RunReport[]) : reject(new Error(`worker ${code}`)),
          );
        });
      }),
    );
    return parts.flat().sort((a, b) => a.seed - b.seed);
  };
  const by: Partial<Record<PolicyName, RunReport[]>> = {};
  for (const policy of Object.keys(POLICIES) as PolicyName[]) {
    const reports = await sweep(policy);
    by[policy] = reports;
    const outcomes: Record<string, number> = {};
    for (const r of reports) outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1;
    const scrubs = reports.filter((r) => r.outcome === 'SCRUBBED');
    const wxScrubs = scrubs.filter((r) => Object.keys(r.weatherDrivers).length > 0);
    const first40 = wxScrubs.filter((r) => r.seed < 40).length;
    const holds = reports.map((r) => r.noGoHolds);
    const drivers: Record<string, number> = {};
    for (const r of reports) for (const k of Object.keys(r.weatherDrivers)) drivers[k] = (drivers[k] ?? 0) + 1;
    const quiet = reports.map((r) => r.quietMin);
    console.log(`\npolicy ${policy}: ${reports.length} runs · outcomes ${JSON.stringify(outcomes)}`);
    console.log(
      `  scrubs ${scrubs.length} (weather NO-GO ${wxScrubs.length}: seeds ${wxScrubs.map((r) => r.seed).join(',') || '-'}; ` +
        `seeds < 40: ${first40}) · scrub holds ${JSON.stringify(Object.fromEntries(scrubs.map((r) => [r.seed, r.scrubHold])))}`,
    );
    console.log(
      `  NO-GO holds per run: mean ${(holds.reduce((a, b) => a + b, 0) / Math.max(1, holds.length)).toFixed(2)}, ` +
        `max ${Math.max(0, ...holds)}, runs with > 3: ${holds.filter((h) => h > 3).length} · WEATHER drivers in NO-GO holds (runs): ${JSON.stringify(drivers)}`,
    );
    console.log(
      `  longest quiet stretch before the load poll: max ${Math.max(0, ...quiet).toFixed(0)} min, ` +
        `median ${[...quiet].sort((a, b) => a - b)[Math.floor(quiet.length / 2)]?.toFixed(0)} min`,
    );
    for (const r of scrubs) {
      const top = Object.entries(r.holdBy)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k, v]) => `${k} ${v.toFixed(0)}`)
        .join(', ');
      console.log(
        `  scrub seed ${r.seed}: hold ${r.holdMin.toFixed(0)} min (${top}) · anomalies ${r.anomalies.join(',') || '-'}`,
      );
    }
    const mean = reports.reduce((a, r) => a + r.moneyDeltaM, 0) / Math.max(1, reports.length);
    console.log(`  mean money Δ ${mean.toFixed(2)} M cr`);
    for (const s of [7, 17])
      for (const r of reports.filter((x) => x.seed === s))
        console.log(
          `  seed ${s}: ${r.outcome} · NO-GO holds ${r.noGoHolds} · hold ${r.holdMin.toFixed(1)} min · drivers ${JSON.stringify(r.weatherDrivers)}`,
        );
  }
  const fr = by.frugal ?? [];
  const he = by.hedger ?? [];
  const st = by.standard ?? [];
  const diff = fr.filter((r, i) => he[i] && he[i].outcome !== r.outcome);
  // D1 proper: one policy scrubbed and the other flew (the catch call / leak answer differ too, they do not scrub).
  const scrubDiff = fr.filter((r, i) => he[i] && (he[i].outcome === 'SCRUBBED') !== (r.outcome === 'SCRUBBED'));
  console.log(
    `frugal vs hedger scrub differs in ${scrubDiff.length} / ${fr.length} seeds: ` +
      scrubDiff.map((r) => `${r.seed} ${r.outcome}/${he.find((h) => h.seed === r.seed)?.outcome ?? '?'}`).join(', '),
  );
  const diffSt = fr.filter((r, i) => st[i] && st[i].outcome !== r.outcome);
  console.log(
    `\nfrugal vs hedger outcome differs in ${diff.length} / ${fr.length} seeds (${((100 * diff.length) / Math.max(1, fr.length)).toFixed(1)} %): ` +
      diff.map((r) => `${r.seed} ${r.outcome}/${he.find((h) => h.seed === r.seed)?.outcome ?? '?'}`).join(', '),
  );
  console.log(
    `frugal vs standard outcome differs in ${diffSt.length} / ${fr.length} seeds: ` +
      diffSt.map((r) => `${r.seed} ${r.outcome}/${st.find((h) => h.seed === r.seed)?.outcome ?? '?'}`).join(', '),
  );
  console.log(`\nsweep ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}
