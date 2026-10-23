import { describe, expect, it } from 'vitest';
import { GothRenderer } from '../src/core/render/GothRenderer';
import { RenderQueue, type RenderState } from '../src/core/render/types';
import { LEG } from '../src/core/render/walk';
import { MascotState } from '../src/core/types';

const HEIGHT = 168;
const DT = 1 / 60;

function rs(state: MascotState, time: number, stateTime: number, gait = 0): RenderState {
  return {
    state,
    stateTime,
    time,
    facing: 1,
    velocity: { x: 0, y: 0 },
    gait,
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

type Joint = { x: number; y: number };
/** The skeleton is private; the tests only read its joints. */
type Peek = {
  last: { hip: Joint; head: Joint; near: { knee: Joint; ankle: Joint }; far: { knee: Joint; ankle: Joint } };
};

/** Draws `from` for a while, then `to`; returns per-frame snapshots of the blended and the raw `to` pose. */
function transition(from: MascotState, to: MascotState, frames = 60) {
  const r = new GothRenderer(HEIGHT);
  const raw = new GothRenderer(HEIGHT); // fresh renderer per frame state → never blends
  let t = 1;
  for (let i = 0; i < 30; i++) {
    t += DT;
    r.draw(new RenderQueue(), 0, 0, rs(from, t, i * DT), 0);
  }
  const head = (x: GothRenderer) => (x as unknown as Peek).last.head.y * (HEIGHT / 120);
  const before = { feet: r.debugFeet()!, top: head(r) };
  const out: Array<{
    feet: ReturnType<GothRenderer['debugFeet']> & {};
    top: number;
    target: typeof before;
    sk: Peek['last'];
  }> = [];
  for (let i = 0; i < frames; i++) {
    t += DT;
    const s = rs(to, t, i * DT, i * 2);
    r.draw(new RenderQueue(), 0, 0, s, 0);
    raw.draw(new RenderQueue(), 0, 0, s, 0);
    out.push({
      feet: r.debugFeet()!,
      top: head(r),
      target: { feet: raw.debugFeet()!, top: head(raw) },
      sk: (r as unknown as Peek).last,
    });
    (raw as unknown as { shown: null }).shown = null;
  }
  return { before, out };
}

const dist = (a: Joint, b: Joint) => Math.hypot(a.x - b.x, a.y - b.y);

describe('state transitions (inertialization)', () => {
  for (const [from, to] of [
    [MascotState.IDLE, MascotState.WALK],
    [MascotState.WALK, MascotState.IDLE],
    [MascotState.SIT_ON_ELEMENT, MascotState.IDLE],
    [MascotState.FALL, MascotState.IDLE],
  ] as const) {
    it(`blends ${from} → ${to} without a jump and settles on the new pose`, () => {
      const { before, out } = transition(from, to);
      const first = out[0]!;
      // The raw new pose is far away from the old one, the shown pose is not.
      const jump = Math.abs(first.target.top - before.top) + dist(first.target.feet.near, before.feet.near);
      const shown = Math.abs(first.top - before.top) + dist(first.feet.near, before.feet.near);
      if (jump > 3) expect(shown).toBeLessThan(jump * 0.3);
      // Consecutive frames move smoothly: on top of the new pose's own motion, no step
      // anywhere near the raw jump.
      const limit = jump * 0.1 + 1;
      for (let i = 1; i < out.length; i++) {
        const [a, b] = [out[i - 1]!, out[i]!];
        expect(Math.abs(b.top - a.top)).toBeLessThan(Math.abs(b.target.top - a.target.top) + limit);
        expect(dist(b.feet.near, a.feet.near)).toBeLessThan(dist(b.target.feet.near, a.target.feet.near) + limit);
      }
      // After ~1 s the offset is gone.
      const last = out.at(-1)!;
      expect(Math.abs(last.top - last.target.top)).toBeLessThan(0.05);
      expect(dist(last.feet.far, last.target.feet.far)).toBeLessThan(0.05);
    });
  }

  it('keeps the bone lengths while blending (no stretched legs, no knee pop)', () => {
    const { out } = transition(MascotState.SIT_ON_ELEMENT, MascotState.IDLE, 30);
    for (const { sk } of out) {
      for (const l of [sk.near, sk.far]) {
        expect(dist(sk.hip, l.knee)).toBeCloseTo(LEG.thigh, 1);
        expect(dist(l.knee, l.ankle)).toBeCloseTo(LEG.shin, 1);
      }
    }
  });

  it('lets a planted foot step instead of sliding along the ground', () => {
    const { out } = transition(MascotState.WALK, MascotState.IDLE);
    for (let i = 1; i < out.length; i++) {
      for (const foot of ['near', 'far'] as const) {
        const moved = Math.abs(out[i]!.feet[foot].x - out[i - 1]!.feet[foot].x);
        const onGround = out[i]!.feet[foot].y > -0.3;
        if (onGround) expect(moved).toBeLessThan(0.15);
      }
    }
  });
});
