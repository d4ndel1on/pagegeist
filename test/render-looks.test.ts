import { describe, expect, it } from 'vitest';
import { GothRenderer } from '../src/core/render/GothRenderer';
import type { Look, Mood, RenderState } from '../src/core/render/types';
import { MascotState } from '../src/core/types';
import { baseState, drawLog, dumpLog, HEIGHT, hash, poseSequence } from './render-helpers';

/**
 * Visual regression goldens: a hash of every canvas call per look and pose set. On a
 * mismatch the failure message names a file in the OS temp dir with the full call log
 * (one call per line); run the same test on the previous code and diff the two files.
 * Intended changes: `npx vitest run test/render-looks.test.ts -u`.
 */

const COMBOS: Look[] = (['classic', 'corset'] as const).flatMap((outfit) =>
  (['boots', 'heels'] as const).flatMap((shoes) => [false, true].map((fishnets) => ({ outfit, shoes, fishnets }))),
);
const label = (l: Look) => `${l.outfit}-${l.shoes}-${l.fishnets ? 'fishnets' : 'bare'}`;

function renderer(look?: Look): GothRenderer {
  const r = new GothRenderer(HEIGHT);
  if (look) r.look = { ...look };
  return r;
}

function expectGolden(name: string, r: GothRenderer, seq: RenderState[]): void {
  const log = drawLog(r, seq);
  const file = dumpLog(name, log);
  expect(log.length).toBeGreaterThan(50);
  expect(hash(log), `call log of "${name}" written to ${file}`).toMatchSnapshot();
}

describe('all looks over the pose sequence', () => {
  for (const look of COMBOS) {
    it(label(look), () => expectGolden(label(look), renderer(look), poseSequence()));
  }
});

/** A few frames of one state, so the inertialization settles onto the varied pose. */
function frames(patch: Partial<RenderState>, state: MascotState = MascotState.IDLE, n = 4): RenderState[] {
  return Array.from({ length: n }, (_, i) => ({ ...baseState(state, 2 + i / 60), ...patch }));
}

const EXTENDED: Array<[string, RenderState[]]> = [
  ...(['neutral', 'happy', 'annoyed', 'surprised'] as Mood[]).map((mood): [string, RenderState[]] => [
    `mood ${mood}`,
    frames({ mood }),
  ]),
  ['blink', frames({ blink: true })],
  ['look at cursor ahead', frames({ lookAt: { x: 200, y: -150 } })],
  ['look at cursor behind', frames({ lookAt: { x: -200, y: -50 } })],
  ['look at cursor below', frames({ lookAt: { x: 40, y: 120 } })],
  ['landing squash', frames({ squash: 0.8 })],
  ['attitude (hand on hip)', frames({ attitude: 1 })],
  ['hair sway forward', frames({ hairSway: 1 }, MascotState.WALK)],
  ['hair sway back', frames({ hairSway: -1, facing: -1 }, MascotState.FALL)],
  ...[0, 0.25, 0.5, 0.75, 1].map((climbProgress): [string, RenderState[]] => [
    `climb ${climbProgress}`,
    frames({ climbProgress, handTarget: { x: 10, y: -170 } }, MascotState.CLIMB),
  ]),
  ['calm idle', frames({ calm: true, hairSway: 0.5 })],
];

describe('classic look, extended poses', () => {
  for (const [name, seq] of EXTENDED) {
    it(name, () => expectGolden(`classic-${name}`, renderer(), seq));
  }
});
