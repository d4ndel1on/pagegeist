import type { Mascot } from './Mascot';
import { clamp, type Platform } from './types';

/** What happens after walking to the target. */
export type FollowUp =
  | { type: 'none' }
  | { type: 'sit' }
  | { type: 'jump'; platformId: string; landX: number }
  | { type: 'grab'; platformId: string; anchorOffsetX: number }
  | { type: 'hangOwnEdge'; side: 'left' | 'right' }
  | { type: 'drop'; side: 'left' | 'right' };

export interface Plan {
  /** Target x on the current platform (document space). */
  walkToX: number;
  next: FollowUp;
  label: string;
}

const KIND_PREFERENCE: Record<Platform['kind'], number> = {
  button: 1.7,
  heading: 1.5,
  card: 1.25,
  'text-line': 1,
  generic: 1,
  floor: 0.45,
};

/**
 * The mascot's "brain": picks the next activity while idle.
 * Weighted random choice; neighbor platforms are weighted by distance and element kind
 * (buttons and headings are more popular than body text). Disabled behaviors get weight 0.
 */
export function decide(m: Mascot): Plan | null {
  if (m.motion === 'static') return null;
  const p = m.ground;
  if (!p) return null;
  const b = m.behaviors;
  const x = m.body.pos.x;
  const width = p.right - p.left;
  const calm = m.motion === 'calm' ? 0.35 : 1;

  const options: Array<{ weight: number; value: () => Plan | null }> = [
    { weight: b.walk && width > 70 ? 2.5 : 0, value: () => wander(m, p, x) },
    { weight: b.jump ? 4.5 * calm : 0, value: () => jumpToNeighbor(m, p) },
    { weight: b.sit && p.sittable && width > 50 ? 1.8 : 0, value: () => sit(m, p) },
    { weight: b.hang && p.hangable && m.motion === 'full' ? 1.3 : 0, value: () => hangOwnEdge(m, p) },
    { weight: b.drop && p.kind !== 'floor' ? 0.7 * calm : 0, value: () => drop(m, p) },
    { weight: 1.2 / calm, value: () => null }, // just keep chilling
  ];
  return m.rng.weighted(options)?.() ?? null;
}

function wander(m: Mascot, p: Platform, x: number): Plan {
  let target = m.rng.range(p.left + 12, p.right - 12);
  if (Math.abs(target - x) < 40) target = x < (p.left + p.right) / 2 ? p.right - 14 : p.left + 14;
  return { walkToX: target, next: { type: 'none' }, label: 'wander' };
}

function sit(m: Mascot, p: Platform): Plan {
  return { walkToX: m.rng.range(p.left + 20, p.right - 20), next: { type: 'sit' }, label: 'sit' };
}

function hangOwnEdge(m: Mascot, p: Platform): Plan | null {
  const view = m.world.safeViewport();
  const side = m.rng.chance(0.5) ? 'left' : 'right';
  const edgeX = side === 'left' ? p.left + 8 : p.right - 8;
  if (p.top + m.metrics.hangReach + 4 > view.bottom) return null; // would hang out of view
  return { walkToX: edgeX, next: { type: 'hangOwnEdge', side }, label: `hang ${side}` };
}

function drop(m: Mascot, p: Platform): Plan | null {
  const view = m.world.viewport();
  const side = m.rng.chance(0.5) ? 'left' : 'right';
  const edgeX = side === 'left' ? p.left + 3 : p.right - 3;
  if (edgeX < view.left + 20 || edgeX > view.right - 20) return null;
  return { walkToX: edgeX, next: { type: 'drop', side }, label: `drop ${side}` };
}

function jumpToNeighbor(m: Mascot, p: Platform): Plan | null {
  const reach = m.metrics.hangReach;
  const { maxJumpDistance, maxJumpUp, maxGrabJump } = m.physics;
  const allowGrab = m.behaviors.hang && m.motion === 'full';
  const candidates: Array<{ weight: number; value: Plan }> = [];

  for (const q of m.world.all) {
    if (q.id === p.id || q.right - q.left < 34) continue;
    // The target must keep her fully visible (also not under sticky headers).
    if (!m.canLand(q)) continue;

    const takeoff = takeoffAndLanding(m, p, q);
    if (!takeoff) continue;
    const { takeoffX, landX } = takeoff;
    const dx = Math.abs(landX - takeoffX);
    const rise = p.top - q.top;
    if (dx > maxJumpDistance || rise < -520 * m.physics.scale) continue;

    let next: FollowUp;
    if (rise <= maxJumpUp) {
      next = { type: 'jump', platformId: q.id, landX };
    } else if (allowGrab && q.hangable && rise <= reach + maxGrabJump) {
      // Too high to jump onto → jump up, grab the edge, pull up.
      const anchorX = clamp(landX, q.left + 10, q.right - 10);
      next = { type: 'grab', platformId: q.id, anchorOffsetX: anchorX - q.left };
    } else {
      continue;
    }

    const dist = dx + Math.abs(rise);
    candidates.push({
      weight: KIND_PREFERENCE[q.kind] / (1 + dist / (170 * m.physics.scale)),
      value: { walkToX: takeoffX, next, label: `${next.type} → ${q.kind}` },
    });
  }
  return m.rng.weighted(candidates);
}

/** Determine take-off and landing points between two platforms. */
function takeoffAndLanding(m: Mascot, p: Platform, q: Platform): { takeoffX: number; landX: number } | null {
  const pL = p.left + 8;
  const pR = p.right - 8;
  const qL = q.left + 14;
  const qR = q.right - 14;
  if (qR <= qL) return null;
  const overlapL = Math.max(pL, qL);
  const overlapR = Math.min(pR, qR);
  const goingDown = q.top > p.top;

  if (overlapR - overlapL > 8 && !goingDown) {
    // Target directly above → jump straight up (one-way platforms)
    const x = m.rng.range(overlapL, overlapR);
    return { takeoffX: x, landX: x };
  }
  if (goingDown && q.left < p.left && q.right > p.right) {
    // Target below and wider → jump off an edge
    const side = m.rng.chance(0.5) ? -1 : 1;
    const takeoffX = side < 0 ? p.left + 4 : p.right - 4;
    const landX = clamp(takeoffX + side * 40, qL, qR);
    if ((side < 0 && landX > p.left - 12) || (side > 0 && landX < p.right + 12)) return null;
    return { takeoffX, landX };
  }
  if (q.left >= p.right - 8) return { takeoffX: pR, landX: qL }; // to the right
  if (q.right <= p.left + 8) return { takeoffX: pL, landX: qR }; // to the left
  if (goingDown) {
    // Partially overlapping below → land on the protruding side
    if (q.right > p.right + 24) return { takeoffX: p.right - 4, landX: clamp(p.right + 24, qL, qR) };
    if (q.left < p.left - 24) return { takeoffX: p.left + 4, landX: clamp(p.left - 24, qL, qR) };
  }
  return null;
}
