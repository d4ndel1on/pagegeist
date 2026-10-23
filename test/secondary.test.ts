import { describe, expect, it, vi } from 'vitest';
import { cycleLength, walkSpeed } from '../src/core/gait';
import { Mascot } from '../src/core/Mascot';
import { resolveOptions } from '../src/core/options';
import { createPhysics } from '../src/core/physics';
import { createRandom, seeded } from '../src/core/random';
import { GothRenderer } from '../src/core/render/GothRenderer';
import { RenderQueue, type RenderState } from '../src/core/render/types';
import { SWAY } from '../src/core/render/walk';
import { MascotState, type Platform } from '../src/core/types';
import type { DomCollisionWorld } from '../src/core/World';

const HEIGHT = 168;
const DT = 1 / 60;
const FULL = walkSpeed(HEIGHT);

function rs(state: MascotState, time: number, gait = 0): RenderState {
  return {
    state,
    stateTime: 1,
    time,
    facing: 1,
    velocity: { x: 0, y: 0 },
    gait,
    stride: 1,
    handTarget: state === MascotState.HANG_ON_EDGE ? { x: 0, y: -200 } : null,
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
/** Springs and skeleton are private; the tests only read them. */
type Peek = { sec: number[][]; last: { hip: Joint; near: { knee: Joint }; far: { knee: Joint } } };
type Lag = { hair: number; near: number; far: number; thigh: number };

/** Lag behind the last drawn pose: hair vs hip height (units), hems vs thighs (rad); plus the near thigh angle. */
function lagOf(r: GothRenderer): Lag {
  const { sec, last } = r as unknown as Peek;
  const th = (k: Joint) => Math.atan2(k.x - last.hip.x, k.y - last.hip.y);
  const thigh = th(last.near.knee);
  return { hair: sec[0]![0]! - last.hip.y, near: sec[1]![0]! - thigh, far: sec[2]![0]! - th(last.far.knee), thigh };
}

/** Draws `walk` seconds of walking at full speed, then `rest` seconds of `then`; one sample per frame. */
function run(walk: number, rest: number, then: MascotState = MascotState.IDLE) {
  const r = new GothRenderer(HEIGHT);
  const out: { walk: Lag[]; rest: Lag[] } = { walk: [], rest: [] };
  let t = 1;
  for (let i = 0; i < walk / DT; i++) {
    t += DT;
    r.draw(new RenderQueue(), 0, 0, rs(MascotState.WALK, t, (i + 1) * FULL * DT), 0);
    out.walk.push(lagOf(r));
  }
  for (let i = 0; i < rest / DT; i++) {
    t += DT;
    r.draw(new RenderQueue(), 0, 0, rs(then, t), 0);
    out.rest.push(lagOf(r));
  }
  return out;
}

const maxAbs = (xs: number[]) => Math.max(...xs.map(Math.abs));
const signChanges = (xs: number[]) => xs.filter((x, i) => i && Math.sign(x) !== Math.sign(xs[i - 1]!)).length;

const platform: Platform = {
  id: 'home',
  kind: 'heading',
  left: 0,
  right: 2000,
  top: 500,
  bottom: 530,
  element: null,
  hangable: true,
  sittable: true,
};
const world = {
  revision: 1,
  all: [platform],
  get: (id: string | null) => (id === platform.id ? platform : null),
  viewport: () => ({ left: 0, right: 2000, top: 0, bottom: 800 }),
  safeViewport: () => ({ left: 0, right: 2000, top: 0, bottom: 800 }),
  platformBelow: () => null,
} as unknown as DomCollisionWorld;

describe('hair', () => {
  it('bounces with the hip bob on every step, bounded', () => {
    // After the start-up
    const steady = run(4, 0)
      .walk.slice(120)
      .map((s) => s.hair);
    const amp = maxAbs(steady); // ≈ 1.9 units (bob is 3 units peak to peak)
    expect(amp).toBeGreaterThan(0.5);
    expect(amp).toBeLessThan(4);
    // One up/down per step: ~2 sign changes per step over 2 s at 1.75 steps/s.
    expect(signChanges(steady)).toBeGreaterThanOrEqual(5);
    expect(signChanges(steady)).toBeLessThanOrEqual(9);
    expect(amp * SWAY.bounce).toBeLessThanOrEqual(SWAY.bounceMax);
  });

  it('trails while walking, swings past rest on a stop and settles within ~1 s', () => {
    const m = new Mascot(
      world,
      new GothRenderer(HEIGHT).metrics,
      createPhysics(HEIGHT),
      createRandom(seeded(3)),
      resolveOptions({}),
      vi.fn(),
    );
    m.standOn(platform, 100);
    const secondary = (m as unknown as { updateSecondary(dt: number): void }).updateSecondary.bind(m);
    const step = () => {
      m.time += DT;
      secondary(DT);
      return m.renderState().hairSway;
    };
    const walking: number[] = [];
    for (let i = 0; i < 1200 && !m.walkToward(500, DT); i++) walking.push(step());
    expect(m.body.pos.x).toBe(500);
    const after = Array.from({ length: 2 / DT }, step);
    const back = Math.min(...walking); // ≈ −0.18: blown back while walking right
    const over = Math.max(...after); // ≈ +0.03: swings forward past rest after the stop
    expect(back).toBeLessThan(-0.1);
    expect(back).toBeGreaterThan(-0.5);
    expect(over).toBeGreaterThan(0.1 * -back);
    expect(over).toBeLessThan(0.5 * -back);
    expect(maxAbs(after.slice(60))).toBeLessThan(0.005); // settled after 1 s
  });
});

describe('skirt', () => {
  it('follows the thigh with a lag and rings out after stopping', () => {
    const { walk, rest } = run(4, 3);
    const cycle = Math.round(cycleLength(HEIGHT) / FULL / DT); // frames per cycle
    const last = walk.slice(-cycle);
    const peak = (f: (s: Lag) => number) => last.reduce((b, s, i) => (f(s) > f(last[b]!) ? i : b), 0);
    // The hem (thigh + lag) peaks after the thigh: ≈ 0.13 cycles later.
    const delay = (peak((s) => s.thigh + s.near) - peak((s) => s.thigh) + cycle) % cycle;
    expect(delay / cycle).toBeGreaterThan(0.03);
    expect(delay / cycle).toBeLessThan(0.35);
    const amp = maxAbs(walk.slice(120).map((s) => s.near)); // ≈ 0.47 rad, shown × SWAY.hem
    expect(amp).toBeGreaterThan(0.1);
    expect(amp * SWAY.hem).toBeLessThan(0.2);
    // After stopping it swings on (overshoots once or twice), then decays.
    const ring = rest.slice(0, 60).map((s) => s.near);
    expect(maxAbs(ring)).toBeGreaterThan(0.05);
    expect(signChanges(ring)).toBeGreaterThanOrEqual(1);
    expect(maxAbs(rest.slice(-60).map((s) => s.near))).toBeLessThan(0.01);
  });
});

describe('at rest', () => {
  it('is ~0 for a long IDLE', () => {
    const late = run(0, 10).rest.slice(-300);
    expect(maxAbs(late.map((s) => s.hair))).toBeLessThan(0.15); // breathing only: ≈ 0.08 units
    expect(maxAbs(late.map((s) => s.near))).toBeLessThan(0.01);
    expect(maxAbs(late.map((s) => s.far))).toBeLessThan(0.01);
  });

  it('stays calm while hanging and sitting', () => {
    for (const state of [MascotState.HANG_ON_EDGE, MascotState.SIT_ON_ELEMENT]) {
      const late = run(0, 6, state).rest.slice(-180);
      expect(maxAbs(late.map((s) => s.hair))).toBeLessThan(0.15);
      expect(maxAbs(late.flatMap((s) => [s.near, s.far]))).toBeLessThan(0.05); // hang ≈ 0.02 rad
    }
  });
});
