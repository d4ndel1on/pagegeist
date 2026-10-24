import type { Platform, Vec2 } from './types';

/**
 * Lightweight custom kinematics instead of a rigid-body engine: the mascot is a single
 * point body (her feet) on one-way platforms. For a character this is far easier to
 * control than Matter.js & co. – movement is driven by the state machine, physics only
 * provides gravity, landings and jump arcs.
 */
export interface PhysicsConfig {
  gravity: number;
  maxFallSpeed: number;
  shimmySpeed: number;
  /** Max. height reachable without grabbing (feet → platform). */
  maxJumpUp: number;
  /** Max. horizontal jump distance. */
  maxJumpDistance: number;
  /** Max. jump height when grabbing an edge (on top of the character's hangReach). */
  maxGrabJump: number;
  /** Multiplier relative to the reference size; use it for other hand-tuned distances. */
  scale: number;
}

/** Tuned for the reference character height of 168 px. */
const BASE: Omit<PhysicsConfig, 'scale'> = {
  gravity: 2300,
  maxFallSpeed: 1700,
  shimmySpeed: 42,
  maxJumpUp: 150,
  maxJumpDistance: 340,
  maxGrabJump: 150,
};

export const REFERENCE_HEIGHT = 168;

/**
 * Scaling every length *and* gravity by the same factor keeps jump durations and the
 * look of the motion identical – a smaller mascot simply covers less ground.
 */
export function createPhysics(height: number): PhysicsConfig {
  const k = height / REFERENCE_HEIGHT;
  return {
    gravity: BASE.gravity * k,
    maxFallSpeed: BASE.maxFallSpeed * k,
    shimmySpeed: BASE.shimmySpeed * k,
    maxJumpUp: BASE.maxJumpUp * k,
    maxJumpDistance: BASE.maxJumpDistance * k,
    maxGrabJump: BASE.maxGrabJump * k,
    scale: k,
  };
}

export interface Body {
  /** Feet position (bottom-center) in document space. */
  pos: Vec2;
  vel: Vec2;
}

export interface JumpSolution {
  vx: number;
  vy: number;
  /** Time until the target is reached, in seconds. */
  duration: number;
}

/**
 * Computes a ballistic arc from `from` to `to`.
 * `clearance` = how far the apex lies above the higher of the two points.
 * With a small clearance the body arrives close to the apex – ideal for grabbing an edge.
 */
export function solveJump(from: Vec2, to: Vec2, clearance: number, gravity: number): JumpSolution {
  const rise = from.y - to.y; // > 0 if the target is higher
  const apex = Math.max(0, rise) + clearance;
  const vy0 = Math.sqrt(2 * gravity * apex);
  const tUp = vy0 / gravity;
  const tDown = Math.sqrt((2 * Math.max(0, apex - rise)) / gravity);
  const duration = Math.max(0.18, tUp + tDown);
  return { vx: (to.x - from.x) / duration, vy: -vy0, duration };
}

/**
 * Applies gravity and moves the body. Returns the platform it landed on, or null.
 * `canLand` lets the caller veto platforms (e.g. ones hidden under a sticky header).
 */
export function stepAirborne(
  body: Body,
  dt: number,
  platforms: readonly Platform[],
  physics: Pick<PhysicsConfig, 'gravity' | 'maxFallSpeed'>,
  canLand: (p: Platform) => boolean,
): Platform | null {
  const prevY = body.pos.y;
  body.vel.y = Math.min(body.vel.y + physics.gravity * dt, physics.maxFallSpeed);
  body.pos.x += body.vel.x * dt;
  body.pos.y += body.vel.y * dt;

  if (body.vel.y <= 0) return null; // moving up: one-way platforms are passed through

  let landing: Platform | null = null;
  for (const p of platforms) {
    if (body.pos.x < p.left + 2 || body.pos.x > p.right - 2) continue;
    if (p.top < prevY - 0.5 || p.top > body.pos.y) continue;
    if (landing && p.top >= landing.top) continue;
    if (!canLand(p)) continue;
    landing = p;
  }
  if (landing) {
    body.pos.y = landing.top;
    body.vel.x = 0;
    body.vel.y = 0;
  }
  return landing;
}
