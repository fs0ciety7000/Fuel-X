// 7.5 playtest pass (headless): scenario `mvp` on a few seeds under contrasting player policies, one report per run
// for the game designer — outcome, money / reputation, holds, anomalies, the decision log, catch p at commit, and
// "dead air" (longest sim stretch before liftoff with no decision open, no anomaly and no poll).
// Usage: npx tsx scripts/sim/playtest.ts [seeds=7,42,1234] > report.md
import { STANDARD_AUTOPILOT, autopilotCommands, createMvpScenario, step } from '../../src/sim/index.ts';
import type { AutopilotOptions } from '../../src/sim/index.ts';

const POLICIES: Record<string, AutopilotOptions> = {
  standard: STANDARD_AUTOPILOT,
  // Spend nothing, accept the leak, let the flight computer make the catch call.
  frugal: { orders: [], go: true, leakResponse: 'DEGRADED', catchDecision: false },
  // Hedge everything: the whole fleet on rush, fix the leak, make the catch call.
  hedger: {
    orders: [
      { fluid: 'LOX', rush: true },
      { fluid: 'LOX', rush: true },
      { fluid: 'LOX', rush: true },
      { fluid: 'LOX', rush: true },
      { fluid: 'CH4', rush: true },
      { fluid: 'CH4', rush: true },
    ],
    go: true,
    leakResponse: 'HOLD_FIX',
    catchDecision: true,
  },
};

const T = (ticks: number): string => {
  const s = Math.round(Math.abs(ticks) / 30);
  const p = (n: number) => String(n).padStart(2, '0');
  return `T${ticks < 0 ? '-' : '+'}${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
};

function run(seed: number, name: string, opts: AutopilotOptions): string {
  const { world, countdown: cd } = createMvpScenario({ seed });
  const beats: { tClock: number; what: string }[] = [];
  let committedP: number | null = null;
  let openDecisions = 0;
  let longestQuiet = 0;
  let quietFrom = cd.tClockTicks;
  for (let i = 0; i < 2_000_000 && cd.phase.state !== 'Debrief'; i++) {
    step(world, autopilotCommands(world, cd.id, opts));
    for (const e of world.outbox) {
      const salient =
        e.t === 'DecisionRequired' || e.t === 'AnomalyFired' || e.t === 'PollOpened' || e.t === 'HoldStarted';
      if (e.t === 'DecisionRequired') {
        openDecisions++;
        beats.push({ tClock: cd.tClockTicks, what: `decision ${e.decision}${'poll' in e ? ` ${e.poll}` : ''}` });
      }
      if (e.t === 'AnomalyFired') beats.push({ tClock: cd.tClockTicks, what: `anomaly ${e.anomaly}` });
      if (e.t === 'RecoveryCommitted') committedP = e.p;
      if (salient && cd.liftoffTick === null) {
        longestQuiet = Math.max(longestQuiet, cd.tClockTicks - quietFrom);
        quietFrom = cd.tClockTicks;
      }
    }
    world.outbox.length = 0;
  }
  const d = world.debriefs[cd.id];
  if (!d) return `### seed ${seed} · ${name}\n\nno debrief (stopped at ${cd.phase.state})\n`;
  const out = [
    `### seed ${seed} · ${name}`,
    '',
    `- outcome **${d.outcome}** · contract ${d.contractStatus} · money Δ ${(d.moneyDeltaCr / 1e6).toFixed(2)} M cr · rep Δ ${d.reputationDelta} · hold ${(d.holdS / 60).toFixed(1)} min`,
    `- recovery ${d.recovery ? `${d.recovery.mode} ${d.recovery.result} by ${d.recovery.decidedBy}` : 'none (no flight)'} · p at commit ${committedP?.toFixed(3) ?? '—'} · engines out ${d.booster.enginesOut} · tower ${d.towerState}`,
    `- anomalies: ${d.anomalies.map((a) => `${a.anomaly} (${a.source})`).join(', ') || 'none'}`,
    `- decision points opened: ${openDecisions} · longest stretch before liftoff with nothing opening (no decision / poll / hold / anomaly): ${(longestQuiet / 30 / 60).toFixed(0)} min sim`,
    `- beats: ${beats.map((b) => `${T(b.tClock)} ${b.what}`).join(' · ')}`,
    `- ledger: ${d.lines.map((l) => `${l.item} ${(l.amountCr / 1e6).toFixed(2)}`).join(' · ')}`,
    `- decision log: ${d.decisions.map((x) => `${T(x.tClockTicks)} ${x.kind} ${x.detail} (${x.by})`).join(' · ')}`,
    '',
  ];
  return out.join('\n');
}

const seeds = (process.argv[2] ?? '7,42,1234').split(',').map(Number);
console.log(`# Playtest pass (7.5) — seeds ${seeds.join(', ')}\n`);
for (const seed of seeds) for (const [name, opts] of Object.entries(POLICIES)) console.log(run(seed, name, opts));
