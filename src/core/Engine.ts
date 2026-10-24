import { Mascot, type MotionLevel } from './Mascot';
import {
  DEFAULT_SIZE,
  type PagegeistCallbacks,
  type PagegeistEventMap,
  type PagegeistEventName,
  type PagegeistOptions,
  type PagegeistState,
  type ResolvedOptions,
  resolveOptions,
} from './options';
import { createPhysics } from './physics';
import { createRandom } from './random';
import { drawGroundShadow, drawSpeechBubble, drawWallShadow } from './render/effects';
import { GothRenderer } from './render/GothRenderer';
import { type MascotRenderer, RenderQueue, type RenderState, Z } from './render/types';
import { MascotState, type Rect, type Vec2 } from './types';
import { DomCollisionWorld, IGNORE_ATTRIBUTE } from './World';

/** Public handle returned by `createPagegeist()`. */
export interface PagegeistInstance {
  /** Current activity. */
  readonly state: PagegeistState;
  readonly paused: boolean;
  /** Show a speech bubble. Text is rendered as plain text, never as HTML. */
  say(text: string, options?: { duration?: number }): void;
  pause(): void;
  resume(): void;
  /** Let her fall into view again (or reappear on an element in static mode). */
  respawn(): void;
  /** Update options at runtime. `container`, `size` and `random` cannot be changed. */
  update(options: PagegeistOptions): void;
  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends PagegeistEventName>(type: K, listener: (event: PagegeistEventMap[K]) => void): () => void;
  /** Stop everything and remove all DOM nodes and listeners. Idempotent. */
  destroy(): void;
}

const FIXED_STEP = 1 / 120;
/** Foot-trace overlay (debug): ring buffer size and how long samples stay visible (sim seconds). */
const FOOT_TRACE_SAMPLES = 240;
const FOOT_TRACE_SECONDS = 2.5;
/** A jump larger than this between two frames (px) is a teleport: the trace restarts. */
const FOOT_TRACE_TELEPORT = 200;
const FOOT_COLORS = { near: '#7ad7ff', far: '#ff6bcb' } as const;
/** Horizontal spawn point as a fraction of the viewport width; `'random'` has none. */
const SPAWN_FRACTIONS: Partial<Record<string, number>> = { left: 0.15, center: 0.5, right: 0.85 };
export const CALLBACK_KEYS: Record<PagegeistEventName, keyof PagegeistCallbacks> = {
  stateChange: 'onStateChange',
  land: 'onLand',
  poke: 'onPoke',
  grab: 'onGrab',
  release: 'onRelease',
  say: 'onSay',
  pause: 'onPause',
  resume: 'onResume',
};
/** States in which a near-miss click still grabs her (she is hard to hit while moving). */
const MOVING_STATES: ReadonlySet<PagegeistState> = new Set([
  MascotState.WALK,
  MascotState.JUMP,
  MascotState.FALL,
  MascotState.HANG_ON_EDGE,
  MascotState.CLIMB,
]);

type Listener = (event: never) => void;

/** One foot-trace sample: ankle positions in document space at simulation time `t`. */
interface FootSample {
  t: number;
  near: Vec2;
  far: Vec2;
}

/**
 * Overlay manager: a fullscreen canvas (pointer-events: none) plus a small hitbox that is
 * the only element receiving pointer events. Drives the game loop, physics and rendering.
 */
export class Engine implements PagegeistInstance {
  private options: ResolvedOptions;
  private callbacks: PagegeistCallbacks = {};
  private readonly listeners = new Map<PagegeistEventName, Set<Listener>>();
  private readonly world: DomCollisionWorld;
  private readonly mascot: Mascot;
  private readonly renderer: MascotRenderer;

  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly hitbox: HTMLDivElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private pauseButton: HTMLButtonElement | null = null;
  private liveRegion: HTMLDivElement | null = null;
  private layer: { main: HTMLCanvasElement; tint: HTMLCanvasElement } | null = null;
  private probe: CanvasRenderingContext2D | null = null;

  private readonly queue = new RenderQueue();
  private raf = 0;
  private lastFrame = 0;
  private accumulator = 0;
  private dpr = 1;
  private offscreenFor = 0;
  private cursorClient: Vec2 | null = null;
  private hitboxRect = { x: 0, y: 0, w: 0, h: 0 };
  private drag: {
    pointerId: number;
    start: Vec2;
    active: boolean;
    samples: Array<{ x: number; y: number; t: number }>;
  } | null = null;
  private restoreUserSelect: string | null = null;
  private cleanup: Array<() => void> = [];
  private dprWatch: (() => void) | null = null;
  private _paused: boolean;
  private reducedMotionQuery: MediaQueryList | null = null;
  private hidden = false;
  private darkBackground = false;
  private nextBackgroundCheck = 0;
  private renderedRevision = -1;
  private destroyed = false;
  private footTrace: FootSample[] = [];
  private footTraceHead = 0;
  private lastFeetPos: Vec2 | null = null;

  constructor(options: PagegeistOptions = {}) {
    if (typeof document === 'undefined') {
      throw new Error(
        'pagegeist: createPagegeist() needs a browser environment (call it in an effect, not during SSR).',
      );
    }
    if (typeof ResizeObserver === 'undefined' || typeof MutationObserver === 'undefined') {
      throw new Error('pagegeist: this browser lacks ResizeObserver/MutationObserver, which createPagegeist() needs.');
    }
    this.options = resolveOptions(options);
    this.setCallbacks(options);
    this._paused = options.paused ?? false;

    // An invalid size (NaN, <= 0, Infinity) would break all geometry: fall back to the default.
    const size = options.size ?? DEFAULT_SIZE;
    this.renderer = new GothRenderer(size > 0 && size < 1 / 0 ? size : DEFAULT_SIZE);
    this.world = new DomCollisionWorld(this.options.platforms, this.options.safeArea);
    this.mascot = new Mascot(
      this.world,
      this.renderer.metrics,
      createPhysics(this.renderer.metrics.height),
      createRandom(options.random),
      this.options,
      this.emit,
    );

    this.root = document.createElement('div');
    this.root.setAttribute(IGNORE_ATTRIBUTE, '');
    this.root.className = 'pagegeist';

    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    Object.assign(this.canvas.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);

    // Decorative: hidden from assistive tech; the optional pause control is the accessible UI.
    this.hitbox = document.createElement('div');
    this.hitbox.className = 'pagegeist-hitbox';
    this.hitbox.setAttribute('aria-hidden', 'true');
    Object.assign(this.hitbox.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      touchAction: 'none',
      borderRadius: '40%',
    } satisfies Partial<CSSStyleDeclaration>);

    this.ctx = this.canvas.getContext('2d');
    this.root.append(this.canvas, this.hitbox);
    this.applyStyles();
    this.syncPauseControl();
    this.syncLiveRegion();

    try {
      (options.container ?? document.body).append(this.root);
      this.resize();
      this.bindEvents();
      this.world.start(this.root);
      this.world.update();
      this.watchReducedMotion();
      this.mascot.start(this.spawnX(options.spawn ?? 'random'));
      this.syncLoop();
    } catch (error) {
      this.destroy(); // roll back DOM nodes, listeners and observers
      throw error;
    }
  }

  // ------------------------------------------------------------ Public API

  get state(): PagegeistState {
    return this.mascot.state;
  }

  get paused(): boolean {
    return this._paused;
  }

  say(text: string, options: { duration?: number } = {}): void {
    if (this.destroyed) return;
    this.mascot.say(String(text), options.duration);
    this.redraw();
  }

  pause(): void {
    this.setPaused(true);
  }

  resume(): void {
    this.setPaused(false);
  }

  respawn(): void {
    if (this.destroyed) return;
    this.cancelDrag();
    this.mascot.respawn();
    this.resetFootTrace();
    this.redraw();
  }

  update(options: PagegeistOptions): void {
    if (this.destroyed) return;
    const prev = this.options;
    this.options = resolveOptions(options, prev);
    this.mascot.options = this.options;
    this.setCallbacks(options);

    if (
      JSON.stringify(prev.platforms) !== JSON.stringify(this.options.platforms) ||
      JSON.stringify(prev.safeArea) !== JSON.stringify(this.options.safeArea)
    ) {
      this.world.configure(this.options.platforms, this.options.safeArea);
    }
    if (prev.markElements && !this.options.markElements) this.mascot.clearMarks();
    if (!this.options.debug) this.resetFootTrace();
    if (options.paused !== undefined) this.setPaused(options.paused);
    this.applyStyles();
    this.syncPauseControl();
    this.syncLiveRegion();
    this.applyMotion();
    this.redraw();
  }

  on<K extends PagegeistEventName>(type: K, listener: (event: PagegeistEventMap[K]) => void): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener as Listener);
    return () => {
      set.delete(listener as Listener);
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.endDrag();
    this.dprWatch?.();
    this.world.stop();
    for (const fn of this.cleanup) fn();
    this.cleanup = [];
    this.mascot.clearMarks();
    this.listeners.clear();
    this.root.remove();
  }

  // ------------------------------------------------------------ Options & state

  private setCallbacks(options: PagegeistOptions): void {
    for (const key of Object.values(CALLBACK_KEYS)) {
      if (key in options) (this.callbacks as Record<string, unknown>)[key] = options[key];
    }
  }

  private readonly emit = <K extends PagegeistEventName>(type: K, event: PagegeistEventMap[K]): void => {
    const callback = this.callbacks[CALLBACK_KEYS[type]] as ((e: PagegeistEventMap[K]) => void) | undefined;
    const listeners = this.listeners.get(type);
    for (const fn of [callback, ...(listeners ?? [])]) {
      if (!fn) continue;
      try {
        (fn as (e: PagegeistEventMap[K]) => void)(event);
      } catch (error) {
        console.error(`pagegeist: error in "${type}" listener`, error);
      }
    }
    if (type === 'say' && this.liveRegion) this.liveRegion.textContent = (event as PagegeistEventMap['say']).text;
  };

  private setPaused(paused: boolean): void {
    if (this._paused === paused || this.destroyed) return;
    this._paused = paused;
    if (paused) this.cancelDrag();
    this.accumulator = 0;
    this.applyStyles();
    this.syncPauseControl();
    this.redraw();
    this.emit(paused ? 'pause' : 'resume', {});
  }

  /** Hitbox cursor while she is not being dragged. */
  private get idleCursor(): string {
    return this.options.behaviors.drag ? 'grab' : 'pointer';
  }

  /** Forces a render of the next frame and wakes the loop if it sleeps (paused). */
  private redraw(): void {
    this.renderedRevision = -1;
    this.syncLoop();
  }

  private spawnX(spawn: NonNullable<PagegeistOptions['spawn']>): number | null {
    const f = typeof spawn === 'number' ? spawn : SPAWN_FRACTIONS[spawn];
    if (f === undefined) return null;
    const v = this.world.viewport();
    return v.left + (v.right - v.left) * Math.min(0.95, Math.max(0.05, f));
  }

  private watchReducedMotion(): void {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (query) {
      this.reducedMotionQuery = query;
      const onChange = () => this.applyMotion();
      query.addEventListener?.('change', onChange);
      this.cleanup.push(() => query.removeEventListener?.('change', onChange));
    }
    this.applyMotion();
  }

  private applyMotion(): void {
    const reduce = this.reducedMotionQuery?.matches ?? false;
    const mode = reduce ? this.options.reducedMotion : 'ignore';
    const levels: Record<typeof mode, MotionLevel> = {
      static: 'static',
      calm: 'calm',
      hidden: 'static',
      ignore: 'full',
    };
    const level = levels[mode];
    const hidden = mode === 'hidden';
    const becameStatic = level === 'static' && this.mascot.motion !== 'static';
    this.mascot.motion = level;
    if (hidden !== this.hidden) {
      this.hidden = hidden;
      this.root.style.display = hidden ? 'none' : '';
      this.syncLoop();
    }
    // Switching to static mid-flight: settle down on an element right away.
    if (becameStatic && this.mascot.state !== MascotState.IDLE && this.mascot.state !== MascotState.SIT_ON_ELEMENT) {
      this.mascot.respawn(this.mascot.body.pos.x);
    }
  }

  private applyStyles(): void {
    const { outfit, shoes, fishnets } = this.options;
    this.renderer.look = { outfit, shoes, fishnets };
    const z = this.options.zIndex;
    this.canvas.style.zIndex = String(z);
    const interactive = !this._paused && (this.options.behaviors.drag || this.options.behaviors.poke);
    Object.assign(this.hitbox.style, {
      zIndex: String(z + 1),
      pointerEvents: interactive ? 'auto' : 'none',
      cursor: this.idleCursor,
    } satisfies Partial<CSSStyleDeclaration>);
  }

  private syncPauseControl(): void {
    const config = this.options.pauseControl;
    if (!config) {
      this.pauseButton?.remove();
      this.pauseButton = null;
      return;
    }
    if (!this.pauseButton) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pagegeist-pause';
      button.addEventListener('click', () => this.setPaused(!this._paused));
      Object.assign(button.style, {
        position: 'fixed',
        padding: '6px 10px',
        border: '1px solid rgba(190, 150, 255, 0.55)',
        borderRadius: '999px',
        background: 'rgba(18, 13, 24, 0.88)',
        color: '#f2ecff',
        font: '600 12px system-ui, sans-serif',
        cursor: 'pointer',
      } satisfies Partial<CSSStyleDeclaration>);
      this.root.append(button);
      this.pauseButton = button;
    }
    const button = this.pauseButton;
    const [vertical, horizontal] = config.position.split('-') as ['top' | 'bottom', 'left' | 'right'];
    Object.assign(button.style, {
      top: vertical === 'top' ? '12px' : '',
      bottom: vertical === 'bottom' ? '12px' : '',
      left: horizontal === 'left' ? '12px' : '',
      right: horizontal === 'right' ? '12px' : '',
      zIndex: String(this.options.zIndex + 2),
    } satisfies Partial<CSSStyleDeclaration>);
    // The label names the action (no aria-pressed: that would announce the state twice);
    // the glyph is decorative.
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = this._paused ? '▶ ' : '❚❚ ';
    button.replaceChildren(icon, this._paused ? config.resumeLabel : config.pauseLabel);
  }

  private syncLiveRegion(): void {
    if (!this.options.announce) {
      this.liveRegion?.remove();
      this.liveRegion = null;
      return;
    }
    if (this.liveRegion) return;
    const region = document.createElement('div');
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    Object.assign(region.style, {
      position: 'fixed',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
      clipPath: 'inset(50%)',
      whiteSpace: 'nowrap',
    } satisfies Partial<CSSStyleDeclaration>);
    this.root.append(region);
    this.liveRegion = region;
  }

  // ------------------------------------------------------------ Events

  private listen<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    fn: (e: WindowEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ): void;
  private listen<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    fn: (e: DocumentEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ): void;
  private listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    fn: (e: HTMLElementEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ): void;
  private listen(target: EventTarget, type: string, fn: (e: never) => void, opts?: AddEventListenerOptions): void {
    const handler = fn as unknown as EventListener;
    target.addEventListener(type, handler, opts);
    this.cleanup.push(() => target.removeEventListener(type, handler, opts));
  }

  private bindEvents(): void {
    this.listen(window, 'resize', () => this.resize(), { passive: true });
    // While paused the loop sleeps; scrolling moves her on screen, so wake it up.
    this.listen(window, 'scroll', () => this.syncLoop(), { passive: true });
    this.listen(document, 'visibilitychange', () => this.syncLoop());
    this.listen(window, 'pointermove', (e) => (this.cursorClient = { x: e.clientX, y: e.clientY }), {
      passive: true,
    });
    this.listen(document.documentElement, 'pointerleave', () => (this.cursorClient = null));

    const hb = this.hitbox;
    this.listen(hb, 'pointerdown', (e) => {
      if (e.button !== 0) return;
      this.beginDrag(e);
    });
    // Near-miss grabs: a moving mascot is hard to hit, and a miss would start a text
    // selection. Clicks slightly outside the hitbox still count while she is moving.
    this.listen(
      document,
      'pointerdown',
      (e) => {
        // Not for touch: a tap next to her must stay a tap (or a scroll) on the page.
        if (e.button !== 0 || e.pointerType === 'touch' || e.target === hb) return;
        if (this._paused || !this.options.behaviors.drag) return;
        if (!MOVING_STATES.has(this.mascot.state) || !this.nearHitbox(e.clientX, e.clientY)) return;
        this.beginDrag(e);
      },
      { capture: true },
    );
    this.listen(hb, 'pointermove', (e) => {
      const d = this.drag;
      if (!d || d.pointerId !== e.pointerId) return;
      if (!d.active && Math.hypot(e.clientX - d.start.x, e.clientY - d.start.y) > 5) {
        if (!this.options.behaviors.drag) return;
        d.active = true;
        hb.style.cursor = 'grabbing';
        this.mascot.grab();
      }
      if (!d.active) return;
      const p = this.toDoc(e.clientX, e.clientY);
      this.mascot.dragTo(p);
      d.samples.push({ x: p.x, y: p.y, t: performance.now() });
      if (d.samples.length > 6) d.samples.shift();
    });
    const end = (e: PointerEvent, cancelled: boolean) => {
      const d = this.drag;
      if (!d || d.pointerId !== e.pointerId) return;
      if (cancelled) return this.cancelDrag();
      this.endDrag();
      if (d.active) this.mascot.release(throwVelocity(d.samples));
      else if (this.options.behaviors.poke) this.mascot.poke();
    };
    this.listen(hb, 'pointerup', (e) => end(e, false));
    this.listen(hb, 'pointercancel', (e) => end(e, true));
    this.listen(hb, 'lostpointercapture', (e) => end(e, true));
    this.listen(document, 'selectstart', (e) => {
      if (this.drag) e.preventDefault();
    });
  }

  private beginDrag(e: PointerEvent): void {
    e.preventDefault();
    const hb = this.hitbox;
    try {
      hb.setPointerCapture(e.pointerId);
    } catch {
      // Pointer already released (e.g. synthetic events) – the drag still works via move events.
    }
    window.getSelection?.()?.removeAllRanges();
    const rootStyle = document.documentElement.style;
    this.restoreUserSelect ??= rootStyle.userSelect;
    rootStyle.userSelect = 'none';
    this.drag = { pointerId: e.pointerId, start: { x: e.clientX, y: e.clientY }, active: false, samples: [] };
  }

  private endDrag(): void {
    const d = this.drag;
    this.drag = null;
    this.hitbox.style.cursor = this.idleCursor;
    if (d && this.hitbox.hasPointerCapture?.(d.pointerId)) this.hitbox.releasePointerCapture(d.pointerId);
    if (this.restoreUserSelect !== null) {
      document.documentElement.style.userSelect = this.restoreUserSelect;
      this.restoreUserSelect = null;
    }
  }

  /** Ends the drag without a throw: if she was held, she drops from where she is. */
  private cancelDrag(): void {
    const held = this.drag?.active;
    this.endDrag();
    if (held) this.mascot.release({ x: 0, y: 0 });
  }

  private nearHitbox(x: number, y: number): boolean {
    const r = this.hitboxRect;
    const pad = 22 * (this.renderer.metrics.height / DEFAULT_SIZE);
    return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
  }

  private toDoc(clientX: number, clientY: number): Vec2 {
    return { x: clientX + window.scrollX, y: clientY + window.scrollY };
  }

  private resize(): void {
    const ratio = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.dpr = Math.min(ratio, 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    // Pixel sizes (not 100vw/vh) so the bitmap always matches the box (mobile URL bars).
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    // Zooming or moving to another screen changes the ratio without a resize event.
    this.dprWatch?.();
    const query = window.matchMedia?.(`(resolution: ${ratio}dppx)`);
    const onChange = () => this.resize();
    query?.addEventListener?.('change', onChange);
    this.dprWatch = () => query?.removeEventListener?.('change', onChange);
    this.world.markDirty();
    this.redraw();
  }

  // ------------------------------------------------------------ Loop

  private syncLoop(): void {
    const shouldRun = !this.destroyed && !this.hidden && !document.hidden;
    if (shouldRun && !this.raf) {
      this.lastFrame = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    } else if (!shouldRun && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private readonly frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min((now - this.lastFrame) / 1000, 0.1);
    this.lastFrame = now;

    // 1) Read the DOM (layout) – before any style writes, to avoid layout thrashing
    this.world.update(now);
    this.mascot.cursor = this.cursorClient ? this.toDoc(this.cursorClient.x, this.cursorClient.y) : null;
    // Background brightness drives the 'auto' outline and the shadows (2×/s, read phase).
    if (now >= this.nextBackgroundCheck) {
      this.nextBackgroundCheck = now + 500;
      this.darkBackground = this.detectDarkBackground();
    }

    // 2) Simulation with a fixed time step
    if (!this._paused) {
      this.accumulator += dt * this.options.timeScale;
      let steps = 0;
      while (this.accumulator >= FIXED_STEP && steps++ < 12) {
        this.mascot.update(FIXED_STEP);
        this.accumulator -= FIXED_STEP;
      }
      if (steps >= 12) this.accumulator = 0;
      this.checkOffscreen(dt);
    } else if (this.renderedRevision === this.world.revision) {
      // Paused and nothing moved: keep the last frame and let the loop sleep until redraw().
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      return;
    }

    // 3) Render + hitbox (writes only)
    this.renderedRevision = this.world.revision;
    this.render();
  };

  private checkOffscreen(dt: number): void {
    if (this.mascot.state === MascotState.GRABBED) return;
    const y = this.mascot.body.pos.y - window.scrollY;
    const off = y < -40 || y - this.renderer.metrics.height > window.innerHeight + 40;
    this.offscreenFor = off ? this.offscreenFor + dt : 0;
    if (this.offscreenFor > this.options.respawnAfter) {
      this.offscreenFor = 0;
      this.mascot.respawn();
      this.resetFootTrace();
    }
  }

  private outlineActive(): boolean {
    const mode = this.options.outline;
    return mode === 'always' || (mode === 'auto' && this.darkBackground);
  }

  private render(): void {
    const m = this.mascot;
    const rs = m.renderState();
    // Reduced motion (static): the renderer holds its ambient loops at rest.
    if (m.motion === 'static') rs.calm = true;
    const sx = window.scrollX;
    const sy = window.scrollY;
    const x = m.body.pos.x - sx;
    const y = m.body.pos.y - sy;

    const ctx = this.ctx;
    if (!ctx) {
      this.placeHitbox(rs, x, y); // no canvas support (e.g. test environments)
      return;
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const k = this.renderer.metrics.height / 120;

    // Shadows only on dark backgrounds: on light pages the dark blobs look unnatural.
    // Ground shadow on the nearest surface below the feet
    const below = this.darkBackground ? this.world.platformBelow(m.body.pos.x, m.body.pos.y - 1) : null;
    if (below) {
      const dist = below.top - m.body.pos.y;
      this.queue.push(Z.shadow, (c) => drawGroundShadow(c, x, below.top - sy, dist, k));
    }
    if (this.darkBackground && (rs.state === MascotState.HANG_ON_EDGE || rs.state === MascotState.CLIMB)) {
      this.queue.push(Z.wallShadow, (c) => drawWallShadow(c, x, y, this.renderer.metrics.height));
    }

    this.renderer.draw(this.queue, x, y, rs, Z.mascot);
    const b = this.placeHitbox(rs, x, y); // after draw(): bounds of the pose just drawn

    if (m.bubble) {
      const bubble = m.bubble;
      const age = m.time - bubble.born;
      const alpha = Math.min(1, age * 6, (bubble.until - m.time) * 4);
      this.queue.push(Z.bubble, (c) => drawSpeechBubble(c, x + b.x + b.width / 2, y + b.y, bubble.text, alpha));
    }
    if (this.options.debug) this.queue.push(Z.debug, (c) => this.drawDebug(c, sx, sy, x, y, b));

    this.queue.sort();
    this.queue.drain(ctx, Z.mascot);
    if (this.outlineActive()) this.drawOutlined(ctx, x + b.x, y + b.y, b.width, b.height);
    this.queue.drain(ctx);
  }

  /**
   * Draws the character layer into an offscreen canvas and composites it with a light
   * rim (8 offset copies of a tinted silhouette) – keeps the dark outfit visible on dark pages.
   */
  private drawOutlined(ctx: CanvasRenderingContext2D, bx: number, by: number, bw: number, bh: number): void {
    const margin = 24 * (this.renderer.metrics.height / DEFAULT_SIZE);
    const dpr = this.dpr;
    const left = Math.floor((bx - margin) * dpr);
    const top = Math.floor((by - margin) * dpr);
    const w = Math.ceil((bw + margin * 2) * dpr);
    const h = Math.ceil((bh + margin * 2) * dpr);
    this.layer ??= { main: document.createElement('canvas'), tint: document.createElement('canvas') };
    const { main, tint } = this.layer;
    for (const c of [main, tint]) {
      if (c.width < w || c.height < h) {
        c.width = Math.max(c.width, w);
        c.height = Math.max(c.height, h);
      }
    }
    const lc = main.getContext('2d');
    const tc = tint.getContext('2d');
    if (!lc || !tc) {
      this.queue.drain(ctx, Z.mascot + 1);
      return;
    }

    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.clearRect(0, 0, w, h);
    lc.setTransform(dpr, 0, 0, dpr, -left, -top);
    this.queue.drain(lc, Z.mascot + 1);

    tc.setTransform(1, 0, 0, 1, 0, 0);
    tc.globalCompositeOperation = 'copy';
    tc.drawImage(main, 0, 0, w, h, 0, 0, w, h);
    tc.globalCompositeOperation = 'source-in';
    tc.fillStyle = this.options.outlineColor;
    tc.fillRect(0, 0, w, h);
    tc.globalCompositeOperation = 'source-over';

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const o = 1.5 * dpr;
    for (const [dx, dy] of OUTLINE_OFFSETS) ctx.drawImage(tint, 0, 0, w, h, left + dx * o, top + dy * o, w, h);
    ctx.drawImage(main, 0, 0, w, h, left, top, w, h);
    ctx.restore();
  }

  /** Luminance of the first opaque background behind her torso (2×/s, read phase). */
  private detectDarkBackground(): boolean {
    const m = this.mascot;
    const x = m.body.pos.x - window.scrollX;
    const y = m.body.pos.y - window.scrollY - this.renderer.metrics.height * 0.5;
    if (typeof document.elementsFromPoint !== 'function') return false;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const hit = document
      .elementsFromPoint(Math.min(vw - 1, Math.max(0, x)), Math.min(vh - 1, Math.max(0, y)))
      .find((el) => !this.root.contains(el));
    for (let el: Element | null = hit ?? document.body; el; el = el.parentElement) {
      const rgba = this.toRgba(getComputedStyle(el).backgroundColor);
      if (rgba && rgba[3] > 0.5) return luminance(rgba) < 0.2;
    }
    const scheme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    return scheme && getComputedStyle(document.documentElement).colorScheme.includes('dark');
  }

  /** Normalizes any CSS color (rgb, oklch, color(), …) via a 1×1 canvas. */
  private toRgba(color: string): [number, number, number, number] | null {
    if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return null;
    if (!this.probe) {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      this.probe = c.getContext('2d', { willReadFrequently: true });
      if (!this.probe) return null;
    }
    const p = this.probe;
    p.clearRect(0, 0, 1, 1);
    p.fillStyle = '#000';
    p.fillStyle = color;
    p.fillRect(0, 0, 1, 1);
    const d = p.getImageData(0, 0, 1, 1).data;
    return [d[0]!, d[1]!, d[2]!, d[3]! / 255];
  }

  private placeHitbox(rs: RenderState, x: number, y: number): Rect {
    const b = this.renderer.bounds(rs);
    // A little padding makes her easier to grab.
    const pad = 6 * (this.renderer.metrics.height / DEFAULT_SIZE);
    const rx = x + b.x - pad;
    const ry = y + b.y - pad;
    const rw = Math.round(b.width + pad * 2);
    const rh = Math.round(b.height + pad * 2);
    if (rw !== this.hitboxRect.w || rh !== this.hitboxRect.h) {
      this.hitbox.style.width = `${rw}px`;
      this.hitbox.style.height = `${rh}px`;
    }
    this.hitboxRect = { x: rx, y: ry, w: rw, h: rh };
    this.hitbox.style.transform = `translate(${rx.toFixed(1)}px, ${ry.toFixed(1)}px)`;
    return b;
  }

  private drawDebug(c: CanvasRenderingContext2D, sx: number, sy: number, x: number, y: number, b: Rect): void {
    const colors: Record<string, string> = {
      heading: '#ff6bcb',
      'text-line': '#7ad7ff',
      button: '#ffd166',
      card: '#9cff8a',
      generic: '#ffffff',
      floor: '#ff5c5c',
    };
    c.lineWidth = 2;
    for (const p of this.world.all) {
      c.strokeStyle = colors[p.kind] ?? '#fff';
      c.globalAlpha = p.id === this.mascot.groundId ? 1 : 0.55;
      c.beginPath();
      c.moveTo(p.left - sx, p.top - sy);
      c.lineTo(p.right - sx, p.top - sy);
      c.stroke();
    }
    const safe = this.world.safeViewport();
    c.globalAlpha = 0.5;
    c.strokeStyle = '#ff5c5c';
    c.setLineDash([6, 4]);
    for (const edge of [safe.top - sy, safe.bottom - sy]) {
      c.beginPath();
      c.moveTo(0, edge);
      c.lineTo(window.innerWidth, edge);
      c.stroke();
    }
    c.globalAlpha = 1;
    c.strokeStyle = 'rgba(255,255,255,0.6)';
    c.lineWidth = 1;
    c.setLineDash([3, 3]);
    c.strokeRect(x + b.x, y + b.y, b.width, b.height);
    c.setLineDash([]);

    const m = this.mascot;
    const plan = m.plan;
    if (plan && m.state === MascotState.WALK) {
      c.fillStyle = '#ffd166';
      c.beginPath();
      c.arc(plan.walkToX - sx, y, 3, 0, Math.PI * 2);
      c.fill();
    }
    if (m.jump && m.state === MascotState.JUMP) {
      c.strokeStyle = '#ff6bcb';
      c.beginPath();
      c.arc(m.jump.target.x - sx, m.jump.target.y - sy, 5, 0, Math.PI * 2);
      c.stroke();
    }
    if (m.hang) {
      c.fillStyle = '#9cff8a';
      c.beginPath();
      c.arc(m.hang.anchor.x - sx, m.hang.anchor.y - sy, 3, 0, Math.PI * 2);
      c.fill();
    }
    this.drawFootTrace(c, sx, sy);
    c.font = '11px ui-monospace, monospace';
    c.fillStyle = '#fff';
    const labelX = x + b.x;
    const labelY = y + b.y + b.height + 14;
    c.fillText(`${m.state}${plan ? ` · ${plan.label}` : ''}`, labelX, labelY);
    if (this.renderer.debugFeet) {
      c.fillText('feet:', labelX, labelY + 13);
      const w = c.measureText('feet: ').width;
      c.fillStyle = FOOT_COLORS.near;
      c.fillText('near', labelX + w, labelY + 13);
      const w2 = w + c.measureText('near ').width;
      c.fillStyle = '#fff';
      c.fillText('/', labelX + w2, labelY + 13);
      c.fillStyle = FOOT_COLORS.far;
      c.fillText('far', labelX + w2 + c.measureText('/ ').width, labelY + 13);
    }
  }

  // ------------------------------------------------------------ Foot trace (debug)

  private resetFootTrace(): void {
    this.footTrace = [];
    this.footTraceHead = 0;
    this.lastFeetPos = null;
  }

  /**
   * Samples the ankle positions of the pose just drawn (document space) and draws the
   * recent ones as fading dots. A planted foot piles its dots on one spot; spread-out dots
   * of a planted foot mean it slides. Runs inside the debug layer, i.e. after the mascot
   * was drawn, so `debugFeet()` reflects the current frame.
   */
  private drawFootTrace(c: CanvasRenderingContext2D, sx: number, sy: number): void {
    const feet = this.renderer.debugFeet?.();
    const m = this.mascot;
    const pos = m.body.pos;
    const last = this.lastFeetPos;
    if (last && Math.hypot(pos.x - last.x, pos.y - last.y) > FOOT_TRACE_TELEPORT) this.resetFootTrace();
    this.lastFeetPos = { x: pos.x, y: pos.y };

    const trace = this.footTrace;
    const newest = trace.length ? trace[(this.footTraceHead - 1 + trace.length) % trace.length] : undefined;
    if (feet && (!newest || newest.t !== m.time)) {
      const sample: FootSample = {
        t: m.time,
        near: { x: pos.x + feet.near.x, y: pos.y + feet.near.y },
        far: { x: pos.x + feet.far.x, y: pos.y + feet.far.y },
      };
      if (trace.length < FOOT_TRACE_SAMPLES) trace.push(sample);
      else trace[this.footTraceHead] = sample;
      this.footTraceHead = (this.footTraceHead + 1) % FOOT_TRACE_SAMPLES;
    }
    if (!trace.length) return;

    for (const key of ['far', 'near'] as const) {
      c.fillStyle = FOOT_COLORS[key];
      for (const s of trace) {
        const age = m.time - s.t;
        if (age < 0 || age > FOOT_TRACE_SECONDS) continue;
        c.globalAlpha = 0.85 * (1 - age / FOOT_TRACE_SECONDS);
        const p = s[key];
        c.fillRect(p.x - sx - 1.25, p.y - sy - 1.25, 2.5, 2.5);
      }
    }
    c.globalAlpha = 1;
  }
}

const OUTLINE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-0.7, -0.7],
  [0.7, -0.7],
  [-0.7, 0.7],
  [0.7, 0.7],
];

function luminance([r, g, b]: readonly number[]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
}

function throwVelocity(samples: Array<{ x: number; y: number; t: number }>): Vec2 {
  if (samples.length < 2) return { x: 0, y: 0 };
  const a = samples[0]!;
  const b = samples[samples.length - 1]!;
  const dt = Math.max(16, b.t - a.t) / 1000;
  return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
}
