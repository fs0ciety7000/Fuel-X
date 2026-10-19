// Compact, fixed-precision text format of the golden log: one line per event, plus telemetry samples.
import { STATIONS, farmUsableKg } from '../../src/sim/index';
import type { Countdown, SimEvent, World } from '../../src/sim/index';

const pad = (n: number, w: number): string => String(n).padStart(w, ' ');

/** T-clock ticks → `T-hh:mm:ss` / `T+hh:mm:ss` (whole seconds, truncated toward the earlier second). */
export function tClock(ticks: number): string {
  const s = Math.floor(ticks / 30);
  const a = Math.abs(s);
  const hms = [Math.floor(a / 3600), Math.floor(a / 60) % 60, a % 60].map((x) => String(x).padStart(2, '0'));
  return `${s < 0 ? 'T-' : 'T+'}${hms.join(':')}`;
}

/** Numbers: integers verbatim, others to 3 decimals; ids replaced by call-signs. */
function value(world: World, names: Map<string, string>, key: string, v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3);
  if (typeof v === 'string' && /^(id|tankerId|boosterId|entityId)$/.test(key))
    return names.get(v) ?? world.entities.byId[v]?.callSign ?? v;
  if (Array.isArray(v)) return `[${v.map((x) => value(world, names, '', x)).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.entries(v)
      .map(([k, x]) => `${k}:${value(world, names, k, x)}`)
      .join(',')}}`;
  }
  return String(v);
}

export class GoldenLog {
  readonly lines: string[] = [];
  /** Entity id → call-sign (kept after despawn). */
  private readonly names = new Map<string, string>();

  constructor(
    private readonly world: World,
    header: string[],
  ) {
    for (const h of header) this.lines.push(`# ${h}`);
    for (const id of world.entities.order) this.names.set(id, world.entities.byId[id]?.callSign ?? id);
  }

  event(cd: Countdown, e: SimEvent): void {
    if (e.t === 'Spawned') this.names.set(e.id, e.callSign);
    const fields = Object.entries(e)
      .filter(([k]) => k !== 't' && k !== 'tick' && k !== 'countdownId')
      .map(([k, v]) => `${k}=${value(this.world, this.names, k, v)}`)
      .join(' ');
    this.lines.push(`${pad(e.tick, 6)} ${tClock(cd.tClockTicks)} ${e.t} ${fields}`.trimEnd());
  }

  telemetry(cd: Countdown): void {
    const w = this.world;
    const st = STATIONS.map((s) => cd.inputs.stations[s][0]).join('');
    const wx = w.weather;
    const b = w.entities.byId[cd.boosterId];
    const s = w.entities.byId[cd.shipId];
    const kg = (x: number): string => String(Math.round(x));
    const deg = (rad: number): string => ((rad * 180) / Math.PI).toFixed(1);
    const parts = [
      `${pad(w.tick, 6)} ${tClock(cd.tClockTicks)} TLM ${cd.phase.state}/${cd.clock.state}`,
      `wind=${wx.groundWindMPerS.toFixed(2)}/${wx.groundGustMPerS.toFixed(2)}/${wx.towerWindMPerS.toFixed(2)} upper=${wx.upperWindMPerS.toFixed(2)}`,
      `stations=${st}`,
      `farm=${kg(farmUsableKg(w, 'LOX'))}/${kg(farmUsableKg(w, 'CH4'))}`,
    ];
    if (b?.kind === 'booster') {
      if (b.flight && !b.flight.done) {
        const f = b.flight;
        parts.push(
          `B-09 alt=${f.altitudeM.toFixed(1)} v=${f.speedMPerS.toFixed(1)} dr=${f.downrangeM.toFixed(1)} tilt=${deg(f.tiltRad)} prop=${kg(b.prop.loxKg + b.prop.ch4Kg)} lit=${b.engines.lit} p=${(b.recovery?.p ?? 0).toFixed(3)}`,
        );
      } else parts.push(`B-09 ${b.fsm.state} ${kg(b.prop.loxKg)}/${kg(b.prop.ch4Kg)}`);
    }
    if (s?.kind === 'ship') {
      parts.push(
        s.flight && !s.flight.done
          ? `S-21 alt=${s.flight.altitudeM.toFixed(1)} v=${s.flight.speedMPerS.toFixed(1)} tilt=${deg(s.flight.tiltRad)}`
          : `S-21 ${s.fsm.state} ${kg(s.prop.loxKg)}/${kg(s.prop.ch4Kg)}`,
      );
    }
    parts.push(`cr=${Math.round(w.economy.moneyCr)} rep=${w.economy.reputation}`);
    this.lines.push(parts.join(' '));
  }

  text(): string {
    return `${this.lines.join('\n')}\n`;
  }
}
