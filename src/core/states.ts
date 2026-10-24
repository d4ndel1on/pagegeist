import { decide } from './behavior';
import type { Mascot } from './Mascot';
import type { State } from './StateMachine';
import { clamp, lerp, MascotState, smoothstep } from './types';

type S = State<Mascot>;

/** Airborne step; returns true if she landed (and already switched state). */
function airborne(m: Mascot, dt: number): boolean {
  const vyBefore = m.body.vel.y;
  const landed = m.stepAir(dt);
  if (landed) {
    m.land(landed, vyBefore);
    return true;
  }
  return false;
}

/** If the platform under her feet vanished (or slid under a sticky header) → FALL. */
function requireGround(m: Mascot): boolean {
  if (!m.ground) {
    m.leaveGround();
    m.fsm.transition(MascotState.FALL);
    return false;
  }
  return !m.escapeHiddenGround();
}

const IDLE: S = {
  enter(m) {
    m.body.vel = { x: 0, y: 0 };
    m.plan = null;
    m.jump = null;
    m.idleUntil = m.rng.range(1.2, 3.5) * (m.motion === 'calm' ? 2.5 : 1) * m.temper.patience;
  },
  update(m, dt) {
    if (!requireGround(m)) return;
    m.watchCursor(dt, true);
    m.maybeChatter(dt);
    if (m.fsm.time < m.idleUntil) return;
    const plan = decide(m);
    if (plan) {
      m.plan = plan;
      m.fsm.transition(MascotState.WALK);
    } else {
      m.idleUntil = m.fsm.time + m.rng.range(1, 2.5) * m.temper.patience;
    }
  },
};

const WALK: S = {
  update(m, dt) {
    if (!requireGround(m)) return;
    const p = m.ground!;
    const plan = m.plan;
    if (!plan || m.fsm.time > 10) {
      m.fsm.transition(MascotState.IDLE);
      return;
    }
    const target = clamp(plan.walkToX, p.left + 3, p.right - 3);
    if (!m.walkToward(target, dt, plan.pace)) return;

    const next = plan.next;
    switch (next.type) {
      case 'none':
        m.fsm.transition(MascotState.IDLE);
        return;
      case 'sit':
        m.fsm.transition(MascotState.SIT_ON_ELEMENT);
        return;
      case 'jump': {
        const q = m.world.get(next.platformId);
        if (!q) return m.fsm.transition(MascotState.IDLE);
        const landX = clamp(next.landX, q.left + 10, q.right - 10);
        m.startJump({ x: landX, y: q.top }, q.top < p.top ? 28 : 36);
        return;
      }
      case 'grab': {
        const q = m.world.get(next.platformId);
        if (!q) return m.fsm.transition(MascotState.IDLE);
        const ax = q.left + next.anchorOffsetX;
        m.startJump({ x: ax, y: q.top + m.metrics.hangReach }, 10, {
          platformId: q.id,
          offsetX: next.anchorOffsetX,
        });
        return;
      }
      case 'hangOwnEdge': {
        // Turn around and lower herself down the edge she stands on
        m.facing = next.side === 'left' ? 1 : -1;
        m.attachHang(p, m.body.pos.x - p.left, true);
        return;
      }
      case 'drop': {
        const dir = next.side === 'left' ? -1 : 1;
        const k = m.physics.scale;
        m.facing = dir;
        m.leaveGround();
        m.body.vel = { x: dir * 110 * k, y: -240 * k };
        m.fsm.transition(MascotState.FALL);
        return;
      }
    }
  },
};

const JUMP: S = {
  update(m, dt) {
    const j = m.jump;
    if (!j) return m.fsm.transition(MascotState.FALL);
    if (!j.airborne) {
      j.crouchLeft -= dt;
      if (j.crouchLeft <= 0) m.takeOff();
      return;
    }
    j.airTime += dt;
    if (Math.abs(m.body.vel.x) > 20) m.facing = m.body.vel.x > 0 ? 1 : -1;

    if (j.grab && j.solution && j.airTime >= j.solution.duration) {
      const q = m.world.get(j.grab.platformId);
      if (q) {
        m.attachHang(q, j.grab.offsetX);
        return;
      }
      j.grab = null;
    }
    if (airborne(m, dt)) return;
    if (j.solution && j.airTime > j.solution.duration + 0.4) m.fsm.transition(MascotState.FALL);
  },
};

const FALL: S = {
  enter(m) {
    m.leaveGround();
    m.jump = null;
  },
  update(m, dt) {
    if (m.fsm.time > 0.55 && m.mood === 'neutral') m.setMood('surprised', 0.6);
    airborne(m, dt);
  },
};

const HANG_ON_EDGE: S = {
  enter(m) {
    const h = m.hang;
    if (h) h.until = m.rng.range(1.8, 4.5);
    m.shimmyPhase = 0;
  },
  update(m, dt) {
    const h = m.hang;
    const p = h ? m.world.get(h.platformId) : null;
    if (!h || !p) return m.fsm.transition(MascotState.FALL);
    m.watchCursor(dt, false);

    // Shimmy: hand over hand along the edge
    if (h.shimmyTo !== null) {
      const dx = h.shimmyTo - h.offsetX;
      const step = Math.min(Math.abs(dx), m.physics.shimmySpeed * dt);
      h.offsetX += Math.sign(dx) * step;
      m.shimmyPhase += (step * 0.28) / m.physics.scale;
      m.facing = dx >= 0 ? 1 : -1;
      if (Math.abs(dx) < 0.5) h.shimmyTo = null;
    }
    h.anchor = { x: p.left + h.offsetX, y: p.top };
    m.body.pos = { x: h.anchor.x, y: h.anchor.y + m.metrics.hangReach };

    if (h.shimmyTo !== null || m.fsm.time < h.until) return;
    const width = p.right - p.left;
    const r = m.rng.next();
    if (h.shimmies < 2 && width > 90 && r < 0.4) {
      let to = m.rng.range(12, width - 12);
      if (Math.abs(to - h.offsetX) < 40) to = h.offsetX < width / 2 ? width - 14 : 14;
      h.shimmyTo = to;
      h.shimmies++;
      h.until = m.fsm.time + m.rng.range(0.8, 2.2);
    } else if (r < 0.8 && m.canLand(p)) {
      m.climbDir = 1;
      m.fsm.transition(MascotState.CLIMB);
    } else {
      m.hang = null;
      m.fsm.transition(MascotState.FALL);
    }
  },
};

const CLIMB_DURATION = 1.0;

const CLIMB: S = {
  enter(m) {
    m.climbProgress = m.climbDir > 0 ? 0 : 1;
  },
  update(m) {
    const h = m.hang;
    const p = h ? m.world.get(h.platformId) : null;
    if (!h || !p) {
      m.hang = null;
      return m.fsm.transition(MascotState.FALL);
    }
    h.anchor = { x: p.left + h.offsetX, y: p.top };
    const t = clamp(m.fsm.time / CLIMB_DURATION, 0, 1);
    // Played backwards = lowering herself down from the edge
    const progress = m.climbDir > 0 ? t : 1 - t;
    m.climbProgress = progress;
    // Pull up first (fast), then mantle onto the element (slower)
    const rise = smoothstep(0, 0.6, progress) * 0.75 + smoothstep(0.55, 1, progress) * 0.25;
    m.body.pos = { x: h.anchor.x, y: lerp(h.anchor.y + m.metrics.hangReach, h.anchor.y, rise) };
    if (t < 1) return;
    if (m.climbDir > 0) {
      m.hang = null;
      m.standOn(p, h.anchor.x);
      m.fsm.transition(MascotState.IDLE);
    } else {
      m.climbDir = 1;
      m.fsm.transition(MascotState.HANG_ON_EDGE);
    }
  },
  exit(m) {
    m.climbProgress = 0;
  },
};

const SIT_ON_ELEMENT: S = {
  enter(m) {
    m.sitUntil = m.rng.range(4.5, 10);
    if (m.rng.chance(0.35)) m.speak('sit', m.ground?.element ?? null, 2);
  },
  update(m, dt) {
    if (!requireGround(m)) return;
    m.watchCursor(dt, true);
    if (m.fsm.time > m.sitUntil) m.fsm.transition(MascotState.IDLE);
  },
};

const GRABBED: S = {
  enter(m) {
    m.setMood('annoyed', 9999);
  },
  update() {
    // Position is set by the engine via dragTo().
  },
  exit(m) {
    m.setMood('surprised', 0.8);
  },
};

export const MASCOT_STATES: Record<MascotState, S> = {
  IDLE,
  WALK,
  JUMP,
  FALL,
  HANG_ON_EDGE,
  CLIMB,
  SIT_ON_ELEMENT,
  GRABBED,
};
