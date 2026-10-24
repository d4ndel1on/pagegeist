import { afterEach, describe, expect, it } from 'vitest';
import { createPagegeist, type PagegeistInstance } from '../src';
import { resolveOptions } from '../src/core/options';
import { GothRenderer } from '../src/core/render/GothRenderer';
import { DEFAULT_LOOK, type Look, RenderQueue, type RenderState } from '../src/core/render/types';
import { type Facing, MascotState } from '../src/core/types';

const HEIGHT = 168;

function baseState(state: MascotState, time: number, facing: Facing = 1): RenderState {
  return {
    state,
    stateTime: 0.5,
    time,
    facing,
    velocity: { x: 0, y: 0 },
    gait: 0,
    stride: 1,
    handTarget: null,
    climbProgress: 0,
    shimmyPhase: 0,
    jumpCrouch: 0,
    lookAt: null,
    squash: 0,
    hairSway: 0,
    blink: false,
    attitude: 0,
    mood: 'neutral',
  };
}

function poseSequence(): RenderState[] {
  const seq: RenderState[] = [];
  let t = 1;
  const next = () => (t += 1 / 60);
  for (let i = 0; i < 4; i++) seq.push(baseState(MascotState.IDLE, next()));
  for (const gait of [0, 20, 45, 80, 130, 200]) seq.push({ ...baseState(MascotState.WALK, next()), gait });
  seq.push({ ...baseState(MascotState.WALK, next(), -1), gait: 60, stride: 0.5 });
  seq.push({ ...baseState(MascotState.JUMP, next()), jumpCrouch: 0.4, velocity: { x: 50, y: -300 } });
  seq.push({ ...baseState(MascotState.FALL, next()), velocity: { x: 30, y: 250 } });
  seq.push({ ...baseState(MascotState.HANG_ON_EDGE, next()), handTarget: { x: 10, y: -170 }, shimmyPhase: 0.3 });
  seq.push({ ...baseState(MascotState.CLIMB, next()), handTarget: { x: 10, y: -170 }, climbProgress: 0.5 });
  seq.push(baseState(MascotState.SIT_ON_ELEMENT, next()));
  seq.push({ ...baseState(MascotState.GRABBED, next()), velocity: { x: -40, y: 10 } });
  return seq;
}

const round = (v: unknown): unknown => {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : String(v);
  if (Array.isArray(v)) return v.map(round);
  if (v && typeof v === 'object') return '[object]';
  return v;
};

/** A fake 2D context that records every method call and property set. */
function recordingContext(): { ctx: CanvasRenderingContext2D; log: unknown[] } {
  const log: unknown[] = [];
  const props: Record<string | symbol, unknown> = {};
  const gradient = { addColorStop: (...a: unknown[]) => log.push(['grad.addColorStop', ...a.map(round)]) };
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get(_t, key) {
      if (key in props) return props[key];
      if (key === 'canvas') return { width: 800, height: 600 };
      return (...args: unknown[]) => {
        log.push([String(key), ...args.map(round)]);
        if (String(key).startsWith('create')) return gradient;
        if (key === 'measureText') return { width: 10 };
        if (key === 'getTransform') return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
        return undefined;
      };
    },
    set(_t, key, value) {
      props[key] = value;
      log.push(['=', String(key), round(value)]);
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log };
}

function drawLog(r: GothRenderer, seq: RenderState[] = poseSequence()): unknown[] {
  const { ctx, log } = recordingContext();
  for (const rs of seq) {
    const q = new RenderQueue();
    r.draw(q, 400, 500, rs, 10);
    q.flush(ctx);
  }
  return log;
}

function hash(log: unknown[]): string {
  const s = JSON.stringify(log);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16)}:${s.length}`;
}

describe('default outfit is unchanged', () => {
  // Hash changed with the posed hands, the batched lace pattern and the paler, ghostlier
  // skin (owner-approved; the skin change only swaps the two skin colors). The drawing-helper
  // refactor in 0.1.2 only reordered style assignments: every paint call runs with the same
  // path and style as before.
  it('matches the golden hash of the classic look', () => {
    const log = drawLog(new GothRenderer(HEIGHT));
    expect(log.length).toBeGreaterThan(100);
    expect(hash(log)).toMatchSnapshot();
  });
});

const COMBOS: Look[] = (['classic', 'corset'] as const).flatMap((outfit) =>
  (['boots', 'heels'] as const).flatMap((shoes) => [false, true].map((fishnets) => ({ outfit, shoes, fishnets }))),
);
const NON_DEFAULT = COMBOS.filter((l) => l.outfit !== 'classic' || l.shoes !== 'boots' || l.fishnets);
const label = (l: Look) => `${l.outfit}/${l.shoes}/${l.fishnets ? 'fishnets' : 'bare'}`;

function rendererWith(look?: Look): GothRenderer {
  const r = new GothRenderer(HEIGHT);
  if (look) setLook(r, look);
  return r;
}

function setLook(r: GothRenderer, look: Look): void {
  (r as unknown as { look: Look }).look = { ...look };
}

describe('resolveOptions wardrobe', () => {
  it('defaults to classic outfit, boots and no fishnets', () => {
    const o = resolveOptions({});
    expect(o.outfit).toBe('classic');
    expect(o.shoes).toBe('boots');
    expect(o.fishnets).toBe(false);
  });

  it('takes explicit values over', () => {
    const o = resolveOptions({ outfit: 'corset', shoes: 'heels', fishnets: true });
    expect(o.outfit).toBe('corset');
    expect(o.shoes).toBe('heels');
    expect(o.fishnets).toBe(true);
  });

  it('keeps other fields on partial updates', () => {
    const base = resolveOptions({ shoes: 'heels', fishnets: true, zIndex: 7 });
    const next = resolveOptions({ outfit: 'corset' }, base);
    expect(next.outfit).toBe('corset');
    expect(next.shoes).toBe('heels');
    expect(next.fishnets).toBe(true);
    expect(next.zIndex).toBe(7);
  });

  it('keeps the outfit when an update omits it', () => {
    const prev = resolveOptions({ outfit: 'corset' });
    const next = resolveOptions({}, prev);
    expect(next.outfit).toBe('corset');
    expect(next.shoes).toBe('boots');
    expect(next.fishnets).toBe(false);
  });

  it('can switch values back off', () => {
    const prev = resolveOptions({ outfit: 'corset', shoes: 'heels', fishnets: true });
    const next = resolveOptions({ outfit: 'classic', shoes: 'boots', fishnets: false }, prev);
    expect([next.outfit, next.shoes, next.fishnets]).toEqual(['classic', 'boots', false]);
  });
});

describe('engine applies the look to the renderer', () => {
  let instance: PagegeistInstance | null = null;
  afterEach(() => {
    instance?.destroy();
    instance = null;
    document.body.innerHTML = '';
  });
  const lookOf = (inst: PagegeistInstance) => (inst as unknown as { renderer: { look: Look } }).renderer.look;

  it('uses the default look without options', () => {
    instance = createPagegeist();
    expect(lookOf(instance)).toEqual(DEFAULT_LOOK);
  });

  it('passes construction options through', () => {
    instance = createPagegeist({ outfit: 'corset', shoes: 'heels', fishnets: true });
    expect(lookOf(instance)).toEqual({ outfit: 'corset', shoes: 'heels', fishnets: true });
  });

  it('updates the look and keeps unspecified fields', () => {
    instance = createPagegeist({ shoes: 'heels' });
    instance.update({ outfit: 'corset' });
    expect(lookOf(instance)).toEqual({ outfit: 'corset', shoes: 'heels', fishnets: false });
    instance.update({ fishnets: true });
    expect(lookOf(instance)).toEqual({ outfit: 'corset', shoes: 'heels', fishnets: true });
    instance.update({});
    expect(lookOf(instance)).toEqual({ outfit: 'corset', shoes: 'heels', fishnets: true });
    instance.update({ outfit: 'classic', shoes: 'boots', fishnets: false });
    expect(lookOf(instance)).toEqual(DEFAULT_LOOK);
  });
});

describe('default look equals explicit classic look', () => {
  it('draws the identical call log', () => {
    const implicit = drawLog(rendererWith());
    const explicit = drawLog(rendererWith({ outfit: 'classic', shoes: 'boots', fishnets: false }));
    expect(explicit).toEqual(implicit);
  });

  it('starts with the default look', () => {
    expect((new GothRenderer(HEIGHT) as unknown as { look: Look }).look).toEqual(DEFAULT_LOOK);
  });
});

function walkState(gait: number, facing: Facing, stride = 1, time = 1): RenderState {
  return { ...baseState(MascotState.WALK, time, facing), stateTime: 1, gait, stride };
}

/** Identical draw sequence for every look: walk cycles at several strides and facings. */
function geometryTrace(r: GothRenderer) {
  const feet: unknown[] = [];
  const bounds: unknown[] = [];
  const cycle = 0.6 * HEIGHT;
  let t = 1;
  for (const facing of [1, -1] as const) {
    for (const stride of [1, 0.6, 0.25]) {
      for (let i = 0; i <= 80; i++) {
        t += 1 / 60;
        const rs = walkState(1000 + (i / 40) * cycle, facing, stride, t);
        r.draw(new RenderQueue(), 0, 0, rs, 0);
        feet.push(r.debugFeet());
        if (i % 10 === 0) bounds.push(r.bounds(rs));
      }
    }
  }
  for (const rs of poseSequence()) {
    r.draw(new RenderQueue(), 0, 0, rs, 0);
    bounds.push(r.bounds(rs));
  }
  return { feet, bounds, metrics: { ...r.metrics } };
}

function expectClose(actual: unknown, expected: unknown, path = ''): void {
  if (typeof expected === 'number') {
    expect(typeof actual, path).toBe('number');
    expect(Math.abs((actual as number) - expected), path).toBeLessThanOrEqual(1e-9);
  } else if (expected && typeof expected === 'object') {
    expect(actual, path).toBeTypeOf('object');
    expect(Object.keys(actual as object).sort(), path).toEqual(Object.keys(expected).sort());
    for (const [k, v] of Object.entries(expected))
      expectClose((actual as Record<string, unknown>)[k], v, `${path}.${k}`);
  } else {
    expect(actual, path).toEqual(expected);
  }
}

describe('look never changes geometry', () => {
  const reference = geometryTrace(rendererWith(DEFAULT_LOOK));

  it('records feet for every frame', () => {
    expect(reference.feet.every((f) => f !== null)).toBe(true);
  });

  for (const look of COMBOS) {
    it(`feet, bounds and metrics match classic (${label(look)})`, () => {
      const trace = geometryTrace(rendererWith(look));
      expectClose(trace.feet, reference.feet, 'feet');
      expectClose(trace.bounds, reference.bounds, 'bounds');
      expectClose(trace.metrics, reference.metrics, 'metrics');
    });
  }
});

describe('non-default looks render differently', () => {
  const idleSeq = () => [1, 1.1, 1.2].map((t) => baseState(MascotState.IDLE, t));
  const walkSeq = () => [0, 40, 90].map((g, i) => walkState(g, 1, 1, 1 + i / 60));
  const classicIdle = drawLog(rendererWith(DEFAULT_LOOK), idleSeq());
  const classicWalk = drawLog(rendererWith(DEFAULT_LOOK), walkSeq());

  for (const look of NON_DEFAULT) {
    it(`differs from classic (${label(look)})`, () => {
      expect(hash(drawLog(rendererWith(look), idleSeq()))).not.toBe(hash(classicIdle));
      expect(hash(drawLog(rendererWith(look), walkSeq()))).not.toBe(hash(classicWalk));
    });
  }

  it('applies a mid-run look change on the next draw', () => {
    const a = rendererWith(DEFAULT_LOOK);
    const b = rendererWith(DEFAULT_LOOK);
    const prefix = poseSequence().slice(0, 8);
    expect(drawLog(b, prefix)).toEqual(drawLog(a, prefix));
    const frame = walkState(120, 1, 1, 5);
    for (const look of NON_DEFAULT) {
      setLook(b, look);
      expect(hash(drawLog(b, [frame])), label(look)).not.toBe(hash(drawLog(a, [frame])));
    }
  });
});
