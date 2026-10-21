// AC 3 sweep (GDD §13.3): 200 seeded headless runs of scenario `mvp` from T-06:00:00 to Debrief, in 4 worker
// processes. Policies: `none` = no input at all (the count freezes at the load poll and the window closes),
// `hands-off` = the standard autopilot's prep + orders + GO, but no anomaly / catch decisions.
// Reports the share of runs with ≥ 1 anomaly and the anomaly distribution vs the director weights (AC 3a/b), and
// under `hands-off` the recovery split (AC 3c, re-targeted in BALANCING §15 P3): diverted share in [10 %, 25 %] of
// flights, none at p ≥ autoCatchThreshold, none without an engine-out, failed catches ≤ 8 % of flights.
// Usage: npx tsx scripts/sim/anomaly-sweep.ts [runs=200]
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { anomalies as an, catchModel as cm } from '../../src/data/index.ts';
import { STANDARD_AUTOPILOT, autopilotCommands, createMvpScenario, step } from '../../src/sim/index.ts';
import type { AutopilotOptions } from '../../src/sim/index.ts';

type Policy = 'none' | 'hands-off';
interface RunReport {
  seed: number;
  policy: Policy;
  fired: string[];
  plan: string;
  fallback: boolean;
  outcome: string;
  recovery: { mode: string; result: string; p: number; decidedBy: string } | null;
  /** p at the moment the recovery mode was committed (debrief p is the live value after it). */
  committedP: number | null;
}

const HANDS_OFF: AutopilotOptions = { ...STANDARD_AUTOPILOT, leakResponse: null, catchDecision: false };

function runOne(seed: number, policy: Policy): RunReport {
  const { world, countdown: cd } = createMvpScenario({ seed });
  let committedP: number | null = null;
  for (let i = 0; i < 2_000_000 && cd.phase.state !== 'Debrief'; i++) {
    step(world, policy === 'none' ? [] : autopilotCommands(world, cd.id, HANDS_OFF));
    for (const e of world.outbox) if (e.t === 'RecoveryCommitted') committedP = e.p;
    world.outbox.length = 0;
  }
  const st = world.anomalies[cd.id];
  return {
    seed,
    policy,
    fired: (st?.fired ?? []).map((f) => `${f.anomaly}:${f.source}`),
    plan: st?.director.plan?.anomaly ?? '-',
    fallback: st?.director.fallbackUsed ?? false,
    outcome: world.debriefs[cd.id]?.outcome ?? cd.phase.state,
    recovery: world.debriefs[cd.id]?.recovery ?? null,
    committedP,
  };
}

const workerIdx = process.argv.indexOf('--worker');
if (workerIdx >= 0) {
  const policy = process.argv[workerIdx + 1] as Policy;
  const seeds = (process.argv[workerIdx + 2] ?? '').split(',').map(Number);
  process.stdout.write(JSON.stringify(seeds.map((s) => runOne(s, policy))));
} else {
  const runs = Number(process.argv[2] ?? 200);
  const threads = 4;
  const t0 = performance.now();
  const sweep = async (policy: Policy): Promise<RunReport[]> => {
    const parts = await Promise.all(
      Array.from({ length: threads }, (_, w) => {
        const seeds = Array.from({ length: runs }, (_, i) => i).filter((i) => i % threads === w);
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
  let failed = false;
  for (const policy of ['none', 'hands-off'] as const) {
    const reports = await sweep(policy);
    const withOne = reports.filter((r) => r.fired.length > 0).length;
    const all = reports.flatMap((r) => r.fired.map((f) => f.split(':')[0] ?? ''));
    const share = (a: string): number => all.filter((x) => x === a).length / Math.max(1, all.length);
    const outcomes: Record<string, number> = {};
    for (const r of reports) outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1;
    console.log(
      `\npolicy ${policy}: ${runs} runs, ≥1 anomaly in ${withOne}/${runs} (${((100 * withOne) / runs).toFixed(1)} %)`,
    );
    console.log(
      `  anomalies fired: ${all.length} (${(all.length / runs).toFixed(2)} per run), fallback used in ${reports.filter((r) => r.fallback).length}`,
    );
    for (const a of ['A1', 'A2', 'A3', 'A4'] as const) {
      const w = an.director.weights[a];
      const d = 100 * (share(a) - w);
      console.log(
        `  ${a}: ${(100 * share(a)).toFixed(1)} % (weight ${(100 * w).toFixed(0)} %, ${d >= 0 ? '+' : ''}${d.toFixed(1)} pts)`,
      );
      if (policy === 'hands-off' && Math.abs(d) > 10) failed = true;
    }
    console.log(`  outcomes: ${JSON.stringify(outcomes)}`);
    if (withOne < runs) failed = true;
    const flights = reports.flatMap((r) =>
      r.recovery
        ? [{ ...r.recovery, p: r.committedP ?? r.recovery.p, engineOut: r.fired.some((f) => f.startsWith('A4:')) }]
        : [],
    );
    const diverted = flights.filter((f) => f.mode === 'DIVERT');
    const failedCatch = flights.filter((f) => f.result === 'CATCH_FAILED').length;
    const highPDivert = diverted.filter((f) => f.p >= cm.autoCatchThreshold).length;
    const noEngineOut = diverted.filter((f) => !f.engineOut).length;
    const pct = (n: number): string => ((100 * n) / Math.max(1, flights.length)).toFixed(1);
    const by: Record<string, number> = {};
    for (const f of diverted) by[f.decidedBy] = (by[f.decidedBy] ?? 0) + 1;
    console.log(
      `  flights ${flights.length}: diverted ${diverted.length} (${pct(diverted.length)} %, ${JSON.stringify(by)}), ` +
        `failed catches ${failedCatch} (${pct(failedCatch)} %), diverted at p ≥ ${cm.autoCatchThreshold}: ${highPDivert}, ` +
        `diverted without an engine-out: ${noEngineOut}`,
    );
    if (policy === 'hands-off') {
      // AC 3c: diverted 10–25 % of flights, none at p ≥ autoCatchThreshold, none without an engine-out; failed ≤ 8 %.
      const share = diverted.length / Math.max(1, flights.length);
      const failedShare = failedCatch / Math.max(1, flights.length);
      if (flights.length === 0 || share < 0.1 || share > 0.25 || highPDivert > 0 || noEngineOut > 0) failed = true;
      if (failedShare > 0.08) failed = true;
    }
  }
  console.log(`\nsweep ${((performance.now() - t0) / 1000).toFixed(1)} s — ${failed ? 'FAIL' : 'ok'}`);
  process.exit(failed ? 1 : 0);
}
