import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPagegeist, type PagegeistInstance } from '../src';
import { Mascot } from '../src/core/Mascot';
import { GothRenderer } from '../src/core/render/GothRenderer';
import type { RenderState } from '../src/core/render/types';
import { MascotState } from '../src/core/types';
import { fakeCanvas, fakeLoop, fakeMedia, pointer } from './engine-harness';

let instance: PagegeistInstance | null = null;
afterEach(() => {
  instance?.destroy();
  instance = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

const REDUCE = '(prefers-reduced-motion: reduce)';
const canvas = () => document.querySelector<HTMLCanvasElement>('.pagegeist canvas')!;
const hitbox = () => document.querySelector<HTMLElement>('.pagegeist-hitbox')!;

/** Tracks add/removeEventListener on window and document; `active()` lists what is still bound. */
function trackListeners() {
  const active = new Map<string, number>();
  for (const [name, target] of [
    ['window', window],
    ['document', document],
  ] as const) {
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    const key = (type: string, fn: unknown, opts: unknown) => {
      const capture = typeof opts === 'boolean' ? opts : !!(opts as AddEventListenerOptions | undefined)?.capture;
      return `${name}:${type}:${capture}:${fnId(fn)}`;
    };
    vi.spyOn(target, 'addEventListener').mockImplementation((type, fn, opts) => {
      const k = key(type, fn, opts);
      active.set(k, (active.get(k) ?? 0) + 1);
      add(type, fn, opts);
    });
    vi.spyOn(target, 'removeEventListener').mockImplementation((type, fn, opts) => {
      const k = key(type, fn, opts);
      const n = active.get(k) ?? 0;
      if (n > 1) active.set(k, n - 1);
      else active.delete(k);
      remove(type, fn, opts);
    });
  }
  return { active: () => [...active.keys()] };
}
const ids = new WeakMap<object, number>();
let nextId = 0;
const fnId = (fn: unknown) => {
  if (!fn || (typeof fn !== 'object' && typeof fn !== 'function')) return 0;
  if (!ids.has(fn as object)) ids.set(fn as object, ++nextId);
  return ids.get(fn as object);
};

describe('construction', () => {
  it('fails with a clear error before touching the DOM when observers are missing', () => {
    const listeners = trackListeners();
    vi.stubGlobal('ResizeObserver', undefined);
    expect(() => createPagegeist()).toThrow(/^pagegeist: .*ResizeObserver/);
    expect(document.querySelector('.pagegeist')).toBeNull();
    expect(listeners.active()).toEqual([]);
  });

  it('rolls back DOM nodes, listeners and observers when setup fails midway', () => {
    const listeners = trackListeners();
    const disconnect = vi.spyOn(ResizeObserver.prototype, 'disconnect');
    vi.stubGlobal(
      'MutationObserver',
      class {
        constructor() {
          throw new Error('nope');
        }
      },
    );
    expect(() => createPagegeist()).toThrow('nope');
    expect(document.querySelector('.pagegeist')).toBeNull();
    expect(listeners.active()).toEqual([]);
    expect(disconnect).toHaveBeenCalled();
  });
});

describe('destroy()', () => {
  it('removes every listener, observer, frame and node', () => {
    const loop = fakeLoop();
    const media = fakeMedia();
    const listeners = trackListeners();
    const ro = vi.spyOn(ResizeObserver.prototype, 'disconnect');
    const mo = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const clear = vi.spyOn(window, 'clearInterval');
    instance = createPagegeist({ pauseControl: true, announce: true });
    loop.run(3);
    expect(listeners.active().length).toBeGreaterThan(0);
    expect(media.watched().length).toBeGreaterThan(0);
    instance.destroy();
    expect(listeners.active()).toEqual([]);
    expect(media.watched()).toEqual([]);
    expect(ro).toHaveBeenCalled();
    expect(mo).toHaveBeenCalled();
    expect(clear).toHaveBeenCalled();
    expect(loop.pending).toBe(0);
    expect(document.querySelector('.pagegeist')).toBeNull();
    const before = loop.requests;
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('scroll'));
    instance.say('still there?');
    loop.run(3);
    expect(loop.requests).toBe(before);
  });
});

describe('canvas sizing', () => {
  it('sizes the canvas box in pixels matching the bitmap, with DPR capped at 2', () => {
    fakeLoop();
    fakeMedia();
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(3);
    instance = createPagegeist();
    const c = canvas();
    expect(c.style.width).toBe(`${window.innerWidth}px`);
    expect(c.style.height).toBe(`${window.innerHeight}px`);
    expect(c.width).toBe(window.innerWidth * 2);
    expect(c.height).toBe(window.innerHeight * 2);
  });

  it('follows devicePixelRatio changes without a resize event and re-arms the watcher', () => {
    fakeLoop();
    const media = fakeMedia();
    const dpr = vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(1);
    instance = createPagegeist();
    expect(canvas().width).toBe(window.innerWidth);
    expect(media.watched()).toContain('(resolution: 1dppx)');

    dpr.mockReturnValue(1.5);
    media.set('(resolution: 1dppx)', false);
    expect(canvas().width).toBe(Math.round(window.innerWidth * 1.5));
    expect(media.watched()).not.toContain('(resolution: 1dppx)');
    expect(media.watched()).toContain('(resolution: 1.5dppx)');

    dpr.mockReturnValue(2);
    media.set('(resolution: 1.5dppx)', false);
    expect(canvas().width).toBe(window.innerWidth * 2);
    instance.destroy();
    expect(media.watched()).toEqual([]);
  });
});

describe('animation loop', () => {
  it('requests one frame per frame while she is active', () => {
    const loop = fakeLoop();
    instance = createPagegeist();
    const before = loop.requests;
    loop.run(30);
    expect(loop.requests - before).toBe(30);
    expect(loop.pending).toBe(1);
  });

  it('sleeps while paused and wakes for resume, say, update, respawn and scroll', () => {
    const loop = fakeLoop();
    instance = createPagegeist();
    loop.run(3);
    instance.pause();
    loop.run(5);
    expect(loop.pending).toBe(0);
    const idle = loop.requests;
    loop.run(20);
    expect(loop.requests).toBe(idle);

    const wakers: Array<[string, () => void]> = [
      ['say', () => instance?.say('Hi')],
      ['update', () => instance?.update({ outline: 'always' })],
      ['respawn', () => instance?.respawn()],
      ['scroll', () => window.dispatchEvent(new Event('scroll'))],
      ['resize', () => window.dispatchEvent(new Event('resize'))],
    ];
    for (const [name, wake] of wakers) {
      wake();
      expect(loop.pending, name).toBe(1);
      loop.run(5);
      expect(loop.pending, name).toBe(0);
    }

    instance.resume();
    expect(loop.pending).toBe(1);
    const resumed = loop.requests;
    loop.run(10);
    expect(loop.requests - resumed).toBe(10);
  });

  it('keeps her in place on screen when the page scrolls while paused', () => {
    const loop = fakeLoop();
    const scrollY = vi.spyOn(window, 'scrollY', 'get').mockReturnValue(0);
    instance = createPagegeist({ spawn: 'center' });
    loop.run(3);
    instance.pause();
    loop.run(3);
    const ty = () => Number(/translate\([^,]+,\s*(-?[\d.]+)px\)/.exec(hitbox().style.transform)?.[1]);
    const before = ty();
    scrollY.mockReturnValue(100);
    window.dispatchEvent(new Event('scroll'));
    loop.run(3);
    expect(ty()).toBeCloseTo(before - 100, 0);
    expect(loop.pending).toBe(0);
  });

  it('stops while the tab is hidden and restarts without a time burst', () => {
    const loop = fakeLoop();
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    instance = createPagegeist();
    loop.run(3);
    hidden.mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(loop.pending).toBe(0);

    loop.advance(5000);
    const step = vi.spyOn(Mascot.prototype, 'update');
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(loop.pending).toBe(1);
    loop.run(1, 1000 / 60);
    expect(step.mock.calls.length).toBeLessThanOrEqual(2); // ~16 ms, not 100 ms worth of steps
  });

  it('keeps running when a phrase resolver throws', () => {
    const loop = fakeLoop();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    instance = createPagegeist({
      phrases: () => {
        throw new Error('resolver');
      },
    });
    loop.run(2);
    hitbox().dispatchEvent(pointer('pointerdown'));
    expect(() => hitbox().dispatchEvent(pointer('pointerup'))).not.toThrow();
    expect(error).toHaveBeenCalled();
    loop.run(5);
    expect(loop.pending).toBe(1);
  });
});

describe('reduced motion', () => {
  it('reacts to a runtime prefers-reduced-motion change and flags the renderer as calm', () => {
    const loop = fakeLoop();
    fakeCanvas();
    const media = fakeMedia({ [REDUCE]: false });
    const draw = vi.spyOn(GothRenderer.prototype, 'draw');
    const lastCalm = () => (draw.mock.lastCall?.[3] as RenderState | undefined)?.calm;
    instance = createPagegeist({ reducedMotion: 'static' });
    loop.run(3);
    expect(lastCalm()).toBeFalsy();

    media.set(REDUCE, true);
    loop.run(3);
    expect(instance.state).toBe(MascotState.IDLE); // settled right away
    expect(lastCalm()).toBe(true);

    media.set(REDUCE, false);
    loop.run(3);
    expect(lastCalm()).toBeFalsy();
  });

  it('does not flag calm in the calm mode (she still moves)', () => {
    const loop = fakeLoop();
    fakeCanvas();
    fakeMedia({ [REDUCE]: true });
    const draw = vi.spyOn(GothRenderer.prototype, 'draw');
    instance = createPagegeist({ reducedMotion: 'calm' });
    loop.run(3);
    expect(draw.mock.lastCall![3].calm).toBeFalsy();
  });

  it('hides her and stops the loop in hidden mode', () => {
    const loop = fakeLoop();
    const media = fakeMedia({ [REDUCE]: false });
    instance = createPagegeist({ reducedMotion: 'hidden' });
    loop.run(2);
    media.set(REDUCE, true);
    expect(document.querySelector<HTMLElement>('.pagegeist')!.style.display).toBe('none');
    expect(loop.pending).toBe(0);
    media.set(REDUCE, false);
    expect(document.querySelector<HTMLElement>('.pagegeist')!.style.display).toBe('');
    expect(loop.pending).toBe(1);
  });
});

describe('hitbox', () => {
  it('is measured from the pose drawn in the same frame', () => {
    const loop = fakeLoop();
    fakeCanvas();
    const calls: string[] = [];
    const draw = GothRenderer.prototype.draw;
    const bounds = GothRenderer.prototype.bounds;
    vi.spyOn(GothRenderer.prototype, 'draw').mockImplementation(function (this: GothRenderer, ...a) {
      calls.push('draw');
      return draw.apply(this, a);
    });
    vi.spyOn(GothRenderer.prototype, 'bounds').mockImplementation(function (this: GothRenderer, ...a) {
      calls.push('bounds');
      return bounds.apply(this, a);
    });
    instance = createPagegeist();
    loop.run(1);
    calls.length = 0;
    loop.run(1);
    expect(calls).toEqual(['draw', 'bounds']);
  });
});
