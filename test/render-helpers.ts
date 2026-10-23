import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GothRenderer } from '../src/core/render/GothRenderer';
import { RenderQueue, type RenderState } from '../src/core/render/types';
import { type Facing, MascotState } from '../src/core/types';

/** Shared helpers of the render-* tests (same recording/hashing as test/wardrobe.test.ts). */

export const HEIGHT = 168;

export function baseState(state: MascotState, time: number, facing: Facing = 1): RenderState {
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

/** The pose sequence of the classic golden hash in test/wardrobe.test.ts. */
export function poseSequence(): RenderState[] {
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

/**
 * A fake 2D context that records every method call and property set. Methods listed in
 * `missing` read as undefined (to exercise feature fallbacks).
 */
export function recordingContext(missing: string[] = []): { ctx: CanvasRenderingContext2D; log: unknown[] } {
  const log: unknown[] = [];
  const props: Record<string | symbol, unknown> = {};
  const gradient = { addColorStop: (...a: unknown[]) => log.push(['grad.addColorStop', ...a.map(round)]) };
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get(_t, key) {
      if (key in props) return props[key];
      if (key === 'canvas') return { width: 800, height: 600 };
      if (missing.includes(String(key))) return undefined;
      return (...args: unknown[]) => {
        log.push([String(key), ...args.map(round)]);
        if (String(key).startsWith('create')) return gradient;
        if (key === 'measureText') return { width: 10 * String(args[0]).length };
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

export function drawLog(r: GothRenderer, seq: RenderState[]): unknown[] {
  const { ctx, log } = recordingContext();
  for (const rs of seq) {
    const q = new RenderQueue();
    r.draw(q, 400, 500, rs, 10);
    q.flush(ctx);
  }
  return log;
}

export function hash(log: unknown[]): string {
  const s = JSON.stringify(log);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16)}:${s.length}`;
}

/** Writes a call log (one call per line) to the OS temp dir and returns its path – diff it on a mismatch. */
export function dumpLog(name: string, log: unknown[]): string {
  const file = join(tmpdir(), `pagegeist-render-${name.replace(/[^\w-]+/g, '_')}.log`);
  writeFileSync(file, log.map((l) => JSON.stringify(l)).join('\n'));
  return file;
}
