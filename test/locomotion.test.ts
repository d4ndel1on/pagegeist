import { describe, expect, it, vi } from 'vitest';
import { GAIT, walkSpeed } from '../src/core/gait';
import { Mascot } from '../src/core/Mascot';
import { resolveOptions } from '../src/core/options';
import { createPhysics } from '../src/core/physics';
import { createRandom, seeded } from '../src/core/random';
import { GothRenderer } from '../src/core/render/GothRenderer';
import { RenderQueue, type RenderState } from '../src/core/render/types';
import { footPhase, WALK, walkPhase } from '../src/core/render/walk';
import { type Facing, MascotState, type Platform } from '../src/core/types';
import type { DomCollisionWorld } from '../src/core/World';

const HEIGHT = 168;
const DT = 1 / 60;
const FULL = walkSpeed(HEIGHT);

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

function mascot(x: number): Mascot {
  const m = new Mascot(
    world,
    new GothRenderer(HEIGHT).metrics,
    createPhysics(HEIGHT),
    createRandom(seeded(3)),
    resolveOptions({}),
    vi.fn(),
  );
  m.standOn(platform, x);
  return m;
}

/** One walk frame: advances the clock like `Mascot.update` and returns the speed (px/s) from the position delta. */
function frame(m: Mascot, to: number): { arrived: boolean; speed: number } {
  const x = m.body.pos.x;
  m.time += DT;
  const arrived = m.walkToward(to, DT);
  return { arrived, speed: (m.body.pos.x - x) / DT };
}

/** Walks to `to` and records the speed of every frame until arrival. */
function walk(m: Mascot, to: number): number[] {
  const speeds: number[] = [];
  for (let i = 0; i < 1200; i++) {
    const f = frame(m, to);
    if (f.arrived) return speeds;
    speeds.push(f.speed);
  }
  throw new Error('never arrived');
}

function walkState(gait: number, facing: Facing, stride: number, time = 1): RenderState {
  return {
    state: MascotState.WALK,
    stateTime: 1,
    time,
    facing,
    velocity: { x: 0, y: 0 },
    gait,
    stride,
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

/** Tracks the world x of each planted foot per stance; returns the largest drift within one stance. */
function slipTracker() {
  const planted = new Map<string, number[]>();
  return {
    add(r: GothRenderer, worldX: number, gait: number) {
      const u = walkPhase(gait, HEIGHT);
      const feet = r.debugFeet()!;
      for (const foot of [0, 1] as const) {
        if (footPhase(u, foot) >= GAIT.stance) continue;
        const p = foot === 0 ? feet.near : feet.far;
        const key = `${foot}:${Math.floor(u + foot * 0.5)}`;
        planted.set(key, [...(planted.get(key) ?? []), worldX + p.x]);
      }
    },
    get stances() {
      return planted.size;
    },
    get max() {
      return Math.max(...[...planted.values()].map((xs) => Math.max(...xs) - Math.min(...xs)));
    },
  };
}

describe('speeding up and braking', () => {
  it('ramps up from a standstill to full speed within about a second', () => {
    const speeds = walk(mascot(100), 1500);
    expect(speeds[0]!).toBeLessThan(0.05 * FULL);
    expect(speeds[5]!).toBeLessThan(0.5 * FULL);
    const reached = speeds.findIndex((s) => s >= 0.95 * FULL) * DT;
    expect(reached).toBeGreaterThan(0.3);
    expect(reached).toBeLessThan(1);
    expect(Math.max(...speeds)).toBeLessThanOrEqual(FULL + 1e-6);
  });

  it('slows down before arriving and arrives exactly, without overshooting', () => {
    for (const [from, to] of [
      [100, 600],
      [600, 100],
      [300, 330],
    ] as const) {
      const m = mascot(from);
      const dir = Math.sign(to - from);
      const xs: number[] = [];
      const speeds: number[] = [];
      for (let i = 0; i < 1200 && !frame(m, to).arrived; i++) {
        xs.push(m.body.pos.x);
        speeds.push(Math.abs(m.speed));
      }
      expect(m.body.pos.x).toBe(to);
      for (const x of xs) expect((x - to) * dir).toBeLessThanOrEqual(0);
      const peak = Math.max(...speeds);
      expect(speeds.at(-1)!).toBeLessThan(Math.min(0.4 * FULL, 0.5 * peak)); // braked
      for (let i = speeds.indexOf(peak) + 1; i < speeds.length; i++)
        expect(speeds[i]!).toBeLessThanOrEqual(speeds[i - 1]! + 1e-9);
    }
  });

  it('takes shorter steps at low speed', () => {
    const m = mascot(100);
    frame(m, 1500);
    expect(m.renderState().stride).toBeCloseTo(WALK.minStride, 1);
    for (let i = 0; i < 120; i++) frame(m, 1500);
    expect(m.renderState().stride).toBeGreaterThan(0.97);
  });

  it('reverses by braking first, then turning', () => {
    const m = mascot(300);
    for (let i = 0; i < 90; i++) frame(m, 1500); // up to speed, facing right
    expect(m.facing).toBe(1);
    const turnX = m.body.pos.x;
    let flipped = -1;
    for (let i = 0; i < 300 && flipped < 0; i++) {
      frame(m, 200);
      if (m.facing === -1) flipped = i;
    }
    expect(flipped).toBeGreaterThan(5); // keeps facing forward while braking
    expect(Math.abs(m.speed)).toBeLessThan(0.05 * FULL); // turns only when nearly stopped
    expect(m.body.pos.x).toBeGreaterThan(turnX); // slid on a little while braking
    walk(m, 200);
    expect(m.body.pos.x).toBe(200);
  });
});

describe('feet with a variable stride', () => {
  for (const facing of [1, -1] as const) {
    it(`keeps the stance foot planted with a constant short stride (facing ${facing})`, () => {
      const r = new GothRenderer(HEIGHT);
      const stride = 0.6;
      const slip = slipTracker();
      const cycle = 2 * GAIT.stepLength * HEIGHT;
      for (let i = 0; i <= 600; i++) {
        const d = 1000 + (i / 300) * cycle; // gait distance (at full stride)
        r.draw(new RenderQueue(), 0, 0, walkState(d, facing, stride), 0);
        slip.add(r, facing * d * stride, d); // the body covers stride × gait distance
        const f = r.debugFeet()!;
        for (const p of [f.near, f.far]) expect(p.y).toBeLessThan(0.5);
      }
      expect(slip.stances).toBeGreaterThanOrEqual(4);
      expect(slip.max).toBeLessThan(0.5);
    });
  }

  it('slips only a little while speeding up and braking', () => {
    for (const [from, to] of [
      [100, 600],
      [600, 100],
      [300, 340],
    ] as const) {
      const m = mascot(from);
      const r = new GothRenderer(HEIGHT);
      const slip = slipTracker();
      for (let i = 0; i < 1200 && !frame(m, to).arrived; i++) {
        r.draw(new RenderQueue(), 0, 0, { ...m.renderState(), state: MascotState.WALK }, 0); // the FSM is not running
        slip.add(r, m.body.pos.x, m.gait);
      }
      expect(slip.stances).toBeGreaterThanOrEqual(2);
      expect(slip.max).toBeLessThan(1);
    }
  });
});

describe('turning', () => {
  it('turns through intermediate widths instead of mirroring instantly', () => {
    const r = new GothRenderer(HEIGHT);
    const fx = () => (r as unknown as { fx: number }).fx;
    const draw = (facing: Facing, t: number) => r.draw(new RenderQueue(), 0, 0, walkState(1000, facing, 1, t), 0);
    draw(-1, 1);
    expect(fx()).toBe(-1); // first draw: no turn
    draw(1, 2);
    expect(fx()).toBe(-1); // a turn starts at the old facing
    draw(1, 2 + WALK.turn);
    expect(fx()).toBe(1);
    const scales: number[] = [];
    let t = 3;
    draw(-1, t);
    scales.push(fx());
    while (fx() !== -1 && t < 5) {
      t += DT;
      draw(-1, t);
      scales.push(fx());
    }
    const duration = t - 3;
    expect(scales[0]).toBe(1); // starts at the old facing
    expect(duration).toBeGreaterThanOrEqual(WALK.turn - 1e-9);
    expect(duration).toBeLessThan(WALK.turn + DT + 1e-9);
    expect(scales.some((s) => s > 0 && s < 0.9)).toBe(true); // contracting
    expect(scales.some((s) => s < 0 && s > -0.9)).toBe(true); // widening after the flip
    for (const s of scales) expect(Math.abs(s)).toBeGreaterThanOrEqual(0.3 - 1e-9);
    // Foot debug points follow the drawn scale.
    t += 1;
    draw(1, t);
    const a = r.debugFeet()!.near.x;
    draw(-1, t + WALK.turn / 4);
    expect(Math.sign(r.debugFeet()!.near.x)).toBe(Math.sign(a));
    expect(Math.abs(r.debugFeet()!.near.x)).toBeLessThan(Math.abs(a));
  });
});
