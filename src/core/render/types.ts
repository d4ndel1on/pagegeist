import type { OutfitStyle, ShoeStyle } from '../options';
import type { Facing, MascotState, Rect, Vec2 } from '../types';
import type { Palette } from './GothRenderer';

/**
 * Everything a renderer needs to know about the current state. The renderer is stateless
 * with respect to the simulation – it only translates this snapshot into pixels.
 */
export interface RenderState {
  state: MascotState;
  /** Seconds in the current state. */
  stateTime: number;
  /** Global time in seconds (for loops like breathing, hair). */
  time: number;
  facing: Facing;
  /** Visible velocity in px/s (from position delta, also while walking/dragging). */
  velocity: Vec2;
  /** Distance walked in px (at full stride) – coupling the walk cycle to distance prevents foot sliding. */
  gait: number;
  /** Step length scale: 1 = full GAIT step, shorter while speeding up and braking. */
  stride: number;
  /** Grip point of the hands relative to the feet (y down) while hanging/climbing. */
  handTarget: Vec2 | null;
  /** 0..1 while pulling up (CLIMB). */
  climbProgress: number;
  /** Phase of the hand-over-hand motion while shimmying. */
  shimmyPhase: number;
  /** 0..1 crouch before take-off. */
  jumpCrouch: number;
  /** Point (relative to the feet) the head looks at – usually the cursor. */
  lookAt: Vec2 | null;
  /** 0..1 landing squash. */
  squash: number;
  /** -1..1 secondary motion of the hair. */
  hairSway: number;
  blink: boolean;
  /** 0..1 "hand on hip" attitude during long idles. */
  attitude: number;
  mood: Mood;
  /**
   * Reduced motion: hold the renderer's own ambient motion (breathing, idle/hang/sit sway,
   * flailing, hair and hem springs) at rest. Unset = full motion.
   */
  calm?: boolean;
}

export type Mood = 'neutral' | 'happy' | 'annoyed' | 'surprised';

export interface MascotMetrics {
  /** Standing height in CSS pixels (sole to crown). */
  height: number;
  /**
   * Distance hands → soles when hanging with straight arms. Physics sets
   * `feet = grip + (0, hangReach)` while hanging.
   */
  hangReach: number;
}

/** Clothing of the character; changeable at any time (applies from the next frame). */
export interface Look {
  outfit: OutfitStyle;
  shoes: ShoeStyle;
  fishnets: boolean;
}

export const DEFAULT_LOOK: Look = { outfit: 'classic', shoes: 'boots', fishnets: false };

export interface MascotRenderer {
  readonly metrics: MascotMetrics;
  /** Current clothing. Renderers without wardrobe support may ignore it. */
  look?: Look;
  /** Current colors (from the character). Renderers without palette support may ignore it. */
  palette?: Palette;
  /**
   * Pushes draw commands into the queue. (x, y) = feet position in screen space.
   * `zBase` is the mascot's depth layer; body parts sort themselves relative to it
   * within [zBase, zBase + 1).
   */
  draw(queue: RenderQueue, x: number, y: number, rs: RenderState, zBase: number): void;
  /** Bounding box relative to the feet (for hitbox and speech bubble). */
  bounds(rs: RenderState): Rect;
  /**
   * Debug only: toe pivot (ball of the foot) of each boot in the last drawn pose, relative
   * to the feet position in CSS pixels (facing applied, y down). It stays fixed in the world
   * while a foot is planted, so the foot-trace overlay reveals sliding.
   */
  debugFeet?(): { near: Vec2; far: Vec2 } | null;
}

export type DrawFn = (ctx: CanvasRenderingContext2D) => void;

/**
 * Depth-sorted draw queue = the "dynamic layer sorting" of the 2.5D rendering.
 * Shadows, body parts, effects and debug layers are queued with a z value and
 * stably sorted before drawing. Body parts may change their z per pose (e.g. arm in front
 * of the head while hanging, knee in front of the torso while climbing).
 */
export class RenderQueue {
  private items: Array<{ z: number; order: number; draw: DrawFn }> = [];
  private counter = 0;

  push(z: number, draw: DrawFn): void {
    this.items.push({ z, order: this.counter++, draw });
  }

  /** Sorts once; call before draining with `drain()`. */
  sort(): void {
    this.items.sort((a, b) => a.z - b.z || a.order - b.order);
  }

  /** Draws (and removes) all queued items with z < `below`, in order. */
  drain(ctx: CanvasRenderingContext2D, below: number = Number.POSITIVE_INFINITY): void {
    let i = 0;
    for (; i < this.items.length; i++) {
      const item = this.items[i]!;
      if (item.z >= below) break;
      ctx.save();
      item.draw(ctx);
      ctx.restore();
    }
    this.items.splice(0, i);
    if (!this.items.length) this.counter = 0;
  }

  flush(ctx: CanvasRenderingContext2D): void {
    this.sort();
    this.drain(ctx);
  }
}

/** Z layers of the scene. */
export const Z = {
  shadow: 2,
  wallShadow: 5,
  mascot: 10,
  bubble: 100,
  debug: 1000,
} as const;
