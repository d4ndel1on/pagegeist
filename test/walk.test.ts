import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAIT, GAIT, type GaitTuning } from '../src/core/gait';
import { GothRenderer } from '../src/core/render/GothRenderer';
import { RenderQueue, type RenderState } from '../src/core/render/types';
import {
  ankleOf,
  footAt,
  footPhase,
  heelTip,
  hipHeight,
  LEG,
  UNIT_HEIGHT,
  WALK,
  type WalkFoot,
  walkPhase,
  walkPose,
} from '../src/core/render/walk';
import { type Facing, MascotState } from '../src/core/types';

const HEIGHT = 168;
const SETTINGS: Array<[string, Partial<GaitTuning>]> = [
  ['default gait', {}],
  ['long, fast steps', { stepLength: 0.45, cadence: 2 }],
];

afterEach(() => {
  Object.assign(GAIT, DEFAULT_GAIT);
});

function walkState(gait: number, facing: Facing, stride = 1): RenderState {
  return {
    state: MascotState.WALK,
    stateTime: 1,
    time: 1,
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

/** Draws the walk at `gait` px and returns the planted-point positions relative to the feet. */
function feetAt(r: GothRenderer, gait: number, facing: Facing, stride = 1) {
  r.draw(new RenderQueue(), 0, 0, walkState(gait, facing, stride), 0);
  return r.debugFeet()!;
}

describe('walk cycle', () => {
  for (const [name, tuning] of SETTINGS) {
    for (const facing of [1, -1] as const) {
      it(`keeps the stance foot planted (${name}, facing ${facing})`, () => {
        Object.assign(GAIT, tuning);
        const r = new GothRenderer(HEIGHT);
        const cycle = 2 * GAIT.stepLength * HEIGHT;
        const planted = new Map<string, number[]>();
        for (let i = 0; i <= 600; i++) {
          const d = 1000 + (i / 300) * cycle; // two full cycles
          const u = walkPhase(d, HEIGHT);
          const feet = feetAt(r, d, facing);
          for (const foot of [0, 1] as const) {
            if (footPhase(u, foot) >= GAIT.stance) continue;
            const p = foot === 0 ? feet.near : feet.far;
            expect(Math.abs(p.y)).toBeLessThan(0.5); // on the ground (IK reached it)
            const key = `${foot}:${Math.floor(u + foot * 0.5)}`;
            const xs = planted.get(key) ?? [];
            xs.push(facing * d + p.x); // world x
            planted.set(key, xs);
          }
        }
        expect(planted.size).toBeGreaterThanOrEqual(4);
        for (const xs of planted.values()) {
          expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.5);
        }
      });
    }
  }

  it('loops seamlessly and is continuous at the step seams', () => {
    for (const [, tuning] of SETTINGS) {
      Object.assign(GAIT, tuning);
      for (const seam of [0, 0.5, 1]) {
        const a = walkPose(seam - 1e-7);
        const b = walkPose(seam + 1e-7);
        const flat = (p: ReturnType<typeof walkPose>) => [
          p.hipY,
          p.torso,
          p.near.x,
          p.near.y,
          p.near.pitch,
          p.far.x,
          p.far.y,
          p.far.pitch,
          p.nearArm.angle,
          p.farArm.angle,
        ];
        const fa = flat(a);
        for (const [i, x] of flat(b).entries()) expect(x).toBeCloseTo(fa[i]!, 3);
      }
    }
  });

  it('is lowest around contact and highest at mid-stance, with the GAIT bob amplitude', () => {
    for (const [, tuning] of SETTINGS) {
      Object.assign(GAIT, tuning);
      const n = 400;
      const hips = Array.from({ length: n }, (_, i) => -walkPose(i / n).hipY); // hip height
      const step = hips.slice(0, n / 2); // one step: near foot contacts at u = 0
      const lowest = step.indexOf(Math.min(...step)) / n;
      const highest = step.indexOf(Math.max(...step)) / n;
      expect(lowest).toBeLessThan(0.08); // contact … down
      expect(highest).toBeGreaterThan(0.18); // mid-stance of the near foot (w ≈ 0.25)
      expect(highest).toBeLessThan(0.32);
      expect(Math.max(...hips) - Math.min(...hips)).toBeCloseTo(GAIT.bob * UNIT_HEIGHT, 1);
    }
  });
});

/** Knee flexion (rad, 0 = straight) of a leg from the hip to `foot`, solved like the renderer's 2-bone IK. */
function kneeFlexion(hipY: number, foot: WalkFoot): number {
  const a = ankleOf(foot);
  const d2 = a.x * a.x + (a.y - hipY) ** 2;
  const { thigh, shin } = LEG;
  const cos = (thigh * thigh + shin * shin - d2) / (2 * thigh * shin);
  return Math.PI - Math.acos(Math.min(1, Math.max(-1, cos)));
}

const DEG = Math.PI / 180;

describe('high-heel gait', () => {
  it('lands with a flexed knee (10°–15° at contact)', () => {
    const p = walkPose(0); // near foot contacts
    const knee = kneeFlexion(p.hipY, p.near);
    expect(knee).toBeGreaterThan(10 * DEG);
    expect(knee).toBeLessThan(15 * DEG);
  });

  it('keeps the trailing knee fairly straight and never pops the stance knee straight', () => {
    const p = walkPose(0); // far foot is the trailing one, about to push off
    const trail = kneeFlexion(p.hipY, p.far);
    expect(trail).toBeLessThan(30 * DEG); // was ~43° before the high-heel tuning
    const n = 400;
    let min = Infinity;
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const q = walkPose(u);
      for (const foot of [0, 1] as const) {
        if (footPhase(u, foot) >= GAIT.stance) continue;
        min = Math.min(min, kneeFlexion(q.hipY, foot === 0 ? q.near : q.far));
      }
    }
    expect(min).toBeGreaterThan(6 * DEG); // no IK "pop" to fully straight
  });

  it('lands on the heel tip, toe up, and never pushes the heel into the ground', () => {
    for (const [, tuning] of SETTINGS) {
      Object.assign(GAIT, tuning);
      let maxY = -Infinity;
      for (let i = 0; i < 2000; i++) maxY = Math.max(maxY, heelTip(footAt(i / 2000)).y);
      expect(maxY).toBeLessThanOrEqual(1e-6);
      const contact = footAt(0);
      expect(Math.abs(heelTip(contact).y)).toBeLessThan(1e-6);
      expect(contact.pitch).toBeLessThan(0); // toe up
    }
  });

  it('bobs the head less than the hip', () => {
    for (const [, tuning] of SETTINGS) {
      Object.assign(GAIT, tuning);
      const r = new GothRenderer(HEIGHT);
      const cycle = 2 * GAIT.stepLength * HEIGHT;
      const n = 200;
      const heads: number[] = [];
      const hips: number[] = [];
      for (let i = 0; i < n; i++) {
        const d = 1000 + (i / n) * cycle;
        const rs = walkState(d, 1);
        r.draw(new RenderQueue(), 0, 0, rs, 0);
        heads.push(r.bounds(rs).y); // top of the head (topmost point of the last drawn skeleton)
        hips.push((walkPose(walkPhase(d, HEIGHT)).hipY * HEIGHT) / UNIT_HEIGHT);
      }
      const range = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
      expect(range(heads)).toBeLessThan(range(hips));
    }
  });

  it('swings the arms more forward than back, with a bent elbow in front', () => {
    for (const [, tuning] of SETTINGS) {
      Object.assign(GAIT, tuning);
      const arms = Array.from({ length: 400 }, (_, i) => walkPose(i / 400).nearArm);
      const front = arms.reduce((a, b) => (b.angle > a.angle ? b : a));
      const back = arms.reduce((a, b) => (b.angle < a.angle ? b : a));
      expect(front.angle).toBeGreaterThan(Math.abs(back.angle));
      expect(front.elbow).toBeGreaterThan(back.elbow);
    }
  });
});

describe('hipHeight memoization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('solves once per gait and re-solves when the gait or WALK tuning changes', () => {
    const sqrt = vi.spyOn(Math, 'sqrt');
    Object.assign(GAIT, { bob: DEFAULT_GAIT.bob + 0.001 }); // fresh key
    const h0 = hipHeight();
    const solves = sqrt.mock.calls.length;
    expect(solves).toBeGreaterThanOrEqual(40);
    expect(hipHeight()).toBe(h0);
    expect(hipHeight({ ...GAIT })).toBe(h0); // keyed on values, not identity
    expect(sqrt.mock.calls.length).toBe(solves);

    GAIT.stepLength = 0.45;
    const h1 = hipHeight();
    expect(sqrt.mock.calls.length).toBe(2 * solves);
    expect(h1).not.toBe(h0);

    const { minKnee, minKneeSwing } = WALK;
    try {
      Object.assign(WALK, { minKnee: 0.5, minKneeSwing: 0.5 });
      expect(hipHeight()).toBeLessThan(h1);
      expect(sqrt.mock.calls.length).toBe(3 * solves);
    } finally {
      Object.assign(WALK, { minKnee, minKneeSwing });
    }
    Object.assign(GAIT, DEFAULT_GAIT, { bob: DEFAULT_GAIT.bob + 0.001 });
    expect(hipHeight()).toBe(h0);
  });

  it('returns the same value as an uncached solve', () => {
    const a = hipHeight({ ...DEFAULT_GAIT, stance: 0.6 });
    hipHeight({ ...DEFAULT_GAIT, stance: 0.7 }); // evict
    expect(hipHeight({ ...DEFAULT_GAIT, stance: 0.6 })).toBe(a);
  });
});
