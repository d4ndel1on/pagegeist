/**
 * Shared types of the mascot simulation.
 *
 * Coordinate systems:
 *  - "Document space": page coordinates including scroll (clientX + scrollX). Physics,
 *    and platforms live here, so the mascot "sticks" to her element while
 *    the page scrolls.
 *  - "Screen space": viewport coordinates (getBoundingClientRect / canvas).
 *    Converted only when rendering: screen = doc - scroll.
 */

/** 2D vector (px or px/s). */
export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PlatformKind = 'heading' | 'text-line' | 'button' | 'card' | 'generic' | 'floor';

/** Walkable top edge of a DOM element (one-way platform) in document space. */
export interface Platform {
  /** Stable ID that survives rescans, so the mascot can find "her" element again. */
  readonly id: string;
  readonly kind: PlatformKind;
  left: number;
  right: number;
  /** y of the top edge = the surface she stands on. */
  top: number;
  bottom: number;
  readonly element: Element | null;
  /** May the mascot hang from / shimmy along this edge? */
  readonly hangable: boolean;
  /** May she sit on it? */
  readonly sittable: boolean;
}

/** Names of all activities, e.g. `PagegeistStates.WALK`. Public as `PagegeistStates`. */
export const PagegeistStates = {
  IDLE: 'IDLE',
  WALK: 'WALK',
  JUMP: 'JUMP',
  FALL: 'FALL',
  HANG_ON_EDGE: 'HANG_ON_EDGE',
  /** Pulling up from hanging onto the platform (also played backwards to lower down). */
  CLIMB: 'CLIMB',
  SIT_ON_ELEMENT: 'SIT_ON_ELEMENT',
  /** Held by the user via drag. */
  GRABBED: 'GRABBED',
} as const;
/** Current activity of the mascot. */
export type PagegeistState = (typeof PagegeistStates)[keyof typeof PagegeistStates];
/** Internal alias of {@link PagegeistStates} / {@link PagegeistState}. */
export { PagegeistStates as MascotState };
export type MascotState = PagegeistState;

export type Facing = 1 | -1;

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Critically damped spring (Daniel Holden, "Spring-It-On"): moves `x` with velocity `v`
 * toward `goal`, roughly halving the distance every `halflife` seconds. Returns [x, v].
 */
export function spring(x: number, v: number, goal: number, halflife: number, dt: number): [number, number] {
  const y = (2 * Math.LN2) / halflife;
  const j = v + (x - goal) * y;
  const e = Math.exp(-y * dt);
  return [goal + e * (x - goal + j * dt), e * (v - j * y * dt)];
}

/** Spring tuning for `wobble`: [frequency (Hz), damping ratio (< 1 overshoots)]. */
export type Wobble = readonly [number, number];

/**
 * Underdamped spring (semi-implicit Euler) for secondary motion: oscillates at `freq` Hz
 * around `goal`; `damping` < 1 overshoots and rings out. Returns [x, v].
 */
export function wobble(x: number, v: number, goal: number, [freq, damping]: Wobble, dt: number): [number, number] {
  const w = 2 * Math.PI * freq;
  v += (w * w * (goal - x) - 2 * damping * w * v) * dt;
  return [x + v * dt, v];
}
