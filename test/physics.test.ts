import { describe, expect, it } from 'vitest';
import { createPhysics, REFERENCE_HEIGHT, solveJump, stepAirborne } from '../src/core/physics';
import type { Platform } from '../src/core/types';

const physics = createPhysics(REFERENCE_HEIGHT);

const platform = (id: string, left: number, right: number, top: number): Platform => ({
  id,
  kind: 'generic',
  left,
  right,
  top,
  bottom: top + 20,
  element: null,
  hangable: true,
  sittable: true,
});

/** Integrates a jump with a fixed step and returns where the body is at `duration`. */
function simulate(from: { x: number; y: number }, vx: number, vy: number, duration: number) {
  const body = { pos: { ...from }, vel: { x: vx, y: vy } };
  const dt = 1 / 1200;
  for (let t = 0; t < duration - dt / 2; t += dt) stepAirborne(body, dt, [], physics);
  return body.pos;
}

describe('solveJump', () => {
  it.each([
    ['up and right', { x: 0, y: 0 }, { x: 120, y: -100 }],
    ['down and left', { x: 0, y: 0 }, { x: -200, y: 150 }],
    ['straight up', { x: 50, y: 300 }, { x: 50, y: 200 }],
  ])('reaches the target (%s)', (_, from, to) => {
    const s = solveJump(from, to, 30, physics.gravity);
    const end = simulate(from, s.vx, s.vy, s.duration);
    expect(end.x).toBeCloseTo(to.x, 0);
    expect(Math.abs(end.y - to.y)).toBeLessThan(3);
  });

  it('always jumps upwards first', () => {
    expect(solveJump({ x: 0, y: 0 }, { x: 100, y: 100 }, 20, physics.gravity).vy).toBeLessThan(0);
  });
});

describe('stepAirborne', () => {
  it('lands on a platform when falling through its top edge', () => {
    const body = { pos: { x: 50, y: 95 }, vel: { x: 0, y: 600 } };
    const landed = stepAirborne(body, 1 / 60, [platform('a', 0, 100, 100)], physics);
    expect(landed?.id).toBe('a');
    expect(body.pos.y).toBe(100);
    expect(body.vel).toEqual({ x: 0, y: 0 });
  });

  it('passes through platforms while moving upwards (one-way)', () => {
    const body = { pos: { x: 50, y: 105 }, vel: { x: 0, y: -900 } };
    expect(stepAirborne(body, 1 / 60, [platform('a', 0, 100, 100)], physics)).toBeNull();
  });

  it('picks the highest platform crossed in one step', () => {
    const body = { pos: { x: 50, y: 90 }, vel: { x: 0, y: 1500 } };
    const landed = stepAirborne(body, 1 / 30, [platform('low', 0, 100, 130), platform('high', 0, 100, 100)], physics);
    expect(landed?.id).toBe('high');
  });

  it('respects the canLand veto', () => {
    const body = { pos: { x: 50, y: 95 }, vel: { x: 0, y: 600 } };
    const landed = stepAirborne(body, 1 / 60, [platform('hidden', 0, 100, 100)], physics, () => false);
    expect(landed).toBeNull();
  });
});

describe('createPhysics', () => {
  it('scales lengths and gravity with the character height', () => {
    const half = createPhysics(REFERENCE_HEIGHT / 2);
    expect(half.scale).toBe(0.5);
    expect(half.shimmySpeed).toBeCloseTo(physics.shimmySpeed / 2);
    expect(half.gravity).toBeCloseTo(physics.gravity / 2);
    // Same jump duration for a proportionally scaled jump.
    const a = solveJump({ x: 0, y: 0 }, { x: 100, y: -80 }, 30, physics.gravity);
    const b = solveJump({ x: 0, y: 0 }, { x: 50, y: -40 }, 15, half.gravity);
    expect(b.duration).toBeCloseTo(a.duration);
  });
});
