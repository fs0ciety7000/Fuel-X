// Debrief panel view model (GDD §4.9, AC 22): outcome, money / reputation deltas, booster wear, decision log.
import type { DebriefVM } from '@bridge/projection-types';
import { DT_S } from '@sim/index';
import type { Ctx } from './context';
import { credits, days, duration, num, pct, prob, signed, tClock, tonnes, utc, words } from './format';
import { ANOMALY_LABEL, LEDGER_LABEL, OUTCOME_LABEL, OUTCOME_STATUS } from './labels';

export function debriefVM(c: Ctx): DebriefVM | null {
  const cd = c.cd;
  const d = cd ? c.world.debriefs[cd.id] : undefined;
  if (!cd || !d) return null;
  const rep = (x: number, delta = false): DebriefVM['reputationStart'] => ({
    text: delta ? signed(x, 0) : num(x, 0, '').text,
    unit: 'REP',
    si: x,
  });
  return {
    countdownId: d.countdownId,
    title: `DEBRIEF · ${d.flightName}`,
    outcome: d.outcome,
    outcomeLabel: OUTCOME_LABEL[d.outcome],
    state: OUTCOME_STATUS[d.outcome],
    contract: { id: d.contractId, status: words(d.contractStatus) },
    moneyStart: credits(d.moneyStartCr),
    moneyEnd: credits(d.moneyEndCr),
    moneyDelta: credits(d.moneyDeltaCr, true),
    reputationStart: rep(d.reputationStart),
    reputationEnd: rep(d.reputationEnd),
    reputationDelta: rep(d.reputationDelta, true),
    holdTime: duration(d.holdS),
    turnaround: days(d.turnaroundS),
    booster: {
      callSign: d.booster.callSign,
      state: words(d.booster.state),
      enginesOut: d.booster.enginesOut,
      wear: `${pct(d.booster.wearBefore).text} → ${pct(d.booster.wearAfter).text} %`,
      wearBefore: pct(d.booster.wearBefore),
      wearAfter: pct(d.booster.wearAfter),
      flights: `${d.booster.flightsBefore} → ${d.booster.flightsAfter}`,
    },
    tower: words(d.towerState),
    recovery: d.recovery
      ? {
          mode: d.recovery.mode,
          result: words(d.recovery.result),
          p: prob(d.recovery.p),
          roll: prob(d.recovery.roll),
          by: d.recovery.decidedBy,
        }
      : null,
    propellant: {
      deliveredLox: tonnes(d.propellant.deliveredKg.LOX),
      deliveredCh4: tonnes(d.propellant.deliveredKg.CH4),
      lostLox: tonnes(d.propellant.lostKg.LOX),
      lostCh4: tonnes(d.propellant.lostKg.CH4),
    },
    lines: d.lines.map((l) => ({
      code: l.item,
      label: LEDGER_LABEL[l.item],
      amount: credits(l.amountCr, true),
      reputation: { text: signed(l.reputationDelta, 0), unit: 'REP', si: l.reputationDelta },
    })),
    anomalies: d.anomalies.map((a) => ({
      code: a.anomaly,
      label: ANOMALY_LABEL[a.anomaly],
      source: a.source,
      utc: utc(c.utc0 + a.tick * DT_S),
    })),
    decisions: d.decisions.map((x) => ({ tClock: tClock(x.tClockTicks), by: x.by, kind: words(x.kind), detail: x.detail })),
  };
}
