/**
 * Walk cycle tuning, shared by physics (how fast she moves) and the renderer (how her
 * legs move), so feet never slide. Values are relative to the standing height and based
 * on gait biomechanics: a natural step is ~0.41 × height, a bit shorter in high heels,
 * at roughly two steps per second; a foot is on the ground ~60 % of the cycle. High heels
 * shorten the step at the same cadence and lengthen the double support.
 *
 * Mutable on purpose: the playground tweaks it live. Not part of the public API.
 */
export interface GaitTuning {
  /** Step length (one foot to the other) as a fraction of the standing height. */
  stepLength: number;
  /** Steps per second. */
  cadence: number;
  /** Fraction of a full cycle each foot spends on the ground (> 0.5 → double support). */
  stance: number;
  /** Peak-to-peak vertical hip bob as a fraction of the standing height. */
  bob: number;
}

export const DEFAULT_GAIT: Readonly<GaitTuning> = {
  stepLength: 0.31,
  cadence: 1.75,
  stance: 0.64,
  bob: 0.025,
};

export const GAIT: GaitTuning = { ...DEFAULT_GAIT };

/** Walking speed in px/s for a character of the given height. */
export function walkSpeed(height: number, gait: GaitTuning = GAIT): number {
  return gait.stepLength * height * gait.cadence;
}

/** Distance in px covered by one full cycle (two steps). */
export function cycleLength(height: number, gait: GaitTuning = GAIT): number {
  return 2 * gait.stepLength * height;
}
