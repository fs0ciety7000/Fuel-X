// Composition root object (ARCHITECTURE §2): wires SimHost ↔ GameLoop ↔ render scene ↔ bus. Created once in
// main.tsx outside React so StrictMode double-mounts never build a second world.
import { commands, projectionStore, viewStore } from '@bridge/index';
import type { ViewState } from '@bridge/index';
import { createFrameInput, createRenderControls, DEFAULT_SITE, SLOT_STRIDE, SlotFlag } from '@render/index';
import type { FrameInput, RenderControls, SceneApi } from '@render/index';
import type { Countdown, World } from '@sim/types';
import { EventBus } from './bus';
import { GameLoop } from './loop';
import { formatTClock } from './jump';
import { Projector } from './projection/projector';
import type { TimeInputs } from './projection/context';
import { InlineSimHost } from './sim-host/inline';
import { TimeControl } from './time/time-control';

export class Game {
  readonly host = new InlineSimHost(() => performance.now());
  readonly time = new TimeControl();
  readonly bus = new EventBus();
  readonly controls: RenderControls = createRenderControls(DEFAULT_SITE);
  readonly input: FrameInput = createFrameInput();
  readonly loop: GameLoop;
  /** UI projection (6.1): ≤ 10 Hz + salient flushes into `projectionStore`. */
  readonly projector: Projector;
  scene: SceneApi | null = null;
  private readout: HTMLElement | null = null;
  private readoutAt = 0;

  constructor() {
    this.loop = new GameLoop({
      host: this.host,
      time: this.time,
      onEvents: (events) => this.bus.dispatch(events),
      render: (now, alpha, wallDtMs) => {
        if (!this.scene) return;
        this.input.alpha = alpha;
        this.input.wallDtMs = wallDtMs;
        this.scene.advance(now);
      },
      now: () => performance.now(),
      raf: (cb) => requestAnimationFrame(cb),
      caf: (id) => cancelAnimationFrame(id),
    });
    this.loop.onAfterFrame(() => this.updateReadout());

    // UI wiring (ADR 0004). One Game per page: the bridge stores and the command port are page singletons.
    this.projector = new Projector({
      inspect: () => this.host.inspect(),
      time: (world, cd) => this.timeInputs(world, cd),
      view: viewStore,
      store: projectionStore,
      now: () => performance.now(),
      hidden: (id) => this.isHidden(id),
    });
    this.bus.onBatch((batch) => this.projector.onEvents(batch));
    this.loop.onAfterFrame(() => this.projector.frame(performance.now()));
    commands.bind((cmd) => this.host.send(cmd));
    viewStore.subscribe((s, prev) => this.applyView(s, prev));
  }

  timeInputs(world: Readonly<World>, cd: Readonly<Countdown> | null): TimeInputs {
    const t = this.time;
    return {
      requested: t.requested,
      paused: t.paused,
      effective: t.effectiveScale(world, cd),
      maxAllowed: t.maxAllowed(world, cd),
      lagging: t.lagging,
      effectiveRate: t.effectiveRate,
    };
  }

  /** viewStore intents → render controls / time control (the only writer of those from the UI side). */
  private applyView(s: ViewState, prev: ViewState): void {
    const c = this.controls;
    if (s.followId !== prev.followId) c.followId = s.followId;
    if (s.siteId !== prev.siteId) c.siteId = s.siteId;
    if (s.camera && s.camera.seq !== prev.camera?.seq) {
      c.cameraRequest = s.camera.intent.kind === 'orbit' ? { ...s.camera.intent } : { kind: s.camera.intent.kind };
      if (s.camera.snap) c.snapCamera = true;
    }
    if (s.timeScale && s.timeScale.seq !== prev.timeScale?.seq) this.time.setScale(s.timeScale.scale);
  }

  readonly attachScene = (api: SceneApi): void => {
    this.scene = api;
  };

  /** After a new game / load / jump: start exactly on the new tick and cut the camera. */
  afterTeleport(): void {
    this.loop.resetAccumulator();
    this.controls.snapCamera = true;
    this.projector.markDirty();
  }

  /** The followed / given slot is not drawn (hidden flag or not alive). */
  isHidden(id: string): boolean {
    const e = this.host.inspect().world.entities.byId[id];
    if (!e) return true;
    const f = this.host.snapshot.curr[e.slot * SLOT_STRIDE + 7] ?? 0;
    return (f & SlotFlag.ALIVE) === 0 || (f & SlotFlag.HIDDEN) !== 0;
  }

  bindReadout(el: HTMLElement | null): () => void {
    this.readout = el;
    return () => {
      if (this.readout === el) this.readout = null;
    };
  }

  /** Temporary debug readout (no HUD until Phase 6): written imperatively at 4 Hz, never through React. */
  private updateReadout(): void {
    const el = this.readout;
    const now = performance.now();
    if (!el || now - this.readoutAt < 250) return;
    this.readoutAt = now;
    const { world, countdown: cd } = this.host.inspect();
    const scale = this.time.effectiveScale(world, cd);
    const st = this.scene?.stats();
    const times = this.loop.frameTimes();
    const mean = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    el.textContent = [
      this.controls.siteId,
      cd
        ? `${formatTClock(cd.tClockTicks)} ${cd.phase.state.toUpperCase()}${cd.clock.state === 'Holding' ? ' HOLD' : ''}`
        : '',
      this.time.paused ? 'PAUSE' : `${scale}×`,
      `${mean > 0 ? Math.round(1000 / mean) : 0} FPS`,
      st ? `${st.drawCalls} DC · ${Math.round(st.triangles / 1000)}K TRI` : 'LOADING',
    ]
      .filter(Boolean)
      .join(' · ');
  }
}
