import { describe, expect, it, vi } from 'vitest';
import type { Plan } from '../src/core/behavior';
import { Mascot } from '../src/core/Mascot';
import { type PagegeistOptions, resolveOptions } from '../src/core/options';
import { createPhysics } from '../src/core/physics';
import { createRandom, seeded } from '../src/core/random';
import { GothRenderer } from '../src/core/render/GothRenderer';
import { MascotState, type Platform } from '../src/core/types';
import type { DomCollisionWorld } from '../src/core/World';

const DT = 1 / 120;

const platform = (id: string, left: number, right: number, top: number, kind: Platform['kind'] = 'generic') => ({
  id,
  kind,
  left,
  right,
  top,
  bottom: top + 30,
  element: null as Element | null,
  hangable: kind !== 'floor',
  sittable: kind !== 'floor',
});

function setup(options: PagegeistOptions = {}, seed = 7) {
  const list: Platform[] = [
    platform('home', 100, 500, 500, 'heading'),
    platform('neighbor', 560, 760, 470, 'button'),
    platform('high', 150, 450, 300, 'card'),
    platform('floor', 0, 1000, 800, 'floor'),
  ];
  const viewport = { left: 0, right: 1000, top: 0, bottom: 800 };
  const world = {
    revision: 1,
    all: list,
    get: (id: string | null) => list.find((p) => p.id === id) ?? null,
    viewport: () => viewport,
    safeViewport: () => viewport,
    platformBelow: () => null,
  };
  const emit = vi.fn();
  const metrics = new GothRenderer(168).metrics;
  const m = new Mascot(
    world as unknown as DomCollisionWorld,
    metrics,
    createPhysics(168),
    createRandom(seeded(seed)),
    resolveOptions(options),
    emit,
  );
  const states: string[] = [];
  emit.mockImplementation((type: string, e: { to?: string }) => {
    if (type === 'stateChange') states.push(e.to!);
  });
  const p = (id: string) => list.find((x) => x.id === id)!;
  return { m, emit, world, list, states, p };
}

/** Steps until `done` holds (or fails after `seconds`). */
function until(m: Mascot, done: () => boolean, seconds = 10): void {
  for (let t = 0; t < seconds; t += DT) {
    m.update(DT);
    if (done()) return;
  }
  throw new Error(`timed out in ${m.state}`);
}

function walkPlan(m: Mascot, plan: Plan): void {
  m.plan = plan;
  m.fsm.transition(MascotState.WALK);
}

describe('state machine', () => {
  it('starts falling and lands on a platform (FALL → IDLE, land event)', () => {
    const { m, emit, states } = setup();
    m.start(300);
    expect(m.state).toBe(MascotState.FALL);
    until(m, () => m.state === MascotState.IDLE);
    expect(m.groundId).toBe('high');
    expect(states).toEqual([MascotState.FALL, MascotState.IDLE]);
    expect(emit).toHaveBeenCalledWith('land', expect.objectContaining({ element: null }));
  });

  it('idles, decides and walks (IDLE → WALK → …)', () => {
    const { m, p } = setup();
    m.standOn(p('home'), 300);
    m.fsm.transition(MascotState.IDLE);
    until(m, () => m.state === MascotState.WALK, 20);
    expect(m.plan).not.toBeNull();
  });

  it('walks to a spot and sits down, then gets up again (WALK → SIT → IDLE)', () => {
    const { m, p, states } = setup();
    m.standOn(p('home'), 300);
    walkPlan(m, { walkToX: 360, next: { type: 'sit' }, label: 'sit' });
    until(m, () => m.state === MascotState.SIT_ON_ELEMENT);
    expect(m.body.pos.x).toBeCloseTo(360, 0);
    until(m, () => m.state === MascotState.IDLE, 12);
    expect(states).toEqual([MascotState.WALK, MascotState.SIT_ON_ELEMENT, MascotState.IDLE]);
  });

  it('gives up a walk without a plan or after 10 s', () => {
    const { m, p } = setup();
    m.standOn(p('home'), 300);
    m.fsm.transition(MascotState.WALK);
    m.update(DT);
    expect(m.state).toBe(MascotState.IDLE);
  });

  it('jumps over to a neighbor platform (WALK → JUMP → IDLE)', () => {
    const { m, p, states } = setup();
    m.standOn(p('home'), 480);
    walkPlan(m, { walkToX: 490, next: { type: 'jump', platformId: 'neighbor', landX: 600 }, label: 'jump' });
    until(m, () => m.state === MascotState.JUMP);
    expect(m.jumpCrouch).toBeGreaterThanOrEqual(0);
    until(m, () => m.state === MascotState.IDLE, 5);
    expect(m.groundId).toBe('neighbor');
    expect(states).toEqual([MascotState.WALK, MascotState.JUMP, MascotState.IDLE]);
  });

  it('falls back to IDLE when the jump target vanished', () => {
    const { m, p } = setup();
    m.standOn(p('home'), 480);
    walkPlan(m, { walkToX: 480, next: { type: 'jump', platformId: 'gone', landX: 600 }, label: 'jump' });
    until(m, () => m.state !== MascotState.WALK);
    expect(m.state).toBe(MascotState.IDLE);
  });

  it('grab-jumps to an edge, hangs and climbs up (JUMP → HANG → CLIMB → IDLE)', () => {
    const { m, p, states } = setup({}, 3);
    m.rng.next = () => 0.6; // no shimmy, climb
    m.standOn(p('home'), 480);
    walkPlan(m, { walkToX: 490, next: { type: 'grab', platformId: 'neighbor', anchorOffsetX: 30 }, label: 'grab' });
    until(m, () => m.state === MascotState.HANG_ON_EDGE, 5);
    expect(m.hang?.platformId).toBe('neighbor');
    until(m, () => m.state === MascotState.IDLE, 10);
    expect(m.groundId).toBe('neighbor');
    expect(m.body.pos.y).toBe(470);
    expect(states).toEqual([
      MascotState.WALK,
      MascotState.JUMP,
      MascotState.HANG_ON_EDGE,
      MascotState.CLIMB,
      MascotState.IDLE,
    ]);
  });

  it('climbs up from a hang once the hang time is over (rng → climb)', () => {
    const { m, p } = setup();
    m.rng.next = () => 0.6; // no shimmy, climb
    m.attachHang(p('high'), 100);
    expect(m.state).toBe(MascotState.HANG_ON_EDGE);
    until(m, () => m.state === MascotState.CLIMB, 6);
    expect(m.climbProgress).toBe(0);
    until(m, () => m.state === MascotState.IDLE, 2);
    expect(m.climbProgress).toBe(0); // reset on exit
    expect(m.groundId).toBe('high');
  });

  it('shimmies along the edge and finally lets go (rng → shimmy, then fall)', () => {
    const { m, p } = setup();
    m.rng.next = () => 0.1; // shimmy
    m.attachHang(p('high'), 100);
    until(m, () => m.hang?.shimmyTo !== null, 6);
    expect(m.hang!.shimmies).toBe(1);
    until(m, () => m.shimmyPhase > 0, 1);
    m.rng.next = () => 0.95; // let go
    until(m, () => m.state === MascotState.FALL, 10);
    expect(m.hang).toBeNull();
    until(m, () => m.state === MascotState.IDLE, 5);
    expect(m.groundId).toBe('home');
  });

  it('lowers herself down her own edge (WALK → CLIMB backwards → HANG)', () => {
    const { m, p } = setup();
    m.standOn(p('home'), 120);
    walkPlan(m, { walkToX: 104, next: { type: 'hangOwnEdge', side: 'left' }, label: 'lower' });
    until(m, () => m.state === MascotState.CLIMB);
    expect(m.climbDir).toBe(-1);
    expect(m.facing).toBe(1);
    until(m, () => m.state === MascotState.HANG_ON_EDGE, 2);
    expect(m.climbDir).toBe(1);
    expect(m.body.pos.y).toBeCloseTo(500 + m.metrics.hangReach, 3);
  });

  it('drops off an edge (WALK → FALL → IDLE on a lower platform)', () => {
    const { m, p } = setup();
    m.standOn(p('high'), 430);
    walkPlan(m, { walkToX: 447, next: { type: 'drop', side: 'right' }, label: 'drop' });
    until(m, () => m.state === MascotState.FALL);
    expect(m.body.vel.y).toBeLessThan(0);
    until(m, () => m.state === MascotState.IDLE, 5);
    expect(m.groundId).not.toBe('high');
  });

  it('falls when the platform under her vanishes (IDLE/SIT → FALL)', () => {
    const { m, p, list } = setup();
    m.standOn(p('home'), 300);
    m.fsm.transition(MascotState.SIT_ON_ELEMENT);
    list.splice(0, 1);
    m.update(DT);
    expect(m.state).toBe(MascotState.FALL);
    expect(m.groundId).toBeNull();
  });

  it('falls when the edge she hangs on vanishes (HANG/CLIMB → FALL)', () => {
    for (const lower of [false, true]) {
      const { m, p, list, states } = setup();
      m.standOn(p('high'), 200);
      m.attachHang(p('high'), 50, lower);
      list.splice(2, 1);
      m.update(DT);
      expect(states.at(-1) === MascotState.FALL || states.at(-2) === MascotState.FALL).toBe(true);
      expect(m.hang).toBeNull();
    }
  });

  it('turns a missing jump into a fall', () => {
    const { m, p } = setup();
    m.standOn(p('home'), 300);
    m.fsm.transition(MascotState.JUMP);
    m.update(DT);
    expect(m.state).toBe(MascotState.FALL);
  });

  it('is grabbed, dragged and thrown (GRABBED → FALL), mood annoyed only while held', () => {
    const { m, p, emit } = setup();
    m.standOn(p('home'), 300);
    m.fsm.transition(MascotState.IDLE);
    m.grab();
    expect(m.state).toBe(MascotState.GRABBED);
    expect(m.groundId).toBeNull();
    expect(m.mood).toBe('annoyed');
    m.dragTo({ x: 700, y: 100 });
    m.update(DT);
    expect(m.state).toBe(MascotState.GRABBED);
    expect(m.body.pos.x).toBe(700);
    m.release({ x: 99999, y: 0 });
    expect(m.state).toBe(MascotState.FALL);
    expect(m.mood).toBe('surprised');
    expect(Math.abs(m.body.vel.x)).toBeLessThanOrEqual(1400 * Math.max(1, m.physics.scale));
    expect(emit).toHaveBeenCalledWith('release', expect.anything());
    until(m, () => m.state === MascotState.IDLE, 5);
    // A second release is ignored outside GRABBED.
    emit.mockClear();
    m.release({ x: 0, y: 0 });
    expect(emit).not.toHaveBeenCalled();
  });

  it('pokes: jumps in place when standing, lets go when hanging, never moves when static', () => {
    const a = setup();
    a.m.standOn(a.p('home'), 300);
    a.m.fsm.transition(MascotState.IDLE);
    a.m.poke();
    expect(a.m.state).toBe(MascotState.JUMP);
    expect(a.m.mood).toBe('happy');

    const b = setup();
    b.m.attachHang(b.p('high'), 50);
    b.m.poke();
    expect(b.m.state).toBe(MascotState.FALL);

    const c = setup();
    c.m.standOn(c.p('home'), 300);
    c.m.fsm.transition(MascotState.IDLE);
    c.m.motion = 'static';
    c.m.poke();
    expect(c.m.state).toBe(MascotState.IDLE);
  });

  it('respawns onto a platform without falling in static mode', () => {
    const { m } = setup();
    m.motion = 'static';
    m.start(300);
    expect(m.state).toBe(MascotState.IDLE);
    expect(m.groundId).not.toBe('floor');
  });
});
