// perf-audit 8.1: memory / GPU-resource leaks over full runs on the production build (`?debug=1`, full visuals).
// Plays seed 42 (standard autopilot) to Debrief, starts a NEW RUN of the same seed and of a new seed (7) and plays
// them to Debrief too, then starts seed 42 once more. Checkpoints: tick 0 of each run and each Debrief.
// Counted per checkpoint: renderer.info (geometries / textures / programs), live WebGL objects (create* − delete*
// wrapped by an init script: buffers, textures, VAOs, programs — catches per-entity InstancedMesh matrices that
// renderer.info does not count), and CDP metrics after a forced GC (JS heap, DOM nodes, event listeners).
// Same state ⇒ same counts: tick 0 of the third/fourth run must equal tick 0 of the second, and the second
// seed-42 Debrief must equal the first; the JS heap may drift by allocator noise only (≤ 2 MB).
// Run: `FUELX_PERF=1 npx playwright test --project perf tests/e2e/leaks.perf.ts` (writes test-results/perf-leaks.json).
// SwiftShader: frame times are meaningless here; this spec reads counts only.
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';

interface Gl {
  buffers: number;
  textures: number;
  vaos: number;
  programs: number;
}
interface Checkpoint {
  label: string;
  tick: number;
  entities: number;
  geometries: number;
  textures: number;
  programs: number;
  gl: Gl;
  heapMB: number;
  nodes: number;
  listeners: number;
  outcome: string | null;
}

/** Live WebGL object counts (create − delete), installed before the app boots. */
const GL_COUNTER = `(() => {
  const live = { buffers: 0, textures: 0, vaos: 0, programs: 0 };
  window.__glLive = live;
  const wrap = (proto, create, del, key) => {
    const c = proto[create], d = proto[del];
    proto[create] = function (...a) { const o = c.apply(this, a); if (o) live[key]++; return o; };
    proto[del] = function (o, ...a) { if (o) live[key]--; return d.call(this, o, ...a); };
  };
  for (const P of [WebGL2RenderingContext.prototype]) {
    wrap(P, 'createBuffer', 'deleteBuffer', 'buffers');
    wrap(P, 'createTexture', 'deleteTexture', 'textures');
    wrap(P, 'createVertexArray', 'deleteVertexArray', 'vaos');
    wrap(P, 'createProgram', 'deleteProgram', 'programs');
  }
})();`;

async function fx<T>(page: Page, body: string): Promise<T> {
  return page.evaluate(
    (src) =>
      new Function('fx', `return (async () => { ${src} })();`)(
        (window as unknown as { __fuelx?: unknown }).__fuelx,
      ) as Promise<T>,
    body,
  );
}

async function checkpoint(page: Page, cdp: CDPSession, label: string): Promise<Checkpoint> {
  await fx(page, `await fx.frames(3);`);
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const { metrics } = await cdp.send('Performance.getMetrics');
  const m = (name: string): number => metrics.find((x) => x.name === name)?.value ?? 0;
  const s = await fx<Omit<Checkpoint, 'label' | 'heapMB' | 'nodes' | 'listeners'>>(
    page,
    `const r = fx.stats(); const st = fx.state();
     return { tick: r.tick, entities: r.entities, geometries: r.geometries, textures: r.textures,
       programs: r.programs, gl: { ...window.__glLive }, outcome: st.debrief ? st.debrief.outcome : null };`,
  );
  const cp: Checkpoint = {
    label,
    ...s,
    heapMB: Math.round((m('JSHeapUsedSize') / 2 ** 20) * 10) / 10,
    nodes: m('Nodes'),
    listeners: m('JSEventListeners'),
  };
  console.log(JSON.stringify(cp));
  return cp;
}

/** Steps the paused run to Debrief in 5-min batches, drawing a frame between batches so views mount / unmount. */
async function playToDebrief(page: Page): Promise<void> {
  const done = await fx<boolean>(
    page,
    `for (let i = 0; i < 400; i++) {
       if (fx.state().debrief) return true;
       fx.step(9000);
       await fx.frames(1);
     }
     return false;`,
  );
  expect(done, 'run reached Debrief').toBe(true);
}

test.describe('perf leaks', () => {
  test.describe.configure({ timeout: 1_800_000 });

  test('new runs do not accumulate GPU objects, scene state, DOM or heap', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(GL_COUNTER);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    await page.goto('/play.html?debug=1&seed=42');
    await page.waitForFunction(() => '__fuelx' in window);

    const run = async (seed: number, tag: string): Promise<[Checkpoint, Checkpoint]> => {
      await fx(page, `await fx.seed(${seed}); fx.pause(); await fx.ready(); fx.camera('home', { snap: true });`);
      const start = await checkpoint(page, cdp, `${tag} seed ${seed} tick 0`);
      await playToDebrief(page);
      const end = await checkpoint(page, cdp, `${tag} seed ${seed} debrief`);
      return [start, end];
    };

    const [a0, a1] = await run(42, 'run 1');
    const [b0, b1] = await run(42, 'run 2');
    const [c0, c1] = await run(7, 'run 3');
    const [d0] = await run(42, 'run 4');
    const all = [a0, a1, b0, b1, c0, c1, d0];
    writeFileSync('test-results/perf-leaks.json', `${JSON.stringify(all, null, 2)}\n`);

    // Run 1 tick 0 is the cold page (lazy chunks, first-use programs); from run 2 on the same state must cost the same.
    for (const cp of [c0, d0]) {
      expect(cp.gl, `${cp.label}: live WebGL objects`).toEqual(b0.gl);
      expect(cp.geometries, `${cp.label}: geometries`).toBe(b0.geometries);
      expect(cp.textures, `${cp.label}: textures`).toBe(b0.textures);
      expect(cp.nodes, `${cp.label}: DOM nodes`).toBeLessThanOrEqual(b0.nodes + 20);
      expect(cp.heapMB, `${cp.label}: JS heap`).toBeLessThanOrEqual(b0.heapMB + 2);
    }
    expect(b1.gl, 'run 2 debrief: live WebGL objects').toEqual(a1.gl);
    expect(b1.geometries, 'run 2 debrief: geometries').toBe(a1.geometries);
    expect(b1.heapMB, 'run 2 debrief: JS heap').toBeLessThanOrEqual(a1.heapMB + 2);
    expect(errors).toEqual([]);
  });
});
