import { cycleLength, GAIT, type GaitTuning } from '../gait';
import { clamp, lerp, smoothstep, type Vec2, type Wobble } from '../types';

/**
 * Walk cycle of the Pagegeist skeleton as pure functions (shared by the renderer and the
 * locomotion in Mascot). All lengths are skeleton units (standing height = UNIT_HEIGHT), local
 * space: x forward (facing direction), y down, ground at y = 0.
 *
 * Phase conventions:
 *   - cycle phase u = walked distance / cycleLength (one cycle = two steps)
 *   - foot phase w ∈ [0, 1): 0 = contact, [0, stance) on the ground, then swing.
 *     The near foot has w = u, the far foot w = u + 0.5.
 *   - step phase t ∈ [0, 1): 0 = contact of the "lead" foot (the one that just landed).
 *
 * Body motion (hip, torso, arms) is keyed per step (Richard Williams' contact → down →
 * passing → up), the swing foot per swing. The stance foot is not keyed: it moves
 * backward at exactly body speed, so it stays planted in world space.
 */

/** Skeleton units of the full standing height (renderer scale = height / UNIT_HEIGHT). */
export const UNIT_HEIGHT = 120;

/** Leg bones and ankle height above the sole (the stiletto heel) in skeleton units. */
export const LEG: { readonly thigh: number; readonly shin: number; readonly ankle: number } = {
  thigh: 30,
  shin: 24,
  ankle: 8,
};

/**
 * Toe pivot in the foot frame (ankle = origin, y down): the boot rolls over it at toe-off.
 * Close to the pointed tip, so the tip barely dips below the ground while rolling.
 */
export const TOE: Vec2 = { x: 12.8, y: LEG.ankle };

/** Heel tip (bottom of the stiletto) in the foot frame: the boot rocks on it right after contact. */
export const HEEL: Vec2 = { x: -2.1, y: LEG.ankle };

/** Sole centre relative to the toe pivot (part of the foot geometry; formerly the footprint stamp point). */
export const PRINT_DX = -7.3;

/** Scalar tuning of the cycle. Mutable on purpose (hand-tuning in the playground). */
export const WALK: {
  /** Minimum knee flexion (rad) of the stance leg – the base hip height is solved from it. */
  minKnee: number;
  /** Minimum knee flexion of the swing leg (terminal swing reaches almost straight). */
  minKneeSwing: number;
  /** Foot phase until which the boot rocks from the heel tip onto the ball (heel rocker). */
  rocker: number;
  /** Fraction of stance after which the heel starts to rise. */
  heelRise: number;
  /** Heel rise speed kept at toe-off (0 = eases out, 1 = still accelerating) – carries into the swing. */
  heelSnap: number;
  /** Centre of the stance ankle range relative to the hip (+ = forward). */
  center: number;
  /** Base torso pitch (rad, + = forward, − = leaning back). */
  lean: number;
  /** Arm swing amplitude (scales the keyed shoulder angles). */
  armSwing: number;
  /** Arm phase lag behind the legs (fraction of a cycle). */
  armLag: number;
  /** Elbow bend: base + gain × forward shoulder angle (rad). */
  elbow: number;
  elbowGain: number;
  /** Forearm follow-through: elbow opens/closes by this × the shoulder's recent travel. */
  forearmDrag: number;
  /** Shoulder shift (units, + = forward) per rad of arm swing – counter-rotation to the pelvis. */
  shoulderShift: number;
  /** Fraction of the hip bob the upper body absorbs (a slightly springy spine; 0 = rigid). */
  chestComp: number;
  /** Head moves down by this fraction of the remaining bob (1 = head height fully steady). */
  headComp: number;
  /** Head tilt (rad, − = chin up). */
  chin: number;
  /** Step length scale at a standstill – short steps while speeding up and braking. */
  minStride: number;
  /** Half-life (s) of the walking speed spring (speeding up). */
  ease: number;
  /** Braking deceleration in full walking speeds per second. */
  brake: number;
  /** Duration (s) of a turn on the spot (facing flip). */
  turn: number;
  /** Cycle phase a fresh walk starts at (feet close together, near the passing pose). */
  start: number;
} = {
  minKnee: 0.21, // 12°: high-heel gait lands with a flexed knee
  minKneeSwing: 0.1,
  rocker: 0.06,
  heelRise: 0.7, // late heel rise: the foot is already plantar-flexed in stilettos
  heelSnap: 0.3,
  center: -2,
  lean: -0.02, // upright, a touch leaned back: cool, slightly annoyed
  armSwing: 0.85,
  armLag: 0.06,
  elbow: 0.22,
  elbowGain: 0.9,
  forearmDrag: 0.3,
  shoulderShift: 3,
  chestComp: 0.5,
  headComp: 0.6,
  chin: -0.05,
  minStride: 0.45,
  ease: 0.2,
  brake: 3,
  turn: 0.25,
  start: 0.2,
};

/**
 * Secondary motion of hair and skirt: small underdamped springs that lag behind the body
 * (no cloth simulation). Heavy velvet and long hair: low frequencies, settles within ~1 s.
 * Mutable like WALK.
 */
export const SWAY: {
  /** Hair spring [Hz, damping ratio]: sways with the movement, bounces with the hip. */
  hair: Wobble;
  /** Speed (px/s at physics scale 1) that blows the hair fully back. */
  speed: number;
  /** Acceleration feed (s): the hair also trails by this × acceleration (≈ 1 / (2·damping·ω) is physical). */
  inertia: number;
  /** Hair lift (pose hairLift units, 1 = fully lifted) per skeleton unit the hip ran ahead of the hair. */
  bounce: number;
  /** Max extra hair lift from the bounce. */
  bounceMax: number;
  /** Hem spring [Hz, damping ratio], following each thigh's angle. */
  skirt: Wobble;
  /** Fraction of the thigh's lag the hem shows (0 = hem glued to the legs). */
  hem: number;
  /** Max hem swing (rad) – keeps falls and dangling legs calm. */
  hemMax: number;
} = {
  hair: [1.33, 0.54],
  speed: 500,
  inertia: 0.1,
  bounce: 0.05,
  bounceMax: 0.2,
  skirt: [1.5, 0.5],
  hem: 0.25,
  hemMax: 0.15,
};

/** Body key pose. Arm channels refer to the lead/trail leg's side and swap every step. */
export interface StepKey {
  /** Step phase. */
  t: number;
  /** Hip height offset as a fraction of the peak-to-peak bob (+ = up). Keep within ±0.5. */
  hip: number;
  /** Torso pitch on top of WALK.lean (rad, + = forward). */
  pitch: number;
  /** Shoulder angle of the arm on the lead leg's side (rad, + = forward). */
  armLead: number;
  /** Shoulder angle of the arm on the trailing leg's side. */
  armTrail: number;
}

/**
 * One step; the next one mirrors it (armLead ↔ armTrail). Values at extremes are held
 * exactly (zero tangent), so ±0.5 hip keys give exactly the GAIT.bob amplitude. Arms are
 * keyed in sync with the legs; WALK.armLag delays them. Modest swing, more forward than
 * back – she is cool, slightly annoyed, not marching.
 */
export const STEP_KEYS: readonly StepKey[] = [
  // contact: heel tip strikes, legs spread → lowest hip, opposite arm forward
  { t: 0, hip: -0.5, pitch: 0, armLead: -0.18, armTrail: 0.3 },
  // down: weight accepted on a firm knee, hip already rising, torso dips forward
  { t: 0.1, hip: -0.25, pitch: 0.02, armLead: -0.14, armTrail: 0.26 },
  // passing: stance leg under the hip, swing foot passes → highest hip
  { t: 0.48, hip: 0.5, pitch: -0.01, armLead: 0.05, armTrail: 0.04 },
  // up: heel of the stance foot rising, body falls forward into the next step
  { t: 0.75, hip: 0.05, pitch: 0, armLead: 0.2, armTrail: -0.1 },
];

/** Swing foot key (keyed over the swing, 0 = toe-off, 1 = contact). */
export interface SwingKey {
  t: number;
  /** Height of the foot reference point (toe pivot, or heel tip when toe up) above the ground. */
  lift: number;
  /** Foot pitch (rad, + = toe down). */
  pitch: number;
}

/**
 * Quick clearance after toe-off, peak early, then reach forward and align before contact.
 * The first pitch is the toe-off angle of the stance roll, the last one the heel-strike
 * angle (toe up) the stance rocker starts from.
 */
export const SWING_KEYS: readonly SwingKey[] = [
  { t: 0, lift: 0, pitch: 0.5 }, // toe-off: rolled onto the toe (stance heel rise ends here)
  { t: 0.28, lift: 5, pitch: 0.5 }, // clearance: foot snaps up, toe hangs down
  { t: 0.55, lift: 3.6, pitch: 0.25 }, // swing through
  { t: 0.85, lift: 1.6, pitch: 0.03 }, // reach: leg extends, foot aligns for the heel strike
  { t: 1, lift: 0, pitch: -0.14 }, // contact: lands on the heel tip, toe slightly up
];

const swapArms = (k: StepKey): StepKey => ({ ...k, armLead: k.armTrail, armTrail: k.armLead });

/**
 * Cubic Hermite through keys with Catmull-Rom tangents (non-uniform), tangent 0 at local
 * extremes. With `wrap` the keys repeat every 1.0, mirrored by `wrap` on odd periods;
 * without it the ends are clamped.
 */
function spline<K extends { t: number }>(keys: readonly K[], t: number, wrap?: (k: K) => K): K {
  const n = keys.length;
  const at = (i: number): K => {
    if (!wrap) return keys[clamp(i, 0, n - 1)]!;
    const c = Math.floor(i / n);
    const k = keys[i - c * n]!;
    return { ...(c & 1 ? wrap(k) : k), t: k.t + c };
  };
  let i = 0;
  while (i < n - 1 && keys[i + 1]!.t <= t) i++;
  const k0 = at(i - 1) as K & Record<string, number>;
  const k1 = at(i) as K & Record<string, number>;
  const k2 = at(i + 1) as K & Record<string, number>;
  const k3 = at(i + 2) as K & Record<string, number>;
  const span = k2.t - k1.t || 1;
  const s = clamp((t - k1.t) / span, 0, 1);
  const tan = (a: number, b: number, c: number, ta: number, tc: number) =>
    (b - a) * (c - b) <= 0 ? 0 : ((c - a) / (tc - ta)) * span;
  const out: Record<string, number> = { t };
  for (const ch in k1) {
    if (ch === 't') continue;
    const p1 = k1[ch]!;
    const p2 = k2[ch]!;
    const m1 = tan(k0[ch]!, p1, p2, k0.t, k2.t);
    const m2 = tan(p1, p2, k3[ch]!, k1.t, k3.t);
    const s2 = s * s;
    const s3 = s2 * s;
    out[ch] = (2 * s3 - 3 * s2 + 1) * p1 + (s3 - 2 * s2 + s) * m1 + (-2 * s3 + 3 * s2) * p2 + (s3 - s2) * m2;
  }
  return out as K;
}

const frac = (x: number): number => x - Math.floor(x);

/** Rotates like `ctx.rotate(a)` in y-down space. */
export const rot = (p: Vec2, a: number): Vec2 => ({
  x: p.x * Math.cos(a) - p.y * Math.sin(a),
  y: p.x * Math.sin(a) + p.y * Math.cos(a),
});

/** Body key pose at step phase t (cyclic, seamless at 0/1). */
export function stepKey(t: number): StepKey {
  return spline(STEP_KEYS, frac(t), swapArms);
}

/** Cycle phase for a walked distance in px. */
export function walkPhase(distance: number, height: number, gait: GaitTuning = GAIT): number {
  return distance / cycleLength(height, gait);
}

/** Foot phase w of the near (0) or far (1) foot. */
export function footPhase(u: number, foot: 0 | 1): number {
  return frac(u + foot * 0.5);
}

/**
 * Foot reference point and pitch. The reference is where the toe pivot is when the foot
 * is flat: toe down the boot rolls over the toe pivot, toe up it rocks on the heel tip –
 * either way the point on the ground stays put. The ankle follows from `ankleOf`.
 */
export interface WalkFoot {
  x: number;
  y: number;
  pitch: number;
}

/** Ground pivot of a foot pitch (foot frame). */
const pivotOf = (pitch: number): Vec2 => (pitch < 0 ? HEEL : TOE);

/** Ankle position for a foot (inverse of the boot's roll over its pivot). */
export function ankleOf(f: WalkFoot): Vec2 {
  const p = pivotOf(f.pitch);
  const r = rot(p, f.pitch);
  return { x: f.x + p.x - TOE.x - r.x, y: f.y + p.y - TOE.y - r.y };
}

/** Foot reference point of a boot drawn at `ankle` with `pitch` (inverse of `ankleOf`). */
export function footRef(ankle: Vec2, pitch: number): Vec2 {
  const p = pivotOf(pitch);
  const r = rot(p, pitch);
  return { x: ankle.x + r.x - p.x + TOE.x, y: ankle.y + r.y - p.y + TOE.y };
}

/** Heel tip position of a foot. */
export function heelTip(f: WalkFoot): Vec2 {
  const a = ankleOf(f);
  const r = rot(HEEL, f.pitch);
  return { x: a.x + r.x, y: a.y + r.y };
}

/** Toe pivot of a foot at foot phase w. */
export function footAt(w: number, gait: GaitTuning = GAIT): WalkFoot {
  const S = gait.stepLength * UNIT_HEIGHT;
  const b = gait.stance;
  const toeOff = SWING_KEYS[0]!.pitch;
  const strike = SWING_KEYS[SWING_KEYS.length - 1]!.pitch; // < 0: toe up, lands on the heel tip
  const travel = 2 * S * b; // stance foot travel = distance the body covers during stance
  // Contact point chosen so the stance ankle range (flat at contact … heel up at toe-off) is centred on WALK.center.
  const on = WALK.center + travel / 2 + (TOE.x + rot(TOE, toeOff).x) / 2;
  const rise = Math.max(1e-3, (1 - WALK.heelRise) * b); // foot phase span of the heel rise
  if (w < b) {
    // Short heel rocker (heel tip → ball), flat, then the heel rises – accelerating, so the
    // knee keeps flexing through toe-off instead of popping straight.
    const r = clamp((w - b + rise) / rise, 0, 1);
    const pitch =
      w < WALK.rocker
        ? strike * (1 - smoothstep(0, WALK.rocker, w))
        : toeOff * lerp(r * r * (3 - 2 * r), r * r, WALK.heelSnap);
    return { x: on - 2 * S * w, y: 0, pitch };
  }
  // Swing: cubic Hermite from toe-off to contact whose end velocities equal the stance
  // velocity → the foot leaves and meets the ground with zero world speed.
  const s = (w - b) / (1 - b);
  const m = -2 * S * (1 - b);
  const s2 = s * s;
  const s3 = s2 * s;
  const x = on - travel + travel * (3 * s2 - 2 * s3) + m * (s - 3 * s2 + 2 * s3);
  const k = spline(SWING_KEYS, s);
  // The roll keeps its toe-off speed and fades out (Hermite basis s(1 − s)²).
  const roll = ((2 * WALK.heelSnap * toeOff * (1 - b)) / rise) * s * (1 - s) * (1 - s);
  return { x, y: -Math.max(0, k.lift), pitch: k.pitch + roll };
}

/** Hip height offset (+ = up) at step phase t. */
const bobAt = (t: number, gait: GaitTuning) => stepKey(t).hip * gait.bob * UNIT_HEIGHT;

/** Inputs and result of the last `hipHeight` solve (GAIT/WALK are mutable → keyed on values). */
const hipMemo: number[] = [];

/**
 * Base hip height (at bob offset 0): as high as possible while no leg ever extends beyond
 * WALK.minKnee flexion over the whole cycle, capped at a relaxed standing height.
 * Memoized: depends only on the gait and WALK tuning, not on the frame.
 */
export function hipHeight(gait: GaitTuning = GAIT): number {
  const key = [
    gait.stepLength,
    gait.stance,
    gait.bob,
    WALK.minKnee,
    WALK.minKneeSwing,
    WALK.rocker,
    WALK.heelRise,
    WALK.heelSnap,
    WALK.center,
  ];
  if (key.every((x, i) => x === hipMemo[i])) return hipMemo[key.length]!;
  const { thigh: a, shin: c } = LEG;
  const reach2 = (knee: number) => a * a + c * c + 2 * a * c * Math.cos(knee);
  const stance = reach2(WALK.minKnee);
  const swing = reach2(WALK.minKneeSwing);
  let h = a + c + LEG.ankle - 1.5;
  for (let i = 0; i < 40; i++) {
    const w = i / 40;
    const p = ankleOf(footAt(w, gait));
    const r2 = w < gait.stance ? stance : swing;
    h = Math.min(h, Math.sqrt(Math.max(0, r2 - p.x * p.x)) - p.y - bobAt(2 * w, gait));
  }
  hipMemo.splice(0, hipMemo.length, ...key, h);
  return h;
}

export interface WalkArm {
  /** Shoulder angle (rad, + = forward). */
  angle: number;
  /** Elbow bend (rad, + = forearm forward). */
  elbow: number;
  /** Shoulder joint shift along the facing direction (units, + = forward). */
  shift: number;
}

export interface WalkPose {
  /** Hip y (x is 0). */
  hipY: number;
  /** Hip offset relative to the base height (+ = up). */
  bob: number;
  /** Torso pitch including the lean (rad, + = forward). */
  torso: number;
  near: WalkFoot;
  far: WalkFoot;
  nearArm: WalkArm;
  farArm: WalkArm;
}

/** Shoulder angles [near, far] at (arm) step phase t. */
function armsAt(t: number): [number, number] {
  const k = stepKey(t);
  const s = WALK.armSwing;
  return (Math.floor(t) & 1) === 0 ? [k.armLead * s, k.armTrail * s] : [k.armTrail * s, k.armLead * s]; // near foot contacts at even steps
}

/** The gait with steps (and bob) scaled by `stride`. */
const strided = (gait: GaitTuning, stride: number): GaitTuning =>
  stride < 1 ? { ...gait, stepLength: gait.stepLength * stride, bob: gait.bob * stride } : gait;

/** Full walk pose at cycle phase u, with steps scaled by `stride` (see RenderState.stride). */
export function walkPose(u: number, gait: GaitTuning = GAIT, stride: number = 1): WalkPose {
  gait = strided(gait, stride);
  const t = 2 * u;
  const key = stepKey(t);
  const bob = key.hip * gait.bob * UNIT_HEIGHT;
  const ta = t - 2 * WALK.armLag; // lag in cycles → step phase
  const now = armsAt(ta);
  const before = armsAt(ta - 0.15); // where the shoulder was a moment ago → the forearm still trails
  const arm = (i: 0 | 1): WalkArm => {
    const angle = now[i] * stride;
    return {
      angle,
      elbow: WALK.elbow + WALK.elbowGain * Math.max(0, angle) + WALK.forearmDrag * (before[i] * stride - angle),
      shift: WALK.shoulderShift * angle,
    };
  };
  return {
    hipY: -(hipHeight(gait) + bob),
    bob,
    torso: WALK.lean + key.pitch,
    near: footAt(footPhase(u, 0), gait),
    far: footAt(footPhase(u, 1), gait),
    nearArm: arm(0),
    farArm: arm(1),
  };
}
