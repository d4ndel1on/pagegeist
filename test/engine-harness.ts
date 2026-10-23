import { vi } from 'vitest';

/**
 * Fake animation-frame loop and clock for driving the engine deterministically.
 * Counts every requestAnimationFrame call; cancelled frames never run.
 */
export function fakeLoop(start = 1000) {
  let id = 0;
  let now = start;
  let requests = 0;
  const pending = new Map<number, FrameRequestCallback>();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    requests++;
    pending.set(++id, cb);
    return id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((handle) => {
    pending.delete(handle);
  });
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  // happy-dom has no layout: give the viewport a width so the virtual floor exists.
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(window.innerWidth);
  return {
    /** Total number of requestAnimationFrame calls so far. */
    get requests(): number {
      return requests;
    },
    /** Frames requested and not yet run or cancelled. */
    get pending(): number {
      return pending.size;
    },
    /** Advances the clock (ms) without running frames. */
    advance(ms: number): void {
      now += ms;
    },
    /** Runs `count` frames, `ms` apart. */
    run(count: number = 1, ms: number = 1000 / 60): void {
      for (let i = 0; i < count; i++) {
        now += ms;
        const callbacks = [...pending.values()];
        pending.clear();
        for (const cb of callbacks) cb(now);
      }
    },
  };
}

export function pointer(type: string, init: PointerEventInit = {}): PointerEvent {
  return new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, ...init });
}

/** Gives every canvas a no-op 2D context (happy-dom has none), so the engine really draws. */
export function fakeCanvas(): void {
  const gradient = { addColorStop: () => undefined };
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'measureText') return () => ({ width: 10 });
      if (key === 'getImageData') return () => ({ data: [0, 0, 0, 0] });
      if (key === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      return () => gradient;
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
}

interface FakeQuery {
  media: string;
  matches: boolean;
  listeners: Set<() => void>;
}

/** matchMedia stand-in that records listeners; `set()` flips a query and fires `change`. */
export function fakeMedia(initial: Record<string, boolean> = {}) {
  const queries: FakeQuery[] = [];
  const state = { ...initial };
  vi.spyOn(window, 'matchMedia').mockImplementation((media: string) => {
    const q: FakeQuery = { media, matches: state[media] ?? false, listeners: new Set() };
    queries.push(q);
    return {
      media,
      get matches() {
        return q.matches;
      },
      addEventListener: (_type: string, fn: () => void) => q.listeners.add(fn),
      removeEventListener: (_type: string, fn: () => void) => q.listeners.delete(fn),
    } as unknown as MediaQueryList;
  });
  return {
    /** Queries that currently have a change listener. */
    watched: (): string[] => queries.filter((q) => q.listeners.size).map((q) => q.media),
    set(media: string, matches: boolean): void {
      state[media] = matches;
      for (const q of queries.filter((x) => x.media === media)) {
        q.matches = matches;
        for (const fn of [...q.listeners]) fn();
      }
    },
  };
}
