// Phase 5 animated entities + camera rig (5.4/5.5): reach the five reference moments through window.__fuelx with
// `snap`, assert nothing throws and the frame stays inside the ARCHITECTURE §13.1 draw-call budget. Screenshots go
// to test-results/ always and to docs/screens/phase5-anim-*.png when FUELX_SCREENS=1.
import { expect, test } from '@playwright/test';

const SAVE_SCREENS = process.env.FUELX_SCREENS === '1';

type Orbit = { yawDeg: number; pitchDeg: number; distM: number };
interface Fx {
  ready(): Promise<void>;
  seed(seed: number): Promise<void>;
  jumpTo(target: string): Promise<void>;
  pause(): void;
  follow(callSign: string | null, opts?: { snap?: boolean }): void;
  camera(preset: 'home' | 'frame' | Orbit, opts?: { snap?: boolean }): void;
  freezeVisuals(on: boolean): void;
  frames(n: number): Promise<void>;
  state(): { clock: { tClock: string }; view: { follow: string | null } };
  stats(): { drawCalls: number; triangles: number };
}
/** Local view of the hook (scene.e2e.ts owns the global `Window.__fuelx` declaration). */
type FxWindow = { __fuelx?: Fx };

interface Moment {
  name: string;
  t: string;
  follow: string;
  /** Orbit set before the follow (the follow's `frame` keeps yaw / pitch and fits the distance). */
  pre?: Orbit;
  /** Explicit orbit after the follow. */
  cam?: Orbit;
}

// In jump order (jumps only go forward).
const MOMENTS: Moment[] = [
  { name: 'crane-CR77@T-05-45-00', t: 'T-05:45:00', follow: 'CR-77', cam: { yawDeg: 20, pitchDeg: 16, distM: 330 } },
  {
    name: 'rollout-SP41-B09@T-05-15-00',
    t: 'T-05:15:00',
    follow: 'SP-41',
    pre: { yawDeg: 125, pitchDeg: 20, distM: 300 },
  },
  { name: 'tower-qd@T-00-10-00', t: 'T-00:10:00', follow: 'TOWER-1', cam: { yawDeg: 255, pitchDeg: 14, distM: 330 } },
  {
    name: 'boostback-follow-B09@T+00-03-00',
    t: 'T+00:03:00',
    follow: 'B-09',
    pre: { yawDeg: 200, pitchDeg: 20, distM: 300 },
  },
  { name: 'catch@T+00-06-55', t: 'T+00:06:55', follow: 'TOWER-1', cam: { yawDeg: 225, pitchDeg: 16, distM: 380 } },
];

test.describe('animated entities and camera rig', () => {
  test.describe.configure({ timeout: 300_000 });

  test('reference moments render inside the draw-call budget', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto('/play.html?debug=1');
    await page.waitForFunction(() => (window as unknown as FxWindow).__fuelx !== undefined);
    await page.evaluate(async () => {
      const fx = (window as unknown as FxWindow).__fuelx;
      if (!fx) throw new Error('no __fuelx');
      await fx.seed(42);
      fx.pause();
      await fx.ready();
    });
    for (const m of MOMENTS) {
      const r = await page.evaluate(async (m) => {
        const fx = (window as unknown as FxWindow).__fuelx;
        if (!fx) throw new Error('no __fuelx');
        await fx.jumpTo(m.t);
        fx.freezeVisuals(true);
        if (m.pre) {
          fx.camera(m.pre, { snap: true });
          await fx.frames(1);
        }
        fx.follow(m.follow, { snap: true });
        await fx.frames(1);
        if (m.cam) fx.camera(m.cam, { snap: true });
        await fx.frames(4);
        return { stats: fx.stats(), state: fx.state() };
      }, m);
      console.log(`${m.name}: ${r.stats.drawCalls} draw calls, ${r.stats.triangles} triangles`);
      expect(r.state.view.follow).toBe(m.follow);
      expect(r.stats.drawCalls).toBeGreaterThan(5);
      expect(r.stats.drawCalls).toBeLessThanOrEqual(260); // main ≤ 200 + shadow ≤ 60
      await page.screenshot({
        path: SAVE_SCREENS ? `docs/screens/phase5-anim-${m.name}.png` : `test-results/phase5-anim-${m.name}.png`,
      });
    }
    expect(errors).toEqual([]);
  });
});
