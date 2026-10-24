import type { Plan } from './behavior';
import { cycleLength, GAIT, walkSpeed } from './gait';
import type { PagegeistEventMap, PagegeistEventName, PhraseTrigger, ResolvedOptions } from './options';
import { resolvePhrase } from './phrases';
import { type Body, type JumpSolution, type PhysicsConfig, solveJump, stepAirborne } from './physics';
import type { Random } from './random';
import type { MascotMetrics, Mood, RenderState } from './render/types';
import { SWAY, WALK } from './render/walk';
import { StateMachine } from './StateMachine';
import { MASCOT_STATES } from './states';
import { clamp, type Facing, lerp, MascotState, type Platform, spring, type Vec2, wobble } from './types';
import type { DomCollisionWorld } from './World';

interface HangInfo {
  platformId: string;
  /** Grip point relative to platform.left (moves along with the element). */
  offsetX: number;
  /** Current grip point in document space. */
  anchor: Vec2;
  shimmyTo: number | null;
  shimmies: number;
  until: number;
}

interface JumpInfo {
  target: Vec2;
  clearance: number;
  grab: { platformId: string; offsetX: number } | null;
  crouchLeft: number;
  airborne: boolean;
  airTime: number;
  solution: JumpSolution | null;
}

/**
 * How much she moves on her own. Derived from `prefers-reduced-motion` and the
 * `reducedMotion` option by the engine.
 */
export type MotionLevel = 'full' | 'calm' | 'static';

type Emit = <K extends PagegeistEventName>(type: K, event: PagegeistEventMap[K]) => void;

const CROUCH_TIME = 0.13;
const OCCUPIED_ATTRIBUTE = 'data-pagegeist-occupied';
const LANDED_ATTRIBUTE = 'data-pagegeist-landed';
const LANDED_MARK_TIME = 0.26;

/**
 * The mascot as an entity: body, state machine, animation parameters.
 * State logic lives in states.ts, decisions in behavior.ts.
 */
export class Mascot {
  readonly body: Body = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 } };
  readonly fsm: StateMachine<Mascot, MascotState>;
  facing: Facing = 1;
  groundId: string | null = null;
  private groundOffsetX = 0;
  plan: Plan | null = null;
  hang: HangInfo | null = null;
  jump: JumpInfo | null = null;

  /** Live options; replaced by the engine on update(). */
  options: ResolvedOptions;
  motion: MotionLevel = 'full';

  // Animation/expression parameters
  climbProgress = 0;
  /** 1 = pull up, -1 = lower down. */
  climbDir: 1 | -1 = 1;
  shimmyPhase = 0;
  gait = 0;
  /** Step length scale (see RenderState.stride). */
  stride = 1;
  /** Signed walking speed (px/s) and its spring velocity. */
  speed = 0;
  private speedVel = 0;
  squash = 0;
  attitude = 0;
  idleUntil = 0;
  sitUntil = 0;
  mood: Mood = 'neutral';
  private moodUntil = 0;
  private hairSway = 0;
  private hairVel = 0;
  private blinkAt = 2;
  private prevPos: Vec2 = { x: 0, y: 0 };
  private visualVel: Vec2 = { x: 0, y: 0 };
  private walkedAt = -1;
  private cursorNearTime = 0;
  private lastChatAt = -99;
  private worldRevision = -1;
  private occupied: Element | null = null;
  private landed: { element: Element; until: number } | null = null;

  /** Cursor in document space (null = outside the window). */
  cursor: Vec2 | null = null;
  bubble: { text: string; born: number; until: number } | null = null;
  time = 0;

  constructor(
    readonly world: DomCollisionWorld,
    readonly metrics: MascotMetrics,
    readonly physics: PhysicsConfig,
    readonly rng: Random,
    options: ResolvedOptions,
    private readonly emit: Emit,
  ) {
    this.options = options;
    this.fsm = new StateMachine<Mascot, MascotState>(this, MASCOT_STATES, MascotState.FALL, (from, to) =>
      this.emit('stateChange', { from, to }),
    );
  }

  get state(): MascotState {
    return this.fsm.current;
  }

  get ground(): Platform | null {
    return this.world.get(this.groundId);
  }

  get behaviors(): ResolvedOptions['behaviors'] {
    return this.options.behaviors;
  }

  start(spawnX: number | null): void {
    this.respawn(spawnX);
    this.fsm.start();
  }

  /** Drop into the visible area from above (or appear on a platform when static). */
  respawn(spawnX: number | null = null): void {
    const v = this.world.viewport();
    this.leaveGround();
    this.hang = null;
    this.jump = null;
    const x = spawnX ?? v.left + (v.right - v.left) * this.rng.range(0.25, 0.75);
    if (this.motion === 'static' && this.placeOnPlatform(x)) return;
    this.body.pos = { x, y: v.top - 20 };
    this.body.vel = { x: 0, y: 0 };
    this.prevPos = { ...this.body.pos };
    if (this.fsm.current !== MascotState.FALL) this.fsm.transition(MascotState.FALL);
  }

  /** Teleport onto the visible platform closest to x (no falling animation). */
  private placeOnPlatform(x: number): boolean {
    let best: Platform | null = null;
    let bestScore = Infinity;
    for (const p of this.world.all) {
      if (p.kind === 'floor' || p.right - p.left < 40 || !this.canLand(p)) continue;
      const cx = clamp(x, p.left + 12, p.right - 12);
      const score = Math.abs(cx - x) + (p.kind === 'text-line' ? 200 : 0);
      if (score < bestScore) {
        best = p;
        bestScore = score;
      }
    }
    best ??= this.world.get('floor');
    if (!best) return false;
    this.standOn(best, clamp(x, best.left + 12, best.right - 12));
    this.prevPos = { ...this.body.pos };
    if (this.fsm.current !== MascotState.IDLE) this.fsm.transition(MascotState.IDLE);
    return true;
  }

  update(dt: number): void {
    this.time += dt;
    this.syncWithWorld();
    this.fsm.update(dt);
    this.updateSecondary(dt);
  }

  // ------------------------------------------------------------ Ground & platforms

  /**
   * Whether she may land on / stand on a platform: she must stay fully visible, i.e. not
   * have her head under a sticky header or stand behind a bottom bar.
   */
  canLand(p: Platform): boolean {
    if (p.kind === 'floor') return true;
    const safe = this.world.safeViewport();
    return p.top - this.metrics.height - 4 >= safe.top && p.top <= safe.bottom + 1;
  }

  standOn(p: Platform, x: number = this.body.pos.x): void {
    this.groundId = p.id;
    this.body.pos.x = clamp(x, p.left + 2, p.right - 2);
    this.body.pos.y = p.top;
    this.body.vel.x = 0;
    this.body.vel.y = 0;
    this.groundOffsetX = this.body.pos.x - p.left;
    this.setOccupied(p.element);
  }

  leaveGround(): void {
    this.groundId = null;
    this.setOccupied(null);
  }

  /** Call after moving on the platform so the offset stays correct. */
  updateGroundOffset(): void {
    const p = this.ground;
    if (p) this.groundOffsetX = this.body.pos.x - p.left;
  }

  /**
   * After a rescan: find the platform again via its ID and move along with it
   * (sticky navbar, reflow, resize). Vanished platform → fall.
   */
  private syncWithWorld(): void {
    if (this.world.revision === this.worldRevision) return;
    this.worldRevision = this.world.revision;

    if (this.groundId) {
      const p = this.ground;
      if (!p) {
        this.leaveGround();
        if (this.state !== MascotState.GRABBED) this.fsm.transition(MascotState.FALL);
      } else {
        this.body.pos.x = clamp(p.left + this.groundOffsetX, p.left + 2, p.right - 2);
        this.body.pos.y = p.top;
      }
    }
    if (this.hang) {
      const p = this.world.get(this.hang.platformId);
      if (!p) {
        this.hang = null;
        this.fsm.transition(MascotState.FALL);
      } else {
        this.hang.offsetX = clamp(this.hang.offsetX, 4, p.right - p.left - 4);
        this.hang.anchor = { x: p.left + this.hang.offsetX, y: p.top };
      }
    }
  }

  /**
   * Scrolled so that her platform slid under a sticky header? Hop down instead of
   * standing there with her head hidden. Returns true if she left the platform.
   */
  escapeHiddenGround(): boolean {
    const p = this.ground;
    if (!p || this.canLand(p)) return false;
    this.leaveGround();
    const k = this.physics.scale;
    this.body.vel = { x: this.facing * 60 * k, y: -150 * k };
    this.fsm.transition(MascotState.FALL);
    return true;
  }

  private setOccupied(el: Element | null): void {
    if (this.occupied === el) return;
    this.occupied?.removeAttribute(OCCUPIED_ATTRIBUTE);
    this.occupied = el;
    if (this.options.markElements) el?.setAttribute(OCCUPIED_ATTRIBUTE, '');
  }

  /** Removes every attribute this mascot put on host elements. */
  clearMarks(): void {
    this.occupied?.removeAttribute(OCCUPIED_ATTRIBUTE);
    this.occupied = null;
    this.landed?.element.removeAttribute(LANDED_ATTRIBUTE);
    this.landed = null;
  }

  // ------------------------------------------------------------ Actions

  startJump(target: Vec2, clearance: number, grab: JumpInfo['grab'] = null): void {
    this.jump = {
      target,
      clearance: clearance * this.physics.scale,
      grab,
      crouchLeft: CROUCH_TIME,
      airborne: false,
      airTime: 0,
      solution: null,
    };
    if (Math.abs(target.x - this.body.pos.x) > 2) this.facing = target.x > this.body.pos.x ? 1 : -1;
    this.fsm.transition(MascotState.JUMP);
  }

  /** Called by JUMP when the crouch is done. */
  takeOff(): void {
    const j = this.jump;
    if (!j) return;
    j.solution = solveJump(this.body.pos, j.target, j.clearance, this.physics.gravity);
    j.airborne = true;
    this.leaveGround();
    this.body.vel.x = j.solution.vx;
    this.body.vel.y = j.solution.vy;
  }

  get jumpCrouch(): number {
    const j = this.jump;
    return j && !j.airborne ? 1 - j.crouchLeft / CROUCH_TIME : 0;
  }

  /** One airborne physics step; side screen edges act as walls. Returns the landing platform. */
  stepAir(dt: number): Platform | null {
    const landed = stepAirborne(this.body, dt, this.world.all, this.physics, (p) => this.canLand(p));
    const v = this.world.viewport();
    if (this.body.pos.x < v.left + 12 || this.body.pos.x > v.right - 12) {
      this.body.pos.x = clamp(this.body.pos.x, v.left + 12, v.right - 12);
      this.body.vel.x *= -0.35;
      this.facing = this.body.vel.x >= 0 ? 1 : -1;
    }
    return landed;
  }

  land(p: Platform, impactSpeed: number): void {
    this.standOn(p);
    this.squash = clamp(impactSpeed / (1100 * this.physics.scale), 0.35, 1);
    if (impactSpeed > 1000 * this.physics.scale) this.setMood('surprised', 0.8);
    const el = p.element;
    if (el) {
      if (this.options.markElements) {
        this.landed?.element.removeAttribute(LANDED_ATTRIBUTE);
        el.setAttribute(LANDED_ATTRIBUTE, '');
        this.landed = { element: el, until: this.time + LANDED_MARK_TIME };
      }
      el.dispatchEvent(new CustomEvent('pagegeist:land', { bubbles: true, detail: { impactSpeed } }));
      if (this.time - this.lastChatAt > 4) this.speak('land', el);
    }
    this.emit('land', { element: el, impactSpeed });
    this.fsm.transition(MascotState.IDLE);
  }

  /**
   * Hang from an edge. `lower = true`: lower herself down from the platform she stands on
   * (CLIMB played backwards); otherwise hang directly (after a grab jump).
   */
  attachHang(p: Platform, offsetX: number, lower = false): void {
    this.leaveGround();
    const ox = clamp(offsetX, 4, p.right - p.left - 4);
    const anchor = { x: p.left + ox, y: p.top };
    this.hang = { platformId: p.id, offsetX: ox, anchor, shimmyTo: null, shimmies: 0, until: 0 };
    this.body.vel = { x: 0, y: 0 };
    if (lower) {
      this.climbDir = -1;
      this.fsm.transition(MascotState.CLIMB);
      return;
    }
    this.body.pos = { x: anchor.x, y: anchor.y + this.metrics.hangReach };
    this.fsm.transition(MascotState.HANG_ON_EDGE);
  }

  /** Click/tap on the mascot. */
  poke(): void {
    this.speak('poke', this.ground?.element ?? null);
    this.setMood('happy', 1.6);
    this.emit('poke', {});
    if (this.motion === 'static') return;
    switch (this.state) {
      case MascotState.IDLE:
      case MascotState.WALK:
      case MascotState.SIT_ON_ELEMENT: {
        const p = this.ground;
        if (p) this.startJump({ x: this.body.pos.x, y: p.top }, 46);
        break;
      }
      case MascotState.HANG_ON_EDGE:
        this.hang = null;
        this.fsm.transition(MascotState.FALL);
        break;
      default:
        break;
    }
  }

  grab(): void {
    this.leaveGround();
    this.hang = null;
    this.jump = null;
    this.plan = null;
    this.speak('grab', null);
    this.emit('grab', {});
    this.fsm.transition(MascotState.GRABBED);
  }

  /** Pointer position (document space) → held by the collar. */
  dragTo(p: Vec2): void {
    this.body.pos.x = p.x;
    this.body.pos.y = p.y + this.metrics.height * 0.74;
  }

  release(vel: Vec2): void {
    if (this.state !== MascotState.GRABBED) return;
    const max = 1400 * Math.max(1, this.physics.scale);
    this.body.vel = { x: clamp(vel.x, -max, max), y: clamp(vel.y, -max, max) };
    this.emit('release', { velocity: { ...this.body.vel } });
    this.fsm.transition(MascotState.FALL);
  }

  /** Shows a speech bubble; by default longer texts stay up longer (2–5 s). */
  say(text: string, duration?: number, trigger: PhraseTrigger | 'api' = 'api'): void {
    const d = duration ?? clamp(1.6 + text.length * 0.05, 2, 5);
    this.bubble = { text, born: this.time, until: this.time + d };
    this.lastChatAt = this.time;
    this.emit('say', { text, trigger });
  }

  /** Resolves and says a phrase for the trigger (if any). */
  speak(trigger: PhraseTrigger, element: Element | null, duration?: number): void {
    const text = resolvePhrase(this.options.phrases, { trigger, element, state: this.state }, this.rng);
    if (text) this.say(text, duration, trigger);
  }

  /** Occasional unprompted remark while idling. */
  maybeChatter(dt: number): void {
    if (!this.behaviors.chatter || this.time - this.lastChatAt < 25) return;
    if (this.rng.chance(dt * 0.03)) this.speak('idle', this.ground?.element ?? null);
  }

  setMood(mood: Mood, duration: number): void {
    this.mood = mood;
    this.moodUntil = this.time + duration;
  }

  /**
   * Walking. Speed follows a spring (speeding up) and is capped by the
   * braking speed, so she slows down before arriving; steps shorten with the speed.
   * Returns true once the target is reached.
   */
  walkToward(targetX: number, dt: number): boolean {
    const dx = targetX - this.body.pos.x;
    if (Math.abs(dx) < 1.5) {
      this.body.pos.x = targetX;
      this.updateGroundOffset();
      return true;
    }
    const h = this.metrics.height;
    const full = walkSpeed(h);
    // A fresh walk starts from a standstill near the passing pose (feet close together).
    if (this.time - this.walkedAt > 0.25) {
      const cycle = cycleLength(h);
      this.gait = (Math.floor(this.gait / cycle) + 1 + WALK.start) * cycle;
      this.speed = this.speedVel = 0;
      this.stride = WALK.minStride;
    }
    this.walkedAt = this.time;
    const dir = Math.sign(dx);
    const brake = Math.sqrt(2 * WALK.brake * full * Math.abs(dx)); // speed that can still stop in time
    [this.speed, this.speedVel] = spring(this.speed, this.speedVel, dir * Math.min(full, brake), WALK.ease, dt);
    if (this.speed * dir > brake) this.speed = dir * brake;
    // Facing follows the actual motion: reversing brakes first, then turns.
    this.facing = (this.speed * dir < -1e-3 * full ? -dir : dir) as Facing;
    const step = this.speed * dt * dir > Math.abs(dx) ? dx : this.speed * dt; // never overshoot
    this.body.pos.x += step;
    // The stance foot sits at stride · S · (stance − 2w) + const (w = t / 2 at step phase t).
    // Both feet are planted in double support, so the stride only changes in single support,
    // and the phase advances so that the stance foot moves back by exactly the body's step
    // (never backward in time).
    const S = GAIT.stepLength * h;
    const b = GAIT.stance;
    const t = (this.gait / S) % 1;
    const k = S * (b - t);
    const d = Math.abs(step);
    const s0 = this.stride;
    const goal = t < 2 * b - 1 ? s0 : lerp(WALK.minStride, 1, Math.abs(this.speed) / full);
    this.stride = (goal - s0) * k < -d ? s0 - d / k : goal;
    this.gait += (d + (this.stride - s0) * k) / this.stride; // = d / stride at a constant stride
    this.updateGroundOffset();
    return false;
  }

  /** Look at the cursor (and maybe greet it when it lingers close by). */
  watchCursor(dt: number, allowTurn: boolean): void {
    const c = this.cursor;
    if (!c || !this.behaviors.watchCursor) {
      this.cursorNearTime = 0;
      return;
    }
    const dx = c.x - this.body.pos.x;
    const dy = c.y - (this.body.pos.y - this.metrics.height * 0.85);
    const dist = Math.hypot(dx, dy);
    const k = this.physics.scale;
    if (allowTurn && dist < 380 * k && Math.abs(dx) > 30 * k) this.facing = dx > 0 ? 1 : -1;
    if (dist < 90 * k) {
      this.cursorNearTime += dt;
      if (this.behaviors.chatter && this.cursorNearTime > 1.1 && this.time - this.lastChatAt > 9) {
        this.speak('cursorNear', null);
        this.setMood('happy', 1.2);
      }
    } else {
      this.cursorNearTime = 0;
    }
  }

  // ------------------------------------------------------------ Secondary motion

  private updateSecondary(dt: number): void {
    const inv = dt > 0 ? 1 / dt : 0;
    const vx = (this.body.pos.x - this.prevPos.x) * inv;
    const vy = (this.body.pos.y - this.prevPos.y) * inv;
    // Damp outliers (rescan snaps, respawn)
    const k = Math.hypot(vx, vy) > 3000 ? 0 : 0.35;
    const ax = (vx - this.visualVel.x) * k * inv;
    this.visualVel.x += (vx - this.visualVel.x) * k;
    this.visualVel.y += (vy - this.visualVel.y) * k;
    this.prevPos = { ...this.body.pos };

    // Hair: underdamped spring trailing the velocity and, by inertia, the acceleration
    // (pushed back on a start, swings forward past rest on a stop). The acceleration part is
    // not clamped, so jittery drag input averages out instead of cancelling the sway.
    const s = SWAY.speed * this.physics.scale;
    const target = clamp(-this.visualVel.x / s, -1, 1) - (SWAY.inertia * ax) / s;
    [this.hairSway, this.hairVel] = wobble(this.hairSway, this.hairVel, target, SWAY.hair, dt);
    this.hairSway = clamp(this.hairSway, -1.4, 1.4);

    this.squash = Math.max(0, this.squash - dt * 3.5);
    const idleLong = this.state === MascotState.IDLE && this.fsm.time > 2.2;
    this.attitude = clamp(this.attitude + (idleLong ? dt * 2.5 : -dt * 5), 0, 1);
    if (this.time > this.moodUntil && this.state !== MascotState.GRABBED) this.mood = 'neutral';
    if (this.time > this.blinkAt + 0.12) this.blinkAt = this.time + this.rng.range(2, 5.5);
    if (this.bubble && this.time > this.bubble.until) this.bubble = null;
    if (this.landed && this.time > this.landed.until) {
      this.landed.element.removeAttribute(LANDED_ATTRIBUTE);
      this.landed = null;
    }
  }

  renderState(): RenderState {
    const pos = this.body.pos;
    const c = this.cursor;
    const lookRange = 520 * this.physics.scale;
    return {
      state: this.state,
      stateTime: this.fsm.time,
      time: this.time,
      facing: this.facing,
      velocity: { ...this.visualVel },
      gait: this.gait,
      stride: this.stride,
      handTarget: this.hang ? { x: this.hang.anchor.x - pos.x, y: this.hang.anchor.y - pos.y } : null,
      climbProgress: this.climbProgress,
      shimmyPhase: this.shimmyPhase,
      jumpCrouch: this.jumpCrouch,
      lookAt:
        c && this.behaviors.watchCursor && Math.hypot(c.x - pos.x, c.y - pos.y) < lookRange
          ? { x: c.x - pos.x, y: c.y - pos.y }
          : null,
      squash: this.squash,
      hairSway: this.hairSway,
      blink: this.time > this.blinkAt && this.time < this.blinkAt + 0.12,
      attitude: this.attitude,
      mood: this.mood,
    };
  }
}
