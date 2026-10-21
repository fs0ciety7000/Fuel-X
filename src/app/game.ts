// Composition root object (ARCHITECTURE §2): wires SimHost ↔ GameLoop ↔ render scene ↔ bus. Created once in
// main.tsx outside React so StrictMode double-mounts never build a second world.
import { commands, persistence, projectionStore, session, view, viewStore } from '@bridge/index';
import type { ViewState } from '@bridge/index';
import { createFrameInput, createRenderControls, DEFAULT_SITE, SLOT_STRIDE, SlotFlag } from '@render/index';
import type { FrameInput, RenderControls, SceneApi } from '@render/index';
import type { Countdown, World } from '@sim/types';
import { EventBus } from './bus';
import { GameLoop } from './loop';
import { formatTClock } from './jump';
import { PersistenceController, browserPersistenceEnv, openBrowserSaveStore } from './persistence';
import { Projector } from './projection/projector';
import type { TimeInputs } from './projection/context';
import { SessionController } from './session/controller';
import type { RunOptions, SessionEnv } from './session/controller';
import { InlineSimHost } from './sim-host/inline';
import type { SkipBlockCode } from './time/rules';
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
  /** Runs: URL seed, REPLAY SAME SEED, NEW SEED, EXPORT LOG (GDD §13.2.3). */
  readonly session: SessionController;
  /** Autosave ring, resume offer, export / import (8.3, ARCHITECTURE §10). */
  readonly persistence: PersistenceController;
  scene: SceneApi | null = null;
  private readout: HTMLElement | null = null;
  private readoutAt = 0;

  constructor(env: SessionEnv = browserSessionEnv()) {
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
    this.bus.onBatch((batch) => {
      if (batch.some((e) => e.t === 'PhaseChanged' && e.to === 'Liftoff')) this.followLaunch();
    });
    this.loop.onAfterFrame(() => this.projector.frame(performance.now()));
    commands.bind((cmd) => this.host.send(cmd));
    this.session = new SessionController(this.host, env, () => this.afterNewRun());
    session.bind({
      skipToNextMilestone: () => void this.skipToNextMilestone(),
      cancelSkip: () => this.cancelSkip(),
      replaySameSeed: () => void this.session.replaySameSeed(),
      newSeed: () => void this.session.newSeed(),
      exportLog: () => void this.session.exportLog(),
      viewSite: () => this.cancelSkip(),
    });
    viewStore.subscribe((s, prev) => this.applyView(s, prev));
    this.persistence = new PersistenceController({
      host: this.host,
      bus: this.bus,
      store: openBrowserSaveStore(),
      env: browserPersistenceEnv(),
      setPaused: (on) => {
        this.time.paused = on;
        this.projector.markDirty();
      },
      afterLoad: () => this.afterLoad(),
    });
    persistence.bind(this.persistence.handlers);
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
      skipping: t.skip?.target ?? null,
      skipBlocker: t.skipBlocker(world, cd),
      drop: t.lastDrop ? { code: t.lastDrop.code, tick: t.lastDrop.tick } : null,
      queued: this.host.pendingCommands(),
    };
  }

  /** SKIP TO NEXT MILESTONE (GDD §6, 7.2): null when started, else the blocker code. */
  skipToNextMilestone(): SkipBlockCode | null {
    const { world, countdown } = this.host.inspect();
    const blocked = this.time.startSkip(world, countdown);
    this.projector.markDirty();
    return blocked;
  }

  cancelSkip(): void {
    this.time.cancelSkip();
    this.projector.markDirty();
  }

  /** AC 25: at liftoff the camera follows the booster unless the player is following something else (a plain
   * selection does not block it, GDD §14.1 call 1). */
  private followLaunch(): void {
    const { countdown } = this.host.inspect();
    if (!countdown) return;
    const s = viewStore.getState();
    if (s.followId !== null) return;
    view.follow(countdown.boosterId, { select: s.selectedId === null });
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

  /** New run (seed in the URL unless `url: false`): fresh world, time rules, projector, view and camera reset. */
  newRun(seed: number, opts?: RunOptions): Promise<void> {
    return this.session.start(seed, opts);
  }

  private afterNewRun(): void {
    this.persistence.onNewRun();
    this.time.resetRun();
    this.projector.reset();
    view.reset();
    view.camera({ kind: 'home' });
    this.afterTeleport();
  }

  /** After a load (save import, CONTINUE, debug `load`): same resets as a new run, the URL is the caller's. */
  afterLoad(): void {
    this.time.resetRun();
    this.projector.reset();
    view.reset();
    view.camera({ kind: 'home' });
    this.afterTeleport();
  }

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

/** Browser effects for the session controller (address bar, download, crypto entropy). */
export function browserSessionEnv(): SessionEnv {
  const hasWindow = typeof window !== 'undefined';
  return {
    entropy: () => crypto.getRandomValues(new Uint32Array(1))[0] ?? 1,
    nowIso: () => new Date().toISOString(),
    ...(hasWindow
      ? {
          getSearch: () => window.location.search,
          setSearch: (search: string) => window.history.replaceState(window.history.state, '', search),
          download: (name: string, json: string) => {
            const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 0);
          },
        }
      : {}),
  };
}
