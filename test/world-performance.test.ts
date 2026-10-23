import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PLATFORMS } from '../src/core/options';
import { DomCollisionWorld } from '../src/core/World';

const VW = 1280;
const VH = 800;
let scrollY = 0;

const rect = (left: number, top: number, width: number, height: number): DOMRect =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;

/** Cards at the given document y positions (normal flow: viewport rect = page rect - scrollY). */
function cards(ys: number[]): HTMLElement[] {
  return ys.map((y) => {
    const el = document.createElement('div');
    el.className = 'card';
    vi.spyOn(el, 'getBoundingClientRect').mockImplementation(() => rect(100, y - scrollY, 300, 40));
    document.body.append(el);
    return el;
  });
}

function scrollTo(y: number) {
  scrollY = y;
  window.dispatchEvent(new Event('scroll'));
}

let world: DomCollisionWorld;
let poll: () => void;

function start() {
  const overlay = document.createElement('div');
  document.body.append(overlay);
  const setInterval = vi.spyOn(window, 'setInterval');
  world = new DomCollisionWorld({ ...DEFAULT_PLATFORMS, selectors: ['.card'] }, { top: 0, bottom: 0 });
  world.start(overlay);
  poll = setInterval.mock.calls[0]![0] as () => void;
  world.update();
}

const ids = () => world.all.filter((p) => p.kind !== 'floor').map((p) => p.top);

beforeEach(() => {
  scrollY = 0;
  vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollY);
  vi.spyOn(window, 'scrollX', 'get').mockReturnValue(0);
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(VH);
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(VW);
});

afterEach(() => {
  world?.stop();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('DomCollisionWorld performance', () => {
  it('does not rescan the document while scrolling within the scanned band', () => {
    const els = cards(Array.from({ length: 50 }, (_, i) => i * 100));
    const nav = document.createElement('nav');
    nav.className = 'card';
    nav.style.position = 'fixed';
    const navRect = vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue(rect(0, 0, VW, 50));
    document.body.append(nav);
    start();

    const qsa = vi.spyOn(document, 'querySelectorAll');
    const flowRects = els.map((el) => vi.mocked(el.getBoundingClientRect));
    for (const r of flowRects) r.mockClear();
    navRect.mockClear();

    for (let i = 1; i <= 20; i++) {
      scrollTo(i * 30);
      expect(world.update()).toBe(true);
    }
    expect(qsa).not.toHaveBeenCalled();
    expect(flowRects.reduce((n, r) => n + r.mock.calls.length, 0)).toBe(0);
    expect(navRect).toHaveBeenCalledTimes(20); // only the pinned element is re-measured

    // ±1 viewport window follows the scroll position; the fixed nav moves along.
    const flow = world.all.filter((p) => p.element && p.element !== nav).map((p) => p.top);
    expect(flow).toEqual(Array.from({ length: 23 }, (_, i) => i * 100)); // up to 600 + 2 * VH
    expect(world.all.find((p) => p.element === nav)?.top).toBe(600);
    expect(world.get('floor')?.top).toBe(600 + VH);
  });

  it('filters to ±1 viewport like a full scan would', () => {
    cards([0, 1000, 2000, 2500]);
    start();
    expect(ids()).toEqual([0, 1000]); // 2000 > 2 * VH
    scrollTo(700);
    world.update();
    expect(ids()).toEqual([0, 1000, 2000]); // 2500 > 700 + 2 * VH
  });

  it('rescans once the viewport leaves the scanned band and finds platforms there', () => {
    cards(Array.from({ length: 40 }, (_, i) => i * 500));
    start();
    const qsa = vi.spyOn(document, 'querySelectorAll');
    const now = performance.now();

    scrollTo(10_000);
    world.update(now);
    expect(qsa).not.toHaveBeenCalled(); // throttled, not urgent
    world.update(now + 200);
    expect(qsa).toHaveBeenCalledTimes(1);
    expect(ids()).toEqual([9500, 10_000, 10_500, 11_000, 11_500]);
  });

  it('skips the fallback poll while the tab is hidden and rescans when visible', () => {
    cards([100]);
    start();
    const qsa = vi.spyOn(document, 'querySelectorAll');
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);

    for (let i = 0; i < 10; i++) poll();
    expect(world.update(performance.now() + 1000)).toBe(false);
    expect(qsa).not.toHaveBeenCalled();

    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(world.update()).toBe(true);
    expect(qsa).toHaveBeenCalledTimes(1);
  });

  it('backs off polling while scans find nothing new', () => {
    cards([100]);
    start();
    const qsa = vi.spyOn(document, 'querySelectorAll');
    const tick = () => {
      poll();
      world.update(performance.now() + 1000);
    };
    for (let i = 0; i < 4; i++) tick();
    expect(qsa).toHaveBeenCalledTimes(4); // every 800 ms until calm
    for (let i = 0; i < 9; i++) tick();
    expect(qsa).toHaveBeenCalledTimes(7); // then only every third tick (2.4 s)
  });

  it('throttles text-only mutations harder than structural ones', async () => {
    const [el] = cards([100]);
    const text = document.createTextNode('12:00');
    el!.append(text);
    start();
    const qsa = vi.spyOn(document, 'querySelectorAll');

    text.data = '12:01';
    await new Promise((r) => setTimeout(r, 0));
    const now = performance.now();
    expect(world.update(now + 200)).toBe(false);
    expect(world.update(now + 600)).toBe(true);

    el!.append(document.createElement('span'));
    await new Promise((r) => setTimeout(r, 0));
    expect(world.update(performance.now() + 200)).toBe(true);
    expect(qsa.mock.calls.filter(([s]) => s === '.card')).toHaveLength(2);
  });

  it('removes all listeners, observers and timers on stop()', () => {
    const add = [vi.spyOn(window, 'addEventListener'), vi.spyOn(document, 'addEventListener')];
    const remove = [vi.spyOn(window, 'removeEventListener'), vi.spyOn(document, 'removeEventListener')];
    const clear = vi.spyOn(window, 'clearInterval');
    const disconnect = [
      vi.spyOn(MutationObserver.prototype, 'disconnect'),
      vi.spyOn(ResizeObserver.prototype, 'disconnect'),
    ];
    cards([100]);
    start();
    world.stop();

    add.forEach((spy, i) => {
      expect(spy.mock.calls.length).toBeGreaterThan(0);
      for (const [type, fn] of spy.mock.calls) expect(remove[i]).toHaveBeenCalledWith(type, fn);
    });
    expect(clear).toHaveBeenCalledOnce();
    for (const spy of disconnect) expect(spy).toHaveBeenCalledOnce();

    scrollTo(500);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(world.update()).toBe(false);
  });
});
