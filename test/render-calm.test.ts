import { describe, expect, it } from 'vitest';
import { GothRenderer } from '../src/core/render/GothRenderer';
import type { RenderState } from '../src/core/render/types';
import { MascotState } from '../src/core/types';
import { baseState, drawLog, HEIGHT, hash, poseSequence } from './render-helpers';

/** Log of the last of `n` frames (springs and blending settled) at time `t`. */
function settled(patch: Partial<RenderState>, t: number, n = 40): string {
  const r = new GothRenderer(HEIGHT);
  const seq = Array.from({ length: n }, (_, i) => ({
    ...baseState(patch.state ?? MascotState.IDLE, t + i / 60),
    ...patch,
  }));
  drawLog(r, seq.slice(0, -1));
  return hash(drawLog(r, seq.slice(-1)));
}

describe('reduced motion (RenderState.calm)', () => {
  it('calm: false draws exactly like an unset flag (golden hash path)', () => {
    const plain = drawLog(new GothRenderer(HEIGHT), poseSequence());
    const off = drawLog(
      new GothRenderer(HEIGHT),
      poseSequence().map((rs) => ({ ...rs, calm: false })),
    );
    expect(off).toEqual(plain);
  });

  const AMBIENT: Array<[string, Partial<RenderState>]> = [
    ['idle breathing and sway', { state: MascotState.IDLE }],
    ['hang sway', { state: MascotState.HANG_ON_EDGE, handTarget: { x: 10, y: -170 } }],
    ['sitting leg swing', { state: MascotState.SIT_ON_ELEMENT }],
    ['grabbed flailing', { state: MascotState.GRABBED }],
  ];

  for (const [name, patch] of AMBIENT) {
    it(`holds ${name} at rest`, () => {
      expect(settled(patch, 1)).not.toBe(settled(patch, 1.7));
      expect(settled({ ...patch, calm: true }, 1)).toBe(settled({ ...patch, calm: true }, 1.7));
    });
  }

  it('ignores the hair sway input', () => {
    expect(settled({ calm: true, hairSway: 0.8 }, 1)).toBe(settled({ calm: true }, 1));
    expect(settled({ hairSway: 0.8 }, 1)).not.toBe(settled({}, 1));
  });

  it('keeps the hair and hem springs still on a pose change', () => {
    const r = new GothRenderer(HEIGHT);
    const crouch = { ...baseState(MascotState.JUMP, 1), jumpCrouch: 1 };
    const stand = baseState(MascotState.IDLE, 1.02);
    const springs = () => (r as unknown as { sec: Array<[number, number]> }).sec;
    drawLog(r, [crouch, stand]);
    expect(springs().some(([, v]) => v !== 0)).toBe(true);
    drawLog(r, [
      { ...crouch, calm: true },
      { ...stand, calm: true },
    ]);
    expect(springs().every(([, v]) => v === 0)).toBe(true);
  });
});
