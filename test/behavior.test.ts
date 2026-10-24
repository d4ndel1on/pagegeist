import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PHRASES, goth } from '../src';
import { decide } from '../src/core/behavior';
import { Mascot } from '../src/core/Mascot';
import { type PagegeistOptions, resolveOptions } from '../src/core/options';
import { createPhysics } from '../src/core/physics';
import { createRandom, seeded } from '../src/core/random';
import { GothRenderer } from '../src/core/render/GothRenderer';
import { MascotState, type Platform } from '../src/core/types';
import type { DomCollisionWorld } from '../src/core/World';
import { SUNNY_PHRASES, sunny } from '../src/sunny';

const platform = (id: string, left: number, right: number, top: number, kind: Platform['kind'] = 'generic') => ({
  id,
  kind,
  left,
  right,
  top,
  bottom: top + 30,
  element: null,
  hangable: kind !== 'floor',
  sittable: kind !== 'floor',
});

/** Minimal stand-in for the DOM-backed world. */
function fakeWorld(platforms: Platform[], safeTop = 0) {
  const viewport = { left: 0, right: 1000, top: 0, bottom: 800 };
  return {
    revision: 1,
    all: platforms,
    get: (id: string | null) => platforms.find((p) => p.id === id) ?? null,
    viewport: () => viewport,
    safeViewport: () => ({ ...viewport, top: safeTop }),
    platformBelow: () => null,
  } as unknown as DomCollisionWorld;
}

function setup(options: PagegeistOptions = {}, platforms?: Platform[], seed = 7) {
  const list = platforms ?? [
    platform('home', 100, 500, 500, 'heading'),
    platform('neighbor', 560, 760, 480, 'button'),
    platform('floor', 0, 1000, 800, 'floor'),
  ];
  const world = fakeWorld(list);
  const emit = vi.fn();
  const metrics = new GothRenderer(168).metrics;
  const m = new Mascot(world, metrics, createPhysics(168), createRandom(seeded(seed)), resolveOptions(options), emit);
  m.standOn(list[0]!, 300);
  return { m, emit, world };
}

describe('eager sister (sunny)', () => {
  const plansWith = (options: PagegeistOptions, cursor = { x: 480, y: 420 }) => {
    const { m } = setup(options);
    m.cursor = cursor;
    return Array.from({ length: 80 }, () => decide(m)).filter((p) => p !== null);
  };

  it('walks over to the cursor, faster than usual', () => {
    const approaches = plansWith({ character: sunny }).filter((p) => p.label === 'approach');
    expect(approaches.length).toBeGreaterThan(20);
    for (const plan of approaches) {
      expect(plan.walkToX).toBeGreaterThan(400);
      expect(plan.pace).toBe(sunny.temper.pace);
    }
  });

  it('leaves goth and a disabled watchCursor alone', () => {
    expect(plansWith({}).some((p) => p.label === 'approach')).toBe(false);
    const blind = plansWith({ character: sunny, behaviors: { watchCursor: false } });
    expect(blind.some((p) => p.label === 'approach')).toBe(false);
  });

  it('does not approach a cursor right above her', () => {
    const plans = plansWith({ character: sunny }, { x: 310, y: 300 });
    expect(plans.some((p) => p.label === 'approach')).toBe(false);
  });

  it('prefers jumps towards the cursor', () => {
    const jumps = (options: PagegeistOptions) =>
      plansWith({ ...options, behaviors: { walk: false, hang: false, sit: false, drop: false } }, { x: 660, y: 440 })
        .filter((p) => p.next.type === 'jump')
        .map((p) => (p.next as { platformId: string }).platformId);
    const share = (ids: string[]) => ids.filter((id) => id === 'neighbor').length / ids.length;
    expect(share(jumps({ character: sunny }))).toBeGreaterThan(share(jumps({})));
  });

  it('jumps instead of walking when the cursor is on another level', () => {
    const below = { x: 300, y: 790 };
    const jumpShare = (options: PagegeistOptions) => {
      const plans = plansWith(options, below);
      return plans.filter((p) => p.next.type === 'jump').length / plans.length;
    };
    expect(plansWith({ character: sunny }, below).some((p) => p.label === 'approach')).toBe(false);
    expect(jumpShare({ character: sunny })).toBeGreaterThan(jumpShare({}) * 1.5);
  });

  it('notices the cursor from further away', () => {
    const turns = (options: PagegeistOptions) => {
      const { m } = setup(options);
      m.facing = -1;
      m.cursor = { x: 300 + 500, y: 500 - 168 * 0.85 };
      m.watchCursor(0.1, true);
      return m.facing;
    };
    expect(turns({})).toBe(-1);
    expect(turns({ character: sunny })).toBe(1);
  });

  it('walks faster with a higher pace', () => {
    const covered = (pace: number) => {
      const { m } = setup();
      for (let i = 0; i < 120; i++) m.walkToward(490, 1 / 120, pace);
      return m.body.pos.x - 300;
    };
    expect(covered(sunny.temper.pace)).toBeGreaterThan(covered(1) * 1.2);
  });
});

describe('decide', () => {
  it('does nothing when every behavior is disabled', () => {
    const { m } = setup({
      behaviors: { walk: false, jump: false, hang: false, sit: false, drop: false },
    });
    for (let i = 0; i < 50; i++) expect(decide(m)).toBeNull();
  });

  it('never moves in static motion mode', () => {
    const { m } = setup();
    m.motion = 'static';
    for (let i = 0; i < 50; i++) expect(decide(m)).toBeNull();
  });

  it('only plans jumps when jumping is the only behavior', () => {
    const { m } = setup({ behaviors: { walk: false, hang: false, sit: false, drop: false } });
    const plans = Array.from({ length: 60 }, () => decide(m)).filter(Boolean);
    expect(plans.length).toBeGreaterThan(0);
    for (const plan of plans) expect(plan!.next.type).toMatch(/^(jump|grab)$/);
  });

  it('never targets platforms that would hide her under a sticky header', () => {
    const list = [
      platform('home', 100, 500, 500, 'heading'),
      platform('under-nav', 100, 500, 120, 'button'),
      platform('floor', 0, 1000, 800, 'floor'),
    ];
    const { m } = setup({ behaviors: { walk: false, hang: false, sit: false, drop: false } }, list);
    (m.world as unknown as { safeViewport: () => object }).safeViewport = () => ({
      left: 0,
      right: 1000,
      top: 64,
      bottom: 800,
    });
    for (let i = 0; i < 60; i++) {
      const plan = decide(m);
      if (plan?.next.type === 'jump') expect(plan.next.platformId).not.toBe('under-nav');
    }
  });

  it('is deterministic with a seeded random source', () => {
    const a = setup({}, undefined, 99).m;
    const b = setup({}, undefined, 99).m;
    const run = (m: Mascot) => Array.from({ length: 20 }, () => decide(m)?.label ?? null);
    expect(run(a)).toEqual(run(b));
  });
});

describe('Mascot', () => {
  it('emits state changes and lands on platforms', () => {
    const { m, emit } = setup();
    m.leaveGround();
    m.body.pos = { x: 300, y: 400 };
    m.fsm.start();
    for (let i = 0; i < 240 && m.state === MascotState.FALL; i++) m.update(1 / 120);
    expect(m.state).toBe(MascotState.IDLE);
    expect(m.groundId).toBe('home');
    expect(emit).toHaveBeenCalledWith('land', expect.objectContaining({ element: null }));
  });

  it('does not touch host elements unless markElements is on', () => {
    const el = document.createElement('h2');
    const list = [{ ...platform('home', 100, 500, 500, 'heading'), element: el }];
    const { m } = setup({}, list);
    m.standOn(list[0]!);
    expect(el.hasAttribute('data-pagegeist-occupied')).toBe(false);

    const marked = setup({ markElements: true }, list).m;
    marked.leaveGround();
    marked.standOn(list[0]!);
    expect(el.hasAttribute('data-pagegeist-occupied')).toBe(true);
    marked.clearMarks();
    expect(el.hasAttribute('data-pagegeist-occupied')).toBe(false);
  });

  it('says phrases and reports the trigger', () => {
    const { m, emit } = setup({ phrases: { poke: ['Hey.'] } });
    m.poke();
    expect(m.bubble?.text).toBe('Hey.');
    expect(emit).toHaveBeenCalledWith('say', { text: 'Hey.', trigger: 'poke' });
  });

  it("falls back to the character's built-in phrases", () => {
    const { m } = setup({ character: sunny });
    m.poke();
    expect(SUNNY_PHRASES.poke).toContain(m.bubble?.text);
    m.options = resolveOptions({ character: goth }, m.options);
    m.poke();
    expect(DEFAULT_PHRASES.poke).toContain(m.bubble?.text);
  });
});
