// Debrief panel view model (GDD §4.9, AC 22; DESIGN_SYSTEM §6.29): outcome, money / reputation deltas, booster
// wear, ledger, timestamped decision log.
import type { DebriefVM, ValueVM } from '@bridge/projection-types';
import { DT_S } from '@sim/index';
import type { Ctx } from './context';
import { credits, days, duration, num, pct, prob, signed, tClock, tonnes, utc, words } from './format';
import { ANOMALY_LABEL, LEDGER_LABEL, OUTCOME_LABEL, OUTCOME_STATUS } from './labels';

const rep = (x: number, delta = false): ValueVM => ({
  text: delta ? signed(x, 0) : num(x, 0, '').text,
  unit: 'REP',
  value: x,
});

export function debriefVM(c: Ctx): DebriefVM | null {
  const cd = c.cd;
  const d = cd ? c.world.debriefs[cd.id] : undefined;
  if (!cd || !d) return null;
  const st = OUTCOME_STATUS[d.outcome];
  const wearSegs = 10;
  const facts: { label: string; value: string }[] = [
    { label: 'CONTRACT', value: `${d.contractId} ${words(d.contractStatus)}` },
    { label: 'HOLD TIME', value: duration(d.holdS).text },
    { label: 'LIFTOFF', value: d.liftoffTick !== null ? `${utc(c.utc0 + d.liftoffTick * DT_S)} UTC` : '—' },
  ];
  if (d.recovery) {
    facts.push(
      { label: 'RECOVERY', value: `${d.recovery.mode} · ${words(d.recovery.result)} · ${d.recovery.decidedBy}` },
      { label: 'CATCH P / ROLL', value: `${prob(d.recovery.p).text} / ${prob(d.recovery.roll).text}` },
    );
  }
  facts.push(
    {
      label: 'LOX DELIVERED / LOST',
      value: `${tonnes(d.propellant.deliveredKg.LOX).text} / ${tonnes(d.propellant.lostKg.LOX).text} T`,
    },
    {
      label: 'CH4 DELIVERED / LOST',
      value: `${tonnes(d.propellant.deliveredKg.CH4).text} / ${tonnes(d.propellant.lostKg.CH4).text} T`,
    },
  );
  return {
    countdownId: d.countdownId,
    title: `DEBRIEF · ${d.flightName}`,
    stamp: OUTCOME_LABEL[d.outcome],
    outcome: d.outcome,
    outcomeLabel: OUTCOME_LABEL[d.outcome],
    state: st.severity,
    facts,
    money: { delta: credits(d.moneyDeltaCr, true), from: credits(d.moneyStartCr), to: credits(d.moneyEndCr) },
    reputation: { delta: rep(d.reputationDelta, true), from: rep(d.reputationStart), to: rep(d.reputationEnd) },
    booster: {
      callSign: d.booster.callSign,
      state: words(d.booster.state),
      flights: `${d.booster.flightsBefore} → ${d.booster.flightsAfter}`,
      wear: {
        value: Math.round(d.booster.wearAfter * wearSegs),
        max: wearSegs,
        label: `WEAR ${pct(d.booster.wearAfter).text} %`,
        text: `${pct(d.booster.wearBefore).text} → ${pct(d.booster.wearAfter).text} %`,
      },
    },
    tower: {
      label: words(d.towerState),
      state: d.towerState === 'DAMAGED' ? 'danger' : 'ok',
    },
    turnaround: days(d.turnaroundS),
    ledger: d.lines.map((l) => ({
      label: LEDGER_LABEL[l.item],
      amount: credits(l.amountCr, true),
      reputation: l.reputationDelta !== 0 ? rep(l.reputationDelta, true) : null,
    })),
    decisions: d.decisions.map((x, i) => ({
      time: tClock(x.tClockTicks),
      id: `${i}:${x.kind}`,
      detail: `${words(x.kind)}${x.detail ? ` · ${x.detail}` : ''}`,
      by: x.by,
    })),
    anomalies: d.anomalies.map((a) => ({
      id: a.anomaly,
      label: `${ANOMALY_LABEL[a.anomaly]} · ${a.source}`,
      time: utc(c.utc0 + a.tick * DT_S),
    })),
    actions: [],
  };
}
