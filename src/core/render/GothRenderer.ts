import type { OutfitStyle } from '../options';
import { clamp, lerp, MascotState, type Rect, smoothstep, spring, type Vec2, wobble } from '../types';
import {
  DEFAULT_LOOK,
  type Look,
  type MascotMetrics,
  type MascotRenderer,
  type RenderQueue,
  type RenderState,
} from './types';
import { ankleOf, footRef, LEG, rot, SWAY, UNIT_HEIGHT, WALK, walkPhase, walkPose } from './walk';

/**
 * GothRenderer
 * ------------
 * The built-in procedural renderer of the Pagegeist character: drawn with Canvas-2D from a
 * small skeleton (forward kinematics + 2-bone IK for arms/legs). No assets needed.
 * Proportions, anchor points and layers:
 *
 *   - Standing height 120 units × scale (default ≈ 0.93 → 112 px), ~7 heads tall
 *   - Anchor = center of the soles (bottom-center)
 *   - hangReach = 143 units × scale (hands above head → soles)
 *   - Side/3⁄4 view, facing right by default (facing = 1)
 *
 * Look: a young woman in gothic style – long straight black hair with blunt bangs, velvet
 * top with lace neckline, bell sleeves with lace cuffs, corset with front lacing, choker
 * with pendant, layered asymmetric skirt (handkerchief hem) with a calf-length lace
 * underlayer, rings, knee-high goth boots with pointed toes, stiletto heels and buckle
 * straps, dark lips. Hands have a palm, four fingers and a thumb and change with the pose
 * (relaxed, gripping an edge, spread, flat on the seat).
 *
 * Wardrobe (`look`): the 'corset' outfit swaps top and skirt for a strappy corset top, a ruffled miniskirt and a thigh band with a red bow (and a red pendant);
 * 'heels' swaps the boots for high-top lace-up platform boots with a chunky block heel on the
 * same heel geometry; `fishnets` adds a mesh clipped to the legs. None of them changes the skeleton.
 *
 * The character design is dedicated to the public domain under CC0 1.0 (see LICENSE-ARTWORK).
 */

// Skeleton lengths (at scale 1)
const SK = {
  hipH: 62,
  torso: 36,
  neck: 5,
  headOff: 9,
  headR: 8.5,
  upper: 22,
  fore: 20,
  /** Leg bones and ankle height (much higher than barefoot because of the heels), see walk.ts. */
  ...LEG,
} as const;

/** Face/hair are drawn in "head units" (radius 11.5) and scaled by this factor. */
const HEAD_S = SK.headR / 11.5;

const C = {
  skin: '#f7ece6',
  skinFar: '#e3d3cb',
  skinLine: 'rgba(120, 70, 60, 0.35)',
  hair: '#0f0d12',
  hairHi: 'rgba(90, 80, 105, 0.35)',
  velvet: '#1e1822',
  velvetFar: '#0d0a0f',
  velvetHi: 'rgba(160, 140, 180, 0.28)',
  corset: '#0e0b10',
  lacing: '#6b6273',
  lace: '#241e29',
  laceHi: 'rgba(175, 155, 195, 0.22)',
  chiffon: '#0b090d',
  metal: '#c2c0cc',
  liner: '#0b090e',
  iris: '#2d2329',
  lips: '#5b2735',
  boot: '#0b090d',
  bootFar: '#060508',
  bootHi: 'rgba(170, 160, 190, 0.45)',
  buckle: '#9d9aa8',
  red: '#8e1b2b',
  redHi: '#b3263a',
  net: 'rgba(8, 6, 10, 0.62)',
} as const;

interface Limb {
  elbow: Vec2;
  hand: Vec2;
  knee: Vec2;
  ankle: Vec2;
  footDir: Vec2;
  /** Explicit boot rotation (rad, + = toe down); null = derived from footDir/grounded. */
  footPitch: number | null;
  /** Shoulder joint shift along the facing direction (shoulder counter-rotation). */
  shoulderShift: number;
}

interface Skeleton {
  hip: Vec2;
  shoulder: Vec2;
  neck: Vec2;
  head: Vec2;
  torso: number;
  headAngle: number;
  near: Limb;
  far: Limb;
  feetGrounded: boolean;
  skirtFlare: number;
  hairLift: number;
  /** Dynamic per-pose layer overrides. */
  nearArmFront: boolean;
  nearLegFront: boolean;
  pupil: Vec2;
}

const v = (x: number, y: number): Vec2 => ({ x, y });
const add = (a: Vec2, b: Vec2, s = 1): Vec2 => ({ x: a.x + b.x * s, y: a.y + b.y * s });
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const len = (a: Vec2): number => Math.hypot(a.x, a.y);
const norm = (a: Vec2): Vec2 => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};
/** Direction for limbs: 0 = straight down, positive = forward (facing direction). */
const dir = (a: number): Vec2 => ({ x: Math.sin(a), y: Math.cos(a) });
/** Direction for the torso: 0 = upright, positive = leaning forward. */
const upDir = (a: number): Vec2 => ({ x: Math.sin(a), y: -Math.cos(a) });

/** 2-bone IK. bend = +1/-1 picks the side of the middle joint. */
function ik(root: Vec2, target: Vec2, l1: number, l2: number, bend: number): { mid: Vec2; end: Vec2 } {
  const d = sub(target, root);
  const dist = clamp(len(d), Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.001);
  const base = Math.atan2(d.x, d.y);
  const cosA = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
  const a1 = base + bend * Math.acos(cosA);
  const mid = add(root, dir(a1), l1);
  const end = add(mid, norm(sub(target, mid)), l2);
  return { mid, end };
}

function fkArm(shoulder: Vec2, a1: number, a2: number): { elbow: Vec2; hand: Vec2 } {
  const elbow = add(shoulder, dir(a1), SK.upper);
  return { elbow, hand: add(elbow, dir(a1 + a2), SK.fore) };
}

function fkLeg(hip: Vec2, t: number, k: number): { knee: Vec2; ankle: Vec2 } {
  const knee = add(hip, dir(t), SK.thigh);
  return { knee, ankle: add(knee, dir(t + k), SK.shin) };
}

function ikArm(shoulder: Vec2, hand: Vec2, bend: number): { elbow: Vec2; hand: Vec2 } {
  const r = ik(shoulder, hand, SK.upper, SK.fore, bend);
  return { elbow: r.mid, hand: r.end };
}

function ikLeg(hip: Vec2, ankle: Vec2): { knee: Vec2; ankle: Vec2 } {
  const r = ik(hip, ankle, SK.thigh, SK.shin, 1);
  return { knee: r.mid, ankle: r.end };
}

/** Boot rotation around the ankle as drawn. */
function bootAngle(l: Limb, grounded: boolean): number {
  if (l.footPitch !== null) return l.footPitch;
  return grounded ? 0 : Math.atan2(l.footDir.y, l.footDir.x) * 0.6;
}

function footDirFor(knee: Vec2, ankle: Vec2, grounded: boolean): Vec2 {
  if (grounded) return v(1, 0);
  const s = norm(sub(ankle, knee));
  const perp = v(s.y, -s.x); // perpendicular to the shin, pointing forward
  return norm(add(perp, s, 0.7)); // foot slightly pointed
}

/** Half-life (s) of the pose offset after a state change. */
const BLEND_HALFLIFE = 0.14;

/** Points and angles of a skeleton that are blended across state changes (see `blend`). */
const pointsOf = (sk: Skeleton): Vec2[] => [
  sk.hip,
  sub(sk.head, sk.neck),
  sk.near.hand,
  sk.far.hand,
  sk.near.ankle,
  sk.far.ankle,
  sk.near.elbow,
  sk.far.elbow,
  sk.near.knee,
  sk.far.knee,
];
const scalarsOf = (sk: Skeleton): number[] => [
  sk.torso,
  sk.headAngle,
  bootAngle(sk.near, sk.feetGrounded),
  bootAngle(sk.far, sk.feetGrounded),
  sk.skirtFlare,
  sk.hairLift,
  sk.near.shoulderShift,
  sk.far.shoulderShift,
];

/** Limb end and middle joint after offsetting, solved again so the bones keep their lengths. */
function relimb(root: Vec2, end: Vec2, mid: Vec2, l1: number, l2: number): { mid: Vec2; end: Vec2 } {
  const a = ik(root, end, l1, l2, 1);
  const b = ik(root, end, l1, l2, -1);
  return len(sub(a.mid, mid)) < len(sub(b.mid, mid)) ? a : b;
}

export class GothRenderer implements MascotRenderer {
  readonly metrics: MascotMetrics;
  /** Current clothing; read on every draw. */
  look: Look = DEFAULT_LOOK;
  private readonly scale: number;
  private last: Skeleton | null = null;
  private facing = 1;
  /** Start of the last turn (facing flip) and the horizontal draw scale it gives (facing × width). */
  private turnAt = -Infinity;
  private fx = 1;
  /** Inertialization state: initial offset (x0), offset (x) and its velocity (v) per channel. */
  private offset: { x0: number[]; x: number[]; v: number[] } | null = null;
  private shown: { state: string; time: number; x: number; y: number; ch: number[] } | null = null;
  /**
   * Secondary motion springs, [value, velocity] each: the hair's height (follows the hip y)
   * and the near and far hem angle (follow the thigh angles, + = forward).
   */
  private sec: Array<[number, number]> | null = null;

  /** @param height Standing height in CSS pixels. */
  constructor(height: number) {
    this.scale = height / UNIT_HEIGHT;
    this.metrics = {
      height: UNIT_HEIGHT * this.scale,
      hangReach: (SK.hipH + SK.torso + SK.upper + SK.fore + 3) * this.scale,
    };
  }

  debugFeet(): { near: Vec2; far: Vec2 } | null {
    const sk = this.last;
    if (!sk) return null;
    // Foot reference point of each boot (the point that stays planted while walking).
    const k = this.scale;
    const at = (l: Limb) => {
      const p = footRef(l.ankle, bootAngle(l, sk.feetGrounded));
      return v(p.x * k * this.fx, p.y * k);
    };
    return { near: at(sk.near), far: at(sk.far) };
  }

  bounds(rs: RenderState): Rect {
    const sk = this.last ?? this.pose(rs);
    const pts = [sk.hip, sk.shoulder, sk.head, sk.near.hand, sk.far.hand, sk.near.ankle, sk.far.ankle, sk.near.knee];
    const b = bbox(pts);
    const m = SK.headR + 4;
    const minX = b.x0 - m;
    const maxX = b.x1 + m;
    const minY = b.y0 - m;
    const maxY = b.y1 + 6;
    const k = this.scale;
    const f = this.last ? this.fx : rs.facing;
    const [x0, x1] = f > 0 ? [minX * f, maxX * f] : [maxX * f, minX * f];
    return { x: x0 * k, y: minY * k, width: (x1 - x0) * k, height: (maxY - minY) * k };
  }

  draw(queue: RenderQueue, x: number, y: number, rs: RenderState, z: number): void {
    const dt = this.shown ? clamp(rs.time - this.shown.time, 0, 0.1) : 0;
    const sk = this.blend(this.pose(rs), rs, x, y, dt);
    // Secondary motion: the hair hangs from a spring that follows the hip height (bounces on
    // every step, landing, crouch), each hem from one that follows its thigh (the leg pushes
    // the fabric, which swings on after she stops).
    const th = (l: Limb) => Math.atan2(l.knee.x - sk.hip.x, l.knee.y - sk.hip.y);
    const goals = [sk.hip.y, th(sk.near), th(sk.far)];
    this.sec = ((!rs.calm && this.sec) || goals.map((g): [number, number] => [g, 0])).map((s, i) =>
      wobble(...s, goals[i]!, i ? SWAY.skirt : SWAY.hair, dt),
    );
    const lag = this.sec.map((s, i) => s[0] - goals[i]!);
    sk.hairLift += clamp(-lag[0]! * SWAY.bounce, -SWAY.bounceMax, SWAY.bounceMax);
    // Turn instead of mirroring: the body rotates about its vertical axis, so the width
    // contracts, flips at half time and widens again (a reversed turn continues seamlessly).
    const T = WALK.turn;
    let p = clamp((rs.time - this.turnAt) / T, 0, 1);
    if (this.last && rs.facing !== this.facing) {
      p = 1 - p;
      this.turnAt = rs.time - T * p;
    }
    this.last = sk;
    this.facing = rs.facing;
    const k = this.scale;
    const f = (p < 0.5 ? -rs.facing : rs.facing) * Math.max(0.3, Math.abs(Math.cos(Math.PI * p)));
    this.fx = f;
    const sq = rs.squash * 0.07;
    const sway = rs.calm ? 0 : rs.hairSway * Math.sign(f); // world-space sway in the (possibly mid-turn) drawing frame
    const hem = lag.slice(1).map((a) => clamp(a * SWAY.hem, -SWAY.hemMax, SWAY.hemMax));

    const part = (dz: number, fn: (ctx: CanvasRenderingContext2D) => void) =>
      queue.push(z + dz, (ctx) => {
        ctx.translate(x, y);
        ctx.scale(f * k * (1 + sq), k * (1 - sq));
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        fn(ctx);
      });

    const look = this.look;
    const mini = look.outfit === 'corset';
    const hands = handPoseOf(rs);
    part(0.1, (ctx) => drawArm(ctx, sk.shoulder, sk.far, true, mini, hands));
    part(0.2, (ctx) => drawLeg(ctx, sk.hip, sk.far, true, sk.feetGrounded, look, hem[1]!));
    part(0.3, (ctx) => drawBackHair(ctx, sk, sway));
    part(sk.nearLegFront ? 0.6 : 0.4, (ctx) => drawLeg(ctx, sk.hip, sk.near, false, sk.feetGrounded, look, hem[0]!));
    part(0.5, (ctx) => (mini ? drawMiniSkirt : drawSkirt)(ctx, sk, hem));
    part(0.55, (ctx) => (mini ? drawCorsetTop : drawTorso)(ctx, sk));
    part(sk.nearArmFront ? 0.9 : 0.7, (ctx) => drawArm(ctx, sk.shoulder, sk.near, false, mini, hands));
    part(0.8, (ctx) => drawHead(ctx, sk, rs));
    part(0.85, (ctx) => drawFrontHair(ctx, sk, sway));
  }

  /**
   * Inertialization (David Bollo, GDC 2018): on a state change the offset between the
   * last shown pose and the new one is kept per channel and decays with a critically
   * damped spring (Daniel Holden, "Dead Blending"), so only the new pose is computed.
   * Limbs are solved again from the offset end points (no stretched bones, no knee pop);
   * a planted foot that has to move steps instead of sliding.
   */
  private blend(sk: Skeleton, rs: RenderState, x: number, y: number, dt: number): Skeleton {
    const k = this.scale;
    const ch = [...pointsOf(sk).flatMap((p) => [p.x, p.y]), ...scalarsOf(sk)];
    const prev = this.shown;
    if (prev && prev.state !== rs.state) {
      // The anchor may jump too (grabbing an edge): keep the world position continuous.
      let dx = ((prev.x - x) * rs.facing) / k;
      let dy = (prev.y - y) / k;
      if (Math.hypot(dx, dy) > 90) dx = dy = 0;
      if (this.sec) this.sec[0]![0] += dy; // the hair spring lives in local space too
      const xs = prev.ch.map((c, i) => {
        const d = c - ch[i]!;
        if (i < 20) return i >> 1 === 1 ? d : d + (i & 1 ? dy : dx); // points (the head is neck-relative)
        return i < 24 ? Math.atan2(Math.sin(d), Math.cos(d)) : d; // angles wrap
      });
      this.offset = { x0: xs, x: [...xs], v: xs.map(() => 0) };
    }
    const o = this.offset;
    let out = sk;
    if (o) {
      let left = 0;
      for (let i = 0; i < o.x.length; i++) {
        [o.x[i], o.v[i]] = spring(o.x[i]!, o.v[i]!, 0, BLEND_HALFLIFE, dt);
        left = Math.max(left, Math.abs(o.x[i]!));
      }
      if (left < 0.01) this.offset = null;
      const [hip, head, nh, fh, na, fa, ne, fe, nk, fk] = pointsOf(sk).map((p, i) =>
        add(p, v(o.x[2 * i]!, o.x[2 * i + 1]!)),
      );
      const [torso, headAngle, np, fp, flare, hairLift, ns, fs] = scalarsOf(sk).map((c, i) => c + o.x[20 + i]!);
      const shoulder = add(
        add(hip!, upDir(torso!), SK.torso),
        sub(sk.shoulder, add(sk.hip, upDir(sk.torso), SK.torso)),
      );
      const neck = add(shoulder, upDir(torso!), SK.neck);
      // A planted foot that still has to travel lifts along an arc over the blend: a quick
      // step, not a slide.
      const step = (a: Vec2, i: number, planted: Limb) => {
        const x0 = Math.abs(o.x0[2 * i]!);
        const s = x0 > 0.5 && planted.ankle.y > -SK.ankle - 1 ? clamp(1 - Math.abs(o.x[2 * i]!) / x0, 0, 1) : 0;
        return add(a, v(0, -Math.min(4, x0 * 0.3) * 4 * s * (1 - s)));
      };
      const arm = (hand: Vec2, elbow: Vec2, shift: number) => {
        const r = relimb(add(shoulder, v(shift, 0)), hand, elbow, SK.upper, SK.fore);
        return { elbow: r.mid, hand: r.end };
      };
      const leg = (ankle: Vec2, knee: Vec2) => {
        const r = relimb(hip!, ankle, knee, SK.thigh, SK.shin);
        return { knee: r.mid, ankle: r.end };
      };
      out = {
        ...sk,
        hip: hip!,
        shoulder,
        neck,
        head: add(neck, head!),
        torso: torso!,
        headAngle: headAngle!,
        skirtFlare: flare!,
        hairLift: hairLift!,
        near: {
          ...sk.near,
          ...arm(nh!, ne!, ns!),
          ...leg(step(na!, 4, sk.near), nk!),
          footPitch: np!,
          shoulderShift: ns!,
        },
        far: {
          ...sk.far,
          ...arm(fh!, fe!, fs!),
          ...leg(step(fa!, 5, sk.far), fk!),
          footPitch: fp!,
          shoulderShift: fs!,
        },
      };
    }
    const shown = [...pointsOf(out).flatMap((p) => [p.x, p.y]), ...scalarsOf(out)];
    this.shown = { state: rs.state, time: rs.time, x, y, ch: shown };
    return out;
  }

  // ---------------------------------------------------------------- Poses

  private pose(rs: RenderState): Skeleton {
    const T = rs.calm ? 0 : rs.time; // calm: every ambient loop holds its rest phase
    const breathe = Math.sin(T * 2.2);
    const local = (p: Vec2 | null): Vec2 | null => (p ? v((p.x * rs.facing) / this.scale, p.y / this.scale) : null);
    const hands = local(rs.handTarget);

    let hip = v(0, -SK.hipH);
    let torso = 0.03;
    let headTilt = 0;
    let headDrop = 0;
    let chest = 0;
    let pitch: { n: number; f: number } | null = null;
    let shift = { n: 0, f: 0 };
    let grounded = true;
    let flare = 0;
    let hairLift = 0;
    let nearArmFront = false;
    let nearLegFront = false;
    let arms: { n: { elbow: Vec2; hand: Vec2 }; f: { elbow: Vec2; hand: Vec2 } } | null = null;
    let legs: { n: { knee: Vec2; ankle: Vec2 }; f: { knee: Vec2; ankle: Vec2 } } | null = null;

    const shoulderOf = (h: Vec2, t: number) => add(h, upDir(t), SK.torso);
    const standLegs = (h: Vec2, nx = 3.5, fx = -3, nLift = 0, fLift = 0) => {
      return { n: ikLeg(h, v(nx, -SK.ankle - nLift)), f: ikLeg(h, v(fx, -SK.ankle - fLift)) };
    };

    switch (rs.state) {
      case MascotState.IDLE: {
        const sq = rs.squash;
        hip = v(Math.sin(T * 0.6) * 1.0, -(SK.hipH - 1.5 - sq * 12 + breathe * 0.3));
        torso = 0.03 + sq * 0.25 + breathe * 0.008;
        legs = standLegs(hip);
        const s = shoulderOf(hip, torso);
        const a = rs.attitude;
        arms = {
          n: fkArm(s, lerp(0.1 + breathe * 0.03, -0.6, a), lerp(0.2, 1.4, a)),
          f: fkArm(s, -0.08 - breathe * 0.02, 0.15),
        };
        break;
      }
      case MascotState.WALK: {
        // Key-posed cycle from walk.ts; the stance foot is planted in world space.
        const w = walkPose(walkPhase(rs.gait, this.metrics.height), undefined, rs.stride);
        hip = v(0, w.hipY);
        torso = w.torso;
        legs = { n: ikLeg(hip, ankleOf(w.near)), f: ikLeg(hip, ankleOf(w.far)) };
        pitch = { n: w.near.pitch, f: w.far.pitch };
        // The upper body takes only part of the hip bob.
        chest = w.bob * WALK.chestComp;
        const s = add(shoulderOf(hip, torso), v(0, chest));
        shift = { n: w.nearArm.shift, f: w.farArm.shift };
        arms = {
          n: fkArm(add(s, v(shift.n, 0)), w.nearArm.angle, w.nearArm.elbow),
          f: fkArm(add(s, v(shift.f, 0)), w.farArm.angle, w.farArm.elbow),
        };
        // Head steadies itself: counters the torso pitch and most of the bob, chin slightly up.
        headTilt = (WALK.lean - torso) * 0.6 + WALK.chin;
        headDrop = (w.bob - chest) * WALK.headComp;
        break;
      }
      case MascotState.JUMP: {
        if (rs.jumpCrouch > 0) {
          const c = rs.jumpCrouch;
          hip = v(-c * 2, -(SK.hipH - 1.5 - c * 13));
          torso = 0.05 + c * 0.35;
          legs = standLegs(hip);
          const s = shoulderOf(hip, torso);
          arms = { n: fkArm(s, -0.7 * c, 0.3), f: fkArm(s, -0.6 * c, 0.4) };
          break;
        }
        const kk = clamp((rs.velocity.y + 500) / 1000, 0, 1);
        grounded = false;
        hip = v(0, -SK.hipH + 4);
        torso = lerp(0.15, 0.05, kk);
        legs = {
          n: fkLeg(hip, lerp(1.0, 0.35, kk), lerp(-1.6, -0.5, kk)),
          f: fkLeg(hip, lerp(0.4, -0.1, kk), lerp(-1.1, -0.3, kk)),
        };
        const s = shoulderOf(hip, torso);
        arms = { n: fkArm(s, lerp(2.6, 1.7, kk), 0.2), f: fkArm(s, lerp(2.3, 1.4, kk), 0.3) };
        hairLift = kk * 0.6;
        flare = kk * 0.5;
        break;
      }
      case MascotState.FALL: {
        const fl = Math.sin(T * 13);
        const kick = Math.sin(T * 9);
        grounded = false;
        hip = v(0, -SK.hipH + 2);
        torso = -0.1 + 0.05 * fl;
        legs = { n: fkLeg(hip, 0.45 + 0.35 * kick, -0.9), f: fkLeg(hip, 0.1 - 0.35 * kick, -0.6) };
        const s = shoulderOf(hip, torso);
        arms = { n: fkArm(s, 2.7 + 0.35 * fl, 0.4), f: fkArm(s, 2.5 - 0.35 * fl, 0.5) };
        hairLift = smoothstep(0, 0.4, rs.stateTime);
        flare = hairLift;
        break;
      }
      case MascotState.HANG_ON_EDGE: {
        const H = hands ?? v(0, -130);
        const alpha = Math.sin(T * 2.1) * 0.06 - clamp(rs.velocity.x * rs.facing * 0.002, -0.2, 0.2);
        grounded = false;
        const reach = SK.upper + SK.fore - 2 + SK.torso;
        hip = v(H.x - reach * Math.sin(alpha) - 1, H.y + reach * Math.cos(alpha));
        torso = alpha;
        const s = shoulderOf(hip, torso);
        const sp = rs.shimmyPhase;
        const hn = add(H, v(5 * Math.sin(sp), -2 * Math.max(0, Math.cos(sp))));
        const hf = add(H, v(-5 * Math.sin(sp) - 2, -2 * Math.max(0, -Math.cos(sp))));
        arms = { n: ikArm(s, hn, 1), f: ikArm(s, hf, 1) };
        legs = {
          n: fkLeg(hip, 0.05 + 0.12 * Math.sin(T * 2.1 + 0.5), -0.15),
          f: fkLeg(hip, -0.1 * Math.sin(T * 2.1 + 1.2), -0.25),
        };
        nearArmFront = true;
        hairLift = -0.2;
        break;
      }
      case MascotState.CLIMB: {
        const p = rs.climbProgress;
        const lift = smoothstep(0.1, 0.55, p);
        const mantle = smoothstep(0.5, 1, p);
        const H = hands ?? v(0, 0);
        hip = v(2 * p, -(SK.hipH - 2) + 12 * Math.sin(Math.PI * mantle));
        torso = 0.15 + 0.55 * Math.sin(Math.PI * p);
        const s = shoulderOf(hip, torso);
        const bend = H.y < s.y ? 1 : -1;
        arms = { n: ikArm(s, H, bend), f: ikArm(s, add(H, v(-3, 0)), bend) };
        legs = {
          n: fkLeg(
            hip,
            lerp(0.1, 1.5, lift) * (1 - mantle) + 0.15 * mantle,
            -lerp(0.2, 1.9, lift) * (1 - mantle) - 0.1,
          ),
          f: fkLeg(hip, 0.05 + 0.25 * mantle, -0.3),
        };
        grounded = mantle > 0.9;
        nearArmFront = p < 0.5;
        nearLegFront = lift > 0.3 && mantle < 0.8;
        break;
      }
      case MascotState.SIT_ON_ELEMENT: {
        grounded = false;
        hip = v(0, -5);
        torso = -0.06 + breathe * 0.01;
        const sw = Math.sin(T * 2.4);
        const sw2 = Math.sin(T * 2.4 + 1.7);
        legs = { n: fkLeg(hip, 1.42, -1.38 + 0.22 * sw), f: fkLeg(hip, 1.3, -1.4 + 0.22 * sw2) };
        const s = shoulderOf(hip, torso);
        arms = { n: ikArm(s, v(11, -9), -1), f: ikArm(s, v(-8, -1), -1) };
        break;
      }
      case MascotState.GRABBED: {
        grounded = false;
        hip = v(0, -SK.hipH + 3);
        torso = clamp(-rs.velocity.x * rs.facing * 0.0008, -0.5, 0.5) + 0.05 * Math.sin(T * 3);
        const s = shoulderOf(hip, torso);
        arms = {
          n: fkArm(s, 0.35 + 0.2 * Math.sin(T * 4), 0.3),
          f: fkArm(s, -0.2 + 0.2 * Math.sin(T * 4 + 1), 0.4),
        };
        legs = {
          n: fkLeg(hip, 0.2 + 0.25 * Math.sin(T * 3.3), -0.4),
          f: fkLeg(hip, -0.1 + 0.25 * Math.sin(T * 3.3 + 1.4), -0.3),
        };
        flare = 0.3;
        break;
      }
    }

    const shoulder = add(shoulderOf(hip, torso), v(0, chest));
    if (!arms) arms = { n: fkArm(shoulder, 0.1, 0.2), f: fkArm(shoulder, -0.1, 0.2) };
    if (!legs) legs = standLegs(hip);
    const neck = add(shoulder, upDir(torso), SK.neck);

    // Head: slight tilt toward the look target (cursor), pupils follow.
    let headAngle = torso * -0.4 + headTilt;
    let pupil = v(0, 0);
    const look = local(rs.lookAt);
    const headGuess = add(neck, upDir(torso), SK.headOff);
    if (look) {
      const d = sub(look, headGuess);
      if (d.x > -10) headAngle += clamp(Math.atan2(d.y, Math.max(d.x, 1)) * 0.35, -0.3, 0.3);
      pupil = v(clamp(d.x / 220, -1, 1) * 1.1, clamp(d.y / 220, -1, 1) * 0.9);
    }
    const head = add(add(neck, upDir(torso + headAngle), SK.headOff), v(0, headDrop));

    return {
      hip,
      shoulder,
      neck,
      head,
      torso,
      headAngle: torso + headAngle,
      near: {
        ...arms.n,
        ...legs.n,
        footDir: footDirFor(legs.n.knee, legs.n.ankle, grounded),
        footPitch: pitch?.n ?? null,
        shoulderShift: shift.n,
      },
      far: {
        ...arms.f,
        ...legs.f,
        footDir: footDirFor(legs.f.knee, legs.f.ankle, grounded),
        footPitch: pitch?.f ?? null,
        shoulderShift: shift.f,
      },
      feetGrounded: grounded,
      skirtFlare: flare,
      hairLift,
      nearArmFront,
      nearLegFront,
      pupil,
    };
  }
}

// ---------------------------------------------------------------- Drawing

function stroke(ctx: CanvasRenderingContext2D, a: Vec2, b: Vec2, width: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

/** Adds the polyline through `pts` to the current path (closed by default). */
function polyPath(ctx: CanvasRenderingContext2D, pts: Vec2[], close = true): void {
  pts.forEach((p, i) => {
    if (i) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  });
  if (close) ctx.closePath();
}

function fillPoly(ctx: CanvasRenderingContext2D, pts: Vec2[], color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  polyPath(ctx, pts);
  ctx.fill();
}

/** Strokes the current path as lace trim: a solid band with a dashed highlight on top. */
function laceStroke(ctx: CanvasRenderingContext2D, width: number, hiWidth: number, dash: number[]): void {
  ctx.strokeStyle = C.lace;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.strokeStyle = C.laceHi;
  ctx.lineWidth = hiWidth;
  ctx.setLineDash(dash);
  ctx.stroke();
  ctx.setLineDash([]);
}

function bbox(pts: Vec2[]): { x0: number; x1: number; y0: number; y1: number } {
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  return { x0, x1, y0, y1 };
}

const perpOf = (d: Vec2): Vec2 => v(-d.y, d.x);

function drawLeg(
  ctx: CanvasRenderingContext2D,
  hip: Vec2,
  l: Limb,
  far: boolean,
  grounded: boolean,
  look: Look,
  swing: number,
): void {
  const skin = far ? C.skinFar : C.skin;
  const hipJ = add(hip, v(far ? -2.5 : 2.5, 0));
  const w = LEGS[look.outfit];
  if (look.outfit === 'classic') {
    stroke(ctx, hipJ, l.knee, 9.5, skin);
    stroke(ctx, l.knee, l.ankle, 7.4, skin);
  } else {
    ctx.fillStyle = skin;
    thighPath(ctx, hipJ, l, w);
    ctx.fill();
    shinPath(ctx, l, w);
    ctx.fill();
  }
  if (look.fishnets) drawLegNet(ctx, hipJ, l, w);
  if (look.outfit === 'corset' && !far) drawThighBand(ctx, hipJ, l, w, swing);
  if (look.shoes === 'heels') drawAnkleBoot(ctx, l, far, grounded, w);
  else drawBoot(ctx, l, far, grounded);
}

/** Half widths of the leg at the hip, knee, calf (back side) and ankle. */
interface LegShape {
  hip: number;
  knee: number;
  calf: number;
  ankle: number;
}

/**
 * 'classic' matches the stroked legs under the long skirt; the bare legs of the corset
 * outfit taper from the hip to a slim knee, with a slight calf and a narrow ankle.
 */
const LEGS: Record<OutfitStyle, LegShape> = {
  classic: { hip: 4.75, knee: 4.75, calf: 3.7, ankle: 3.7 },
  corset: { hip: 4.1, knee: 2.8, calf: 3.15, ankle: 2.1 },
};

/** Starts a path with a half disc at `a`, on the side away from `b`. */
function cap(ctx: CanvasRenderingContext2D, a: Vec2, b: Vec2, r: number): void {
  const n = perpOf(norm(sub(b, a)));
  const t = Math.atan2(n.y, n.x);
  ctx.beginPath();
  ctx.arc(a.x, a.y, r, t, t + Math.PI);
}

/** Thigh: rounded at the hip, flat at the knee (the shin rounds the knee). */
function thighPath(ctx: CanvasRenderingContext2D, hipJ: Vec2, l: Limb, w: LegShape): void {
  cap(ctx, hipJ, l.knee, w.hip);
  band(ctx, hipJ, l.knee, w.hip, w.knee);
}

/** Shin: rounded knee, calf curve at the back (+n), straight front. */
function shinPath(ctx: CanvasRenderingContext2D, l: Limb, w: LegShape): void {
  cap(ctx, l.knee, l.ankle, w.knee);
  const d = sub(l.ankle, l.knee);
  const n = perpOf(norm(d));
  const calf = add(l.knee, d, 0.3);
  const pts = [
    add(l.knee, n, w.knee),
    add(calf, n, w.calf),
    add(l.ankle, n, w.ankle),
    add(l.ankle, n, -w.ankle),
    add(l.knee, n, -w.knee),
  ];
  polyPath(ctx, pts);
}

/** Path of a quad around a→b (half widths wa, wb). */
function band(ctx: CanvasRenderingContext2D, a: Vec2, b: Vec2, wa: number, wb: number): void {
  const n = perpOf(norm(sub(b, a)));
  polyPath(ctx, [add(a, n, wa), add(b, n, wb), add(b, n, -wb), add(a, n, -wa)]);
}

/** Diamond mesh along `d` from `o` over `length`, wider than any leg (clip it). */
function mesh(ctx: CanvasRenderingContext2D, o: Vec2, d: Vec2, length: number): void {
  const n = perpOf(d);
  ctx.strokeStyle = C.net;
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  for (let i = -8; i < length + 8; i += 2.2) {
    const p = add(o, d, i);
    for (const s of [-5, 5]) {
      const a = add(add(p, d, -7), n, -s);
      const b = add(add(p, d, 7), n, s);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
  }
  ctx.stroke();
}

/**
 * Fishnet tights: one mesh per bone, each clipped to its bone (the shin with a rounded knee,
 * minus the thigh), so the pattern bends at the knee without doubling.
 */
function drawLegNet(ctx: CanvasRenderingContext2D, hipJ: Vec2, l: Limb, w: LegShape): void {
  ctx.save();
  thighPath(ctx, hipJ, l, w);
  ctx.clip();
  mesh(ctx, hipJ, norm(sub(l.knee, hipJ)), SK.thigh);
  ctx.restore();
  ctx.save();
  shinPath(ctx, l, w);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(-1e3, -1e3, 2e3, 2e3);
  band(ctx, hipJ, l.knee, w.hip, w.knee);
  ctx.clip('evenodd');
  mesh(ctx, l.knee, norm(sub(l.ankle, l.knee)), SK.shin);
  ctx.restore();
}

/** Black band around the thigh, a hand's width below the hem, with a red satin bow in front. */
function drawThighBand(ctx: CanvasRenderingContext2D, hipJ: Vec2, l: Limb, w: LegShape, swing: number): void {
  const u = 0.42;
  const at = alongLeg(hipJ, l, u);
  const n = perpOf(at.d); // points backward
  const r = lerp(w.hip, w.knee, (u * (SK.thigh + SK.shin)) / SK.thigh) + 0.2;
  stroke(ctx, add(at.p, n, r), add(at.p, n, -r), 1.7, C.liner);
  const knot = add(at.p, n, 0.3 - r);
  // Bow tails hang with gravity and trail the leg like the hem does.
  const tail = rot(v(0, 1), clamp(-swing * 2, -0.6, 0.6));
  stroke(ctx, knot, add(add(knot, tail, 3.4), n, -0.9), 0.8, C.red);
  stroke(ctx, knot, add(add(knot, tail, 3), n, 0.7), 0.8, C.red);
  for (const s of [1, -1]) {
    fillPoly(ctx, [knot, add(add(knot, at.d, 1.5 * s), n, -1.9), add(add(knot, at.d, 1.9 * s), n, -0.2)], C.red);
  }
  ctx.fillStyle = C.redHi;
  ctx.beginPath();
  ctx.arc(knot.x, knot.y, 0.6, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * High-top lace-up platform boot in black canvas: the shaft rises well above the ankle bone
 * (full, rounded heel counter, padded collar), the front is laced from the toe box to the collar over a
 * tongue (small silver eyelets), a round sneaker toe sits on a massive lug-sole platform,
 * and a tall chunky block heel (about twice the platform) joins it through a shallow concave arch.
 * Shaft, upper, platform and heel are ONE outline. It stands on the same heel and toe
 * points as the knee-high boot (HEEL/TOE in walk.ts), so the walk and the foot pivots are
 * identical.
 */
function drawAnkleBoot(ctx: CanvasRenderingContext2D, l: Limb, far: boolean, grounded: boolean, w: LegShape): void {
  const s = norm(sub(l.ankle, l.knee));
  const n = perpOf(s); // points backward
  const a = bootAngle(l, grounded);
  const g = SK.ankle;
  /** Foot frame (ankle = origin, ground at y = g) → leg space. */
  const F = (x: number, y: number): Vec2 => add(l.ankle, rot(v(x, y), a));
  const top = add(l.ankle, s, -11);
  const wt = lerp(w.calf, w.ankle, 0.5) + 1.1;
  const front = add(add(l.ankle, s, -2.6), n, -(w.ankle + 1.9));
  const collarBack = add(top, n, wt + 0.35);
  const collarFront = add(top, n, -wt);
  const PLATFORM = 3.8;
  const HEEL_TOP = g - 7.2;

  ctx.beginPath();
  ctx.moveTo(...xy(collarBack));
  const ab = add(add(l.ankle, s, -1.5), n, 5.4);
  const hb = F(-4.3, HEEL_TOP);
  ctx.quadraticCurveTo(ab.x, ab.y, hb.x, hb.y); // full, rounded heel counter
  // Straight back of the block heel down to the lug tread (teeth on the ground line)
  for (let i = 0; i <= 8; i++) ctx.lineTo(...xy(F(-4.3 + i * 0.65, i % 2 ? g - 0.5 : g)));
  ctx.lineTo(...xy(F(2.1, g - 4.1))); // heel front, flaring into the arch
  const arch = F(4.8, g - 3.2);
  const archEnd = F(7.4, g - 1.4);
  ctx.quadraticCurveTo(arch.x, arch.y, archEnd.x, archEnd.y); // shallow concave arch
  const pb = F(7.6, g - 0.3);
  const pe = F(7.9, g);
  ctx.quadraticCurveTo(pb.x, pb.y, pe.x, pe.y);
  // Lug tread under the platform
  for (let i = 1; i <= 8; i++) ctx.lineTo(...xy(F(7.9 + i * 0.6, i % 2 ? g - 0.5 : g)));
  const tc = F(14.8, g);
  const tf = F(14.6, g - 2.8);
  ctx.quadraticCurveTo(tc.x, tc.y, tf.x, tf.y); // platform rounds up at the toe
  const bc = F(15.1, g - 6.7);
  const bt = F(10.6, g - 6.9);
  ctx.quadraticCurveTo(bc.x, bc.y, bt.x, bt.y); // round, bulbous toe box
  const ic = F(7.4, g - 8.6);
  ctx.quadraticCurveTo(ic.x, ic.y, front.x, front.y); // instep running up into the shaft
  ctx.lineTo(...xy(collarFront));
  const cc = add(top, s, -1.2);
  ctx.quadraticCurveTo(cc.x, cc.y, collarBack.x, collarBack.y); // padded, rounded collar
  ctx.closePath();
  ctx.fillStyle = far ? C.bootFar : C.boot;
  ctx.fill();
  if (far) return;

  // Welt where the upper meets platform and heel, and the seam under the padded collar
  ctx.strokeStyle = '#2b2632';
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(...xy(F(14.75, g - PLATFORM)));
  ctx.lineTo(...xy(F(8.2, g - PLATFORM)));
  const wc = F(3.4, g - PLATFORM - 0.6);
  const we = F(1.4, HEEL_TOP + 0.6);
  ctx.quadraticCurveTo(wc.x, wc.y, we.x, we.y);
  ctx.lineTo(...xy(F(-4.3, HEEL_TOP)));
  ctx.moveTo(...xy(add(add(top, s, 1.5), n, wt + 0.3)));
  ctx.lineTo(...xy(add(add(top, s, 1.5), n, -wt)));
  ctx.stroke();

  // Lacing: eyelets from the toe box up to the collar, laces zig-zagging over the tongue
  const line = [F(10.4, g - 6.1), add(add(front, n, 1.1), s, 0.4), add(add(collarFront, n, 1), s, 2)];
  const seg = [len(sub(line[1]!, line[0]!)), len(sub(line[2]!, line[1]!))];
  const eyelets = [0, 1, 2, 3, 4].map((i) => {
    let t = (i / 4) * (seg[0]! + seg[1]!);
    const k = t > seg[0]! ? 1 : 0;
    if (k) t -= seg[0]!;
    return add(line[k]!, norm(sub(line[k + 1]!, line[k]!)), t);
  });
  ctx.strokeStyle = '#3a3341';
  ctx.lineWidth = 0.45;
  ctx.beginPath();
  ctx.moveTo(...xy(eyelets[0]!));
  for (let i = 1; i < eyelets.length; i++) {
    const [p, e] = [eyelets[i - 1]!, eyelets[i]!];
    ctx.lineTo(...xy(add(v((p.x + e.x) / 2, (p.y + e.y) / 2), perpOf(norm(sub(e, p))), 0.9)));
    ctx.lineTo(e.x, e.y);
  }
  ctx.stroke();
  for (const [r, color] of [
    [0.5, C.metal],
    [0.24, '#141117'],
  ] as const) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const e of eyelets) {
      ctx.moveTo(e.x + r, e.y);
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}

/**
 * Knee-high goth boot: shaft along the shin with buckle straps, foot with pointed toe
 * and stiletto heel. In the foot frame the ankle is at (0, 0) and the ground at
 * y = SK.ankle (heel height) – matching the raised ankle position in the skeleton.
 */
function drawBoot(ctx: CanvasRenderingContext2D, l: Limb, far: boolean, grounded: boolean): void {
  const boot = far ? C.bootFar : C.boot;
  const s = norm(sub(l.ankle, l.knee));
  const n = perpOf(s);
  const top = add(l.knee, s, 2.5);

  // Shaft (slightly flared rim below the knee)
  fillPoly(ctx, [add(top, n, 5), add(top, n, -5), add(l.ankle, n, -3.6), add(l.ankle, n, 3.6)], boot);
  stroke(ctx, add(top, n, 5.2), add(top, n, -5.2), 1.4, boot);
  if (!far) stroke(ctx, add(add(top, s, 2), n, -2.4), add(add(l.ankle, s, -3), n, -2), 0.8, C.bootHi);

  // Buckle straps
  for (const t of [0.3, 0.62]) {
    const c = add(top, sub(l.ankle, top), t);
    stroke(ctx, add(c, n, 4.6), add(add(c, n, -4.6), s, 1.2), 1.3, '#1d1a22');
    ctx.fillStyle = C.buckle;
    const b = add(c, n, -1.6);
    ctx.fillRect(b.x - 0.9, b.y - 0.9, 1.8, 1.8);
  }

  // Foot with stiletto
  ctx.save();
  ctx.translate(l.ankle.x, l.ankle.y);
  const a = bootAngle(l, grounded);
  if (a) ctx.rotate(a);
  const g = SK.ankle;
  ctx.fillStyle = boot;
  ctx.beginPath();
  ctx.moveTo(-3.6, -2);
  ctx.lineTo(-3.8, g - 4.4); // back of heel
  ctx.lineTo(-2.6, g); // stiletto, bottom back
  ctx.lineTo(-1.6, g);
  ctx.lineTo(-1.2, g - 3.6); // stiletto, top front
  ctx.quadraticCurveTo(3.5, g - 2.6, 7.6, g - 0.4); // arch → ball of foot
  ctx.lineTo(13.6, g + 0.1); // pointed toe
  ctx.quadraticCurveTo(10, g - 3, 5.6, g - 4.8); // instep
  ctx.lineTo(3.4, -1.4);
  ctx.closePath();
  ctx.fill();
  if (!far) {
    ctx.strokeStyle = C.bootHi;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(5.8, g - 4.2);
    ctx.quadraticCurveTo(9.5, g - 2.6, 12.4, g - 0.4);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * What the hands do: hang relaxed and slightly curled (standing, walking), hook over the
 * edge (hanging, climbing), spread open (grabbed, falling, airborne) or rest flat on the
 * surface (sitting).
 */
type HandPose = 'relaxed' | 'grip' | 'open' | 'flat';

function handPoseOf(rs: RenderState): HandPose {
  switch (rs.state) {
    case MascotState.HANG_ON_EDGE:
    case MascotState.CLIMB:
      return 'grip';
    case MascotState.FALL:
    case MascotState.GRABBED:
      return 'open';
    case MascotState.JUMP:
      return rs.jumpCrouch > 0 ? 'relaxed' : 'open';
    case MascotState.SIT_ON_ELEMENT:
      return 'flat';
    default:
      return 'relaxed';
  }
}

/**
 * Hand frame: u along the hand (wrist → fingertips), w across it (+w = the side the
 * fingers curl to; the thumb sits on −w). `at` = wrist offset along the forearm from the
 * IK hand point.
 */
interface HandShape {
  at: number;
  palm: number;
  wrist: number;
  knuckle: number;
  /** Spacing of the finger roots across the knuckles (≈0 = seen from the side, stacked). */
  spread: number;
  /** Angle between neighbouring fingers. */
  fan: number;
  /** Bend at the knuckles and at the middle joints (toward +w). */
  bend: readonly [number, number];
  /** Thumb angle off the hand axis toward −w; null = hidden under the hand. */
  thumb: number | null;
  /** Lines between the fingers (only where they lie side by side). */
  creases: boolean;
}

const HANDS: Record<HandPose, HandShape> = {
  relaxed: {
    at: 0,
    palm: 4.2,
    wrist: 1.65,
    knuckle: 1.9,
    spread: 0.9,
    fan: 0.035,
    bend: [0.16, 0.32],
    thumb: 0.42,
    creases: true,
  },
  grip: {
    at: -3.3,
    palm: 3.8,
    wrist: 1.5,
    knuckle: 1.55,
    spread: 0.2,
    fan: 0,
    bend: [1.45, 0.95],
    thumb: null, // pressed against the face of the edge
    creases: false,
  },
  open: {
    at: 0,
    palm: 4.1,
    wrist: 1.65,
    knuckle: 1.95,
    spread: 1.0,
    fan: 0.24,
    bend: [-0.06, 0.06],
    thumb: 0.95,
    creases: false,
  },
  flat: {
    at: 0,
    palm: 4.3,
    wrist: 1.2,
    knuckle: 1.05,
    spread: 0.28,
    fan: 0,
    bend: [0.05, 0.08],
    thumb: null,
    creases: false,
  },
};

/** Index → pinky: length, root radius and how far the root sits behind the knuckle line. */
const FINGERS = [
  [3.5, 0.5, 0.15],
  [3.9, 0.52, 0],
  [3.6, 0.49, 0.12],
  [2.9, 0.43, 0.45],
] as const;

/** One finger (or the thumb) as a closed, tapered subpath: root → joint → round tip. */
function fingerPath(
  ctx: CanvasRenderingContext2D,
  root: Vec2,
  a0: number,
  a1: number,
  l0: number,
  l1: number,
  r: number,
): { joint: Vec2; tip: Vec2 } {
  const d0 = v(Math.cos(a0), Math.sin(a0));
  const d1 = v(Math.cos(a1), Math.sin(a1));
  const joint = add(root, d0, l0);
  const tip = add(joint, d1, l1);
  const pj = norm(perpOf(add(d0, d1))); // joint normal, toward +w
  const p0 = perpOf(d0);
  const p1 = perpOf(d1);
  const rt = r * 0.78;
  ctx.moveTo(root.x - p0.x * r, root.y - p0.y * r);
  ctx.lineTo(joint.x - pj.x * r * 0.9, joint.y - pj.y * r * 0.9);
  ctx.lineTo(tip.x - p1.x * rt, tip.y - p1.y * rt);
  ctx.arc(tip.x, tip.y, rt, a1 - Math.PI / 2, a1 + Math.PI / 2);
  ctx.lineTo(joint.x + pj.x * r * 0.9, joint.y + pj.y * r * 0.9);
  ctx.lineTo(root.x + p0.x * r, root.y + p0.y * r);
  ctx.closePath();
  return { joint, tip };
}

/**
 * A hand: palm, four tapered fingers and a thumb as one path (filled once over a thin
 * contour, so overlapping parts merge into one silhouette), plus creases between the
 * fingers and a silver ring. The pose decides how the fingers curl or spread.
 */
function drawHand(ctx: CanvasRenderingContext2D, l: Limb, far: boolean, pose: HandPose): void {
  const fd = norm(sub(l.hand, l.elbow));
  const h = HANDS[pose];
  // A flat hand lies along the surface (palm down), fingers pointing away from the body.
  const dir = pose === 'flat' ? v(fd.x < 0 ? -1 : 1, 0) : fd;
  const wrist = add(l.hand, fd, h.at);
  ctx.save();
  ctx.translate(wrist.x, wrist.y);
  ctx.rotate(Math.atan2(dir.y, dir.x));
  if (pose === 'flat' && dir.x < 0) ctx.scale(1, -1); // keep +w (the palm) toward the surface
  ctx.beginPath();
  ctx.moveTo(-0.8, -h.wrist);
  ctx.quadraticCurveTo(h.palm * 0.5, -h.wrist - 0.25, h.palm, -h.knuckle);
  ctx.lineTo(h.palm + 0.3, 0);
  ctx.lineTo(h.palm, h.knuckle);
  ctx.quadraticCurveTo(h.palm * 0.5, h.wrist + 0.2, -0.8, h.wrist);
  ctx.closePath();
  const tips: Array<{ root: Vec2; joint: Vec2; tip: Vec2 }> = [];
  FINGERS.forEach(([len, r, back], i) => {
    const k = i - 1.5;
    const root = v(h.palm - back - 0.2, k * h.spread);
    const a0 = k * h.fan + h.bend[0];
    tips.push({ root, ...fingerPath(ctx, root, a0, a0 + h.bend[1], len * 0.5, len * 0.5, r) });
  });
  if (h.thumb !== null) {
    const a0 = -h.thumb;
    fingerPath(ctx, v(1, -h.wrist * 0.75), a0, a0 + 0.35, 2, 1.7, 0.66);
  }
  ctx.strokeStyle = C.skinLine;
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.fillStyle = far ? C.skinFar : C.skin;
  ctx.fill();
  if (h.creases) {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = tips[i]!;
      const b = tips[i + 1]!;
      const mid = (p: Vec2, q: Vec2) => v((p.x + q.x) / 2, (p.y + q.y) / 2);
      const end = mid(a.tip, b.tip);
      const j = mid(a.joint, b.joint);
      ctx.moveTo(...xy(mid(a.root, b.root)));
      ctx.lineTo(j.x, j.y);
      ctx.lineTo(...xy(add(end, norm(sub(j, end)), 0.7)));
    }
    ctx.lineWidth = 0.35;
    ctx.stroke();
  }
  // Ring on the ring finger
  const ring = tips[2]!;
  const rp = add(ring.root, sub(ring.joint, ring.root), 0.55);
  ctx.fillStyle = C.metal;
  ctx.beginPath();
  ctx.arc(rp.x, rp.y, 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const xy = (p: Vec2): [number, number] => [p.x, p.y];

/** Velvet sleeve with bell end and lace cuff – or a bare arm (`bare`, corset outfit). */
function drawArm(
  ctx: CanvasRenderingContext2D,
  shoulder: Vec2,
  l: Limb,
  far: boolean,
  bare: boolean,
  pose: HandPose,
): void {
  const skin = far ? C.skinFar : C.skin;
  const fd = norm(sub(l.hand, l.elbow));
  if (bare) {
    const s = add(shoulder, v((far ? -2.5 : 0.5) + l.shoulderShift, 1.5));
    const wrist = add(l.hand, fd, HANDS[pose].at + 0.4);
    // A faint contour keeps the arm readable in front of the bare shoulders.
    if (!far) {
      stroke(ctx, s, l.elbow, 5.8, C.skinLine);
      stroke(ctx, l.elbow, wrist, 4.9, C.skinLine);
    }
    // Hand first: the forearm covers its wrist edge.
    drawHand(ctx, l, far, pose);
    stroke(ctx, s, l.elbow, 5, skin);
    // Forearm tapering toward the wrist
    ctx.fillStyle = skin;
    ctx.beginPath();
    cap(ctx, l.elbow, wrist, 2.05);
    band(ctx, l.elbow, wrist, 2.05, 1.7);
    ctx.fill();
    return;
  }
  const velvet = far ? C.velvetFar : C.velvet;
  const s = add(shoulder, v((far ? -2.5 : 1) + l.shoulderShift, 1.5));
  const n = perpOf(fd);

  // Hand (the wrist hides in the sleeve)
  drawHand(ctx, l, far, pose);

  // Upper arm
  stroke(ctx, s, l.elbow, 7.4, velvet);
  // Bell sleeve
  const cuff = add(l.hand, fd, HANDS[pose].at - 2.2); // follows the wrist
  const bell = [
    add(l.elbow, n, 3.4),
    add(l.elbow, n, -3.4),
    add(cuff, n, -6.8),
    add(add(cuff, fd, 2.5), n, 0),
    add(cuff, n, 6.8),
  ];
  fillPoly(ctx, bell, velvet);
  // Lace cuff
  ctx.beginPath();
  ctx.moveTo(...xy(add(cuff, n, -6.4)));
  ctx.quadraticCurveTo(cuff.x + fd.x * 3.2, cuff.y + fd.y * 3.2, ...xy(add(cuff, n, 6.4)));
  laceStroke(ctx, 2.6, 0.7, [0.8, 0.9]);
}

function convexHull(points: Vec2[]): Vec2[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Point along hip→knee→ankle, u ∈ [0, 1]. */
function alongLeg(hip: Vec2, l: Limb, u: number): { p: Vec2; d: Vec2 } {
  const t = u * (SK.thigh + SK.shin);
  if (t <= SK.thigh) {
    const d = norm(sub(l.knee, hip));
    return { p: add(hip, d, t), d };
  }
  const d = norm(sub(l.ankle, l.knee));
  return { p: add(l.knee, d, t - SK.thigh), d };
}

/**
 * Layered skirt: each layer is a convex hull over the waist + points along both legs
 * (so it adapts automatically to walking, sitting, falling) plus pointed tips at the hem.
 */
function drawSkirtLayer(
  ctx: CanvasRenderingContext2D,
  sk: Skeleton,
  hem: number[],
  hemU: number,
  width: number,
  color: string,
  tipLen: number,
  seed: number,
  lace: boolean,
): void {
  const td = upDir(sk.torso);
  const tp = perpOf(td);
  const waist = add(sk.hip, td, 12);
  const w = width + sk.skirtFlare * 3;
  const pts: Vec2[] = [add(waist, tp, 6.5), add(waist, tp, -6.5), add(sk.hip, tp, 9), add(sk.hip, tp, -9.5)];
  const hems: Array<{ p: Vec2; d: Vec2 }> = [];
  for (const [off, l, swing] of [
    [2.5, sk.near, hem[0]!],
    [-2.5, sk.far, hem[1]!],
  ] as const) {
    const h = add(sk.hip, v(off, 0));
    for (const u of [hemU * 0.5, hemU]) {
      const a = alongLeg(h, l, u);
      const n = perpOf(a.d);
      const ww = u === hemU ? w : w * 0.85;
      pts.push(add(a.p, n, ww), add(a.p, n, -ww));
      if (u === hemU) {
        // The hem trails (or swings past) the leg about the hip; the leg itself stays covered.
        const d = rot(a.d, -swing);
        const p = add(h, rot(sub(a.p, h), -swing));
        pts.push(add(p, perpOf(d), w), add(p, perpOf(d), -w));
        hems.push({ p, d });
      }
    }
  }
  const hull = convexHull(pts);
  fillPoly(ctx, hull, color);

  // Handkerchief hem (asymmetric)
  hems.forEach((hm, hi) => {
    const n = perpOf(hm.d);
    for (let i = 0; i < 4; i++) {
      const o = -w + (i + 0.5) * ((2 * w) / 4);
      // High-low hem: i = 0 is at the front (n points backward for hanging legs) → longer at the back
      const len = tipLen * (0.6 + i * 0.22) * (0.75 + 0.25 * Math.abs(Math.sin(seed + i * 1.7 + hi * 2.3)));
      const base = add(hm.p, n, o);
      const tip = add(add(base, hm.d, len), n, (i - 1.5) * 1.2);
      ctx.beginPath();
      ctx.moveTo(...xy(add(base, n, -w / 4)));
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(...xy(add(base, n, w / 4)));
      ctx.closePath();
      ctx.fill();
    }
  });

  if (lace) {
    // Lace pattern: small arcs, clipped to the layer
    ctx.save();
    ctx.beginPath();
    polyPath(ctx, hull);
    ctx.clip();
    ctx.strokeStyle = C.laceHi;
    ctx.lineWidth = 0.6;
    const { x0, x1, y0, y1 } = bbox(hull);
    // One path for all scallops: moveTo starts each arc as its own subpath (no connecting
    // lines), so a single stroke draws the whole pattern.
    ctx.beginPath();
    for (let y = y0; y < y1; y += 3.2) {
      for (let x = x0 + ((y / 3.2) % 2) * 1.6; x < x1; x += 3.2) {
        ctx.moveTo(x + 1.1, y);
        ctx.arc(x, y, 1.1, 0, Math.PI);
      }
    }
    ctx.stroke();
    ctx.restore();
  }
}

/** `hem` = swing of the hem behind each leg [near, far] (rad, + = forward). */
function drawSkirt(ctx: CanvasRenderingContext2D, sk: Skeleton, hem: number[]): void {
  drawSkirtLayer(ctx, sk, hem, 0.6, 9, C.lace, 9, 0.3, true); // calf-length lace underlayer
  drawSkirtLayer(ctx, sk, hem, 0.5, 8.6, C.chiffon, 8, 1.9, false); // chiffon
  drawSkirtLayer(ctx, sk, hem, 0.32, 8.2, C.velvet, 6, 4.1, false); // velvet overskirt
}

/** Two-layer ruffled miniskirt: velvet over a slightly longer lace layer. */
function drawMiniSkirt(ctx: CanvasRenderingContext2D, sk: Skeleton, hem: number[]): void {
  drawSkirtLayer(ctx, sk, hem, 0.25, 8.8, C.lace, 3.6, 0.7, true);
  drawSkirtLayer(ctx, sk, hem, 0.2, 8.4, C.velvet, 3, 2.9, false);
}

/**
 * Point on the torso `d` up the spine and `o` towards the front, and draws the neck.
 * The shoulders' offset from the rigid torso line (the walk's chest compensation) is spread
 * along the spine, so the waist follows the hip and the bust the shoulders.
 */
function torsoFrame(ctx: CanvasRenderingContext2D, sk: Skeleton): (d: number, o: number) => Vec2 {
  const td = upDir(sk.torso);
  const tp = perpOf(td); // +tp = front side
  const flex = sub(sk.shoulder, add(sk.hip, td, SK.torso));
  stroke(ctx, add(sk.shoulder, td, -2), add(sk.neck, td, 3), 5, C.skin);
  return (d, o) => add(add(add(sk.hip, td, d), tp, o), flex, d / SK.torso);
}

function drawTorso(ctx: CanvasRenderingContext2D, sk: Skeleton): void {
  const at = torsoFrame(ctx, sk);

  // Velvet top with bust and waist
  fillPoly(
    ctx,
    [
      at(SK.torso, -6.5),
      at(SK.torso - 1, 4.5),
      at(27, 8.2),
      at(22, 6.4),
      at(14, 5.2),
      at(2, 7),
      at(2, -7.5),
      at(14, -5.4),
      at(26, -6.4),
    ],
    C.velvet,
  );

  // Neckline with lace trim
  fillPoly(ctx, [at(SK.torso + 0.5, -1.5), at(SK.torso, 4.6), at(30.5, 7.4), at(30, 1.6)], C.skin);
  ctx.beginPath();
  polyPath(ctx, [at(30, 1.2), at(30.4, 7.8)], false);
  laceStroke(ctx, 1.8, 0.7, [0.7, 0.8]);

  // Corset with front lacing
  fillPoly(ctx, [at(22, 6.8), at(13.5, 5.6), at(3, 7.4), at(3, -7.8), at(13.5, -5.8), at(22, -6.8)], C.corset);
  for (const o of [-3.5, 0, 3]) stroke(ctx, at(21, o), at(4, o * 1.1), 0.5, 'rgba(80, 70, 90, 0.5)');
  ctx.strokeStyle = C.lacing;
  ctx.lineWidth = 0.6;
  for (let d = 5; d < 21; d += 2.8) {
    const ox = d > 12 ? 4.6 : 5.4;
    const a = at(d, ox - 1.6);
    const b = at(d + 2.8, ox);
    const c2 = at(d, ox);
    const e = at(d + 2.8, ox - 1.6);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.moveTo(c2.x, c2.y);
    ctx.lineTo(e.x, e.y);
    ctx.stroke();
  }
  // Velvet sheen along the front edge
  stroke(ctx, at(29, 7.4), at(23, 6.2), 0.9, C.velvetHi);

  drawChoker(ctx, sk, false);
}

/** Choker with a metal pendant, or a red drop (`red`). */
function drawChoker(ctx: CanvasRenderingContext2D, sk: Skeleton, red: boolean): void {
  const td = upDir(sk.torso);
  const tp = perpOf(td);
  const chokerAt = add(sk.shoulder, td, SK.neck * 0.75);
  stroke(ctx, add(chokerAt, tp, 2.6), add(chokerAt, tp, -2.6), 1.8, C.liner);
  const pend = add(add(chokerAt, tp, 2.2), td, -2.4);
  stroke(ctx, add(chokerAt, tp, 2.2), pend, 0.5, C.metal);
  ctx.fillStyle = red ? C.red : C.metal;
  ctx.beginPath();
  if (red) {
    const tip = add(pend, td, -1.1);
    ctx.ellipse(tip.x, tip.y, 0.9, 1.3, sk.torso, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.redHi;
    ctx.beginPath();
    ctx.arc(tip.x - 0.3, tip.y - 0.4, 0.35, 0, Math.PI * 2);
  } else ctx.arc(pend.x, pend.y, 0.9, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Corset top (corset outfit): bare shoulders, thin straps, an overbust corset with lace
 * trim, boning and front lacing.
 */
function drawCorsetTop(ctx: CanvasRenderingContext2D, sk: Skeleton): void {
  const at = torsoFrame(ctx, sk);

  // Shoulders and décolleté
  fillPoly(ctx, [at(SK.torso + 0.5, -6.6), at(SK.torso, 4.2), at(30, 7.6), at(27, 8.4), at(25.5, -6.6)], C.skin);
  stroke(ctx, at(31.5, 2.2), at(29.4, 3.4), 0.5, C.skinLine); // collarbone

  // Corset, cut straight under the arms, rising over the bust
  const body = [
    at(28.6, 8.6),
    at(22, 6.4),
    at(14, 5.2),
    at(2, 7),
    at(2, -7.5),
    at(14, -5.4),
    at(25.8, -6.6),
    at(27.2, 1),
  ];
  fillPoly(ctx, body, C.corset);
  // Straps
  stroke(ctx, at(28.4, 5.2), at(SK.torso + 0.3, 1.4), 0.7, C.corset);
  stroke(ctx, at(26.4, -4.4), at(SK.torso + 0.3, -1.6), 0.7, C.corset);
  // Lace trim along the top edge
  ctx.beginPath();
  polyPath(ctx, [at(25.8, -6.6), at(27.2, 1), at(28.6, 8.6)], false);
  laceStroke(ctx, 1.5, 0.6, [0.7, 0.8]);
  // Boning
  for (const o of [-3.5, 0, 2.6]) stroke(ctx, at(25, o), at(4, o * 1.1), 0.5, 'rgba(80, 70, 90, 0.5)');
  // Front lacing, as on the classic corset
  ctx.strokeStyle = C.lacing;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let d = 4; d < 25; d += 2.6) {
    const ox = d > 13 ? 4.4 : 5.2;
    const [a, b, c2, e] = [at(d, ox - 1.6), at(d + 2.6, ox), at(d, ox), at(d + 2.6, ox - 1.6)];
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.moveTo(c2.x, c2.y);
    ctx.lineTo(e.x, e.y);
  }
  ctx.stroke();
  // Satin sheen along the front edge
  stroke(ctx, at(27.6, 7.6), at(22.5, 6), 0.8, C.velvetHi);

  drawChoker(ctx, sk, true);
}

function inHeadFrame(ctx: CanvasRenderingContext2D, sk: Skeleton, fn: () => void): void {
  ctx.save();
  ctx.translate(sk.head.x, sk.head.y);
  ctx.rotate(sk.headAngle);
  ctx.scale(HEAD_S, HEAD_S);
  fn();
  ctx.restore();
}

/** Long straight hair down to mid-back – hangs with gravity and swings with follow-through. */
function drawBackHair(ctx: CanvasRenderingContext2D, sk: Skeleton, hairSway: number): void {
  inHeadFrame(ctx, sk, () => {
    // Hair hangs "down" in world space: partially undo the head rotation
    ctx.rotate(-sk.headAngle * 0.7);
    const sway = hairSway * 9;
    const lift = sk.hairLift * 22;
    const tipY = 62 - lift;
    ctx.fillStyle = C.hair;
    ctx.beginPath();
    ctx.moveTo(4, -13.5);
    ctx.quadraticCurveTo(-12, -17, -14.5, -2);
    ctx.quadraticCurveTo(-17 + sway * 0.3, tipY * 0.5, -15 + sway, tipY);
    for (let i = 0; i < 6; i++) {
      const x = -15 + sway + i * 2.9;
      ctx.lineTo(x + 1.4, tipY + (i % 2 ? 2.5 : -1.5));
    }
    ctx.lineTo(3 + sway * 0.8, tipY - 3);
    ctx.quadraticCurveTo(2 + sway * 0.3, 20, 1, 6);
    ctx.closePath();
    ctx.fill();
  });
}

function drawHead(ctx: CanvasRenderingContext2D, sk: Skeleton, rs: RenderState): void {
  inHeadFrame(ctx, sk, () => {
    // Face (3⁄4 view facing right), slightly narrower/more grown-up
    ctx.fillStyle = C.skin;
    ctx.beginPath();
    ctx.ellipse(0.5, 0, 10.5, 12.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(5.2, 6.4, 5.4, 5.4, 0.5, 0, Math.PI * 2);
    ctx.fill();

    const eye = (x: number, w: number, outer: 1 | -1) => {
      const ey = 1.5;
      if (rs.blink || rs.mood === 'annoyed') {
        ctx.strokeStyle = C.liner;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        if (rs.mood === 'annoyed' && !rs.blink) {
          ctx.moveTo(x - w, ey - 0.6);
          ctx.lineTo(x + w, ey - 0.2);
        } else {
          ctx.moveTo(x - w, ey);
          ctx.quadraticCurveTo(x, ey + 1.3, x + w, ey);
        }
        ctx.stroke();
        return;
      }
      const open = rs.mood === 'surprised' ? 1.3 : 1;
      ctx.fillStyle = '#fbf3ef';
      ctx.beginPath();
      ctx.ellipse(x, ey, w, 1.7 * open, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.iris;
      ctx.beginPath();
      ctx.arc(x + sk.pupil.x * 0.7, ey + sk.pupil.y * 0.5 + 0.1, 1.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x + sk.pupil.x * 0.7 + 0.45, ey - 0.45, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = C.liner;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(x - w, ey - 0.1);
      ctx.quadraticCurveTo(x, ey - 2.5 * open, x + w, ey - 0.1);
      ctx.stroke();
      const corner = x + outer * w;
      ctx.beginPath();
      ctx.moveTo(corner, ey - 0.1);
      ctx.lineTo(corner + outer * 1.4, ey - 1.1);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(70, 40, 60, 0.35)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(x - w * 0.8, ey + 1.7);
      ctx.quadraticCurveTo(x, ey + 2.3, x + w * 0.8, ey + 1.7);
      ctx.stroke();
    };
    eye(2.6, 2.4, -1);
    eye(9.3, 1.4, 1);

    // straight brows
    ctx.strokeStyle = C.hair;
    ctx.lineWidth = 0.8;
    const browTilt = rs.mood === 'annoyed' ? 0.9 : rs.mood === 'surprised' ? -0.8 : 0;
    ctx.beginPath();
    ctx.moveTo(0.4, -2.4 - browTilt * 0.3);
    ctx.lineTo(4.6, -2.5 + browTilt);
    ctx.moveTo(8.2, -2.5 + browTilt);
    ctx.lineTo(10.4, -2.3 - browTilt * 0.3);
    ctx.stroke();

    // Nose + dark lips
    ctx.strokeStyle = C.skinLine;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(10.6, 3);
    ctx.lineTo(11.1, 5.3);
    ctx.lineTo(10.2, 5.6);
    ctx.stroke();
    ctx.fillStyle = C.lips;
    ctx.strokeStyle = C.lips;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    switch (rs.mood) {
      case 'surprised':
        ctx.ellipse(7.8, 9, 1.1, 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'happy':
        ctx.moveTo(5.9, 8.4);
        ctx.quadraticCurveTo(7.8, 10.2, 9.6, 8.4);
        ctx.stroke();
        break;
      case 'annoyed':
        ctx.moveTo(6, 9.3);
        ctx.lineTo(9.3, 8.9);
        ctx.stroke();
        break;
      default:
        ctx.ellipse(7.8, 8.9, 1.6, 0.7, -0.05, 0, Math.PI * 2);
        ctx.fill();
    }
  });
}

/** Blunt bangs + a long side lock falling in front of the shoulder. */
function drawFrontHair(ctx: CanvasRenderingContext2D, sk: Skeleton, hairSway: number): void {
  inHeadFrame(ctx, sk, () => {
    const sway = hairSway * 3;
    const lift = sk.hairLift * 8;
    ctx.fillStyle = C.hair;
    ctx.beginPath();
    ctx.moveTo(-12.5, 4);
    ctx.quadraticCurveTo(-14, -13.5, 0, -15);
    ctx.quadraticCurveTo(10.5, -15, 12.6, -5);
    ctx.lineTo(12.2, -3.4);
    // blunt, thick bangs
    ctx.lineTo(8.5, -3.7);
    ctx.lineTo(6.8, -3);
    ctx.lineTo(4.8, -3.9);
    ctx.lineTo(1, -3.4);
    // long side lock
    ctx.quadraticCurveTo(0.5, 12, 0.5 + sway, 22 - lift);
    ctx.lineTo(-4 + sway, 24 - lift);
    ctx.quadraticCurveTo(-5.5 + sway * 0.5, 14, -6, 6);
    ctx.lineTo(-11 + sway * 0.4, 11 - lift * 0.5);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = C.hairHi;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(-1, -4, 9, -2.4, -1.4);
    ctx.stroke();
  });
}
