import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPagegeist, type PagegeistInstance } from '../src';
import { MascotState } from '../src/core/types';
import { fakeLoop, pointer } from './engine-harness';

let instance: PagegeistInstance | null = null;
afterEach(() => {
  instance?.destroy();
  instance = null;
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const hitbox = () => document.querySelector<HTMLElement>('.pagegeist-hitbox')!;

/** Mounts her, lets her settle and picks her up. */
function grabbed() {
  const loop = fakeLoop();
  const events: string[] = [];
  const release = vi.fn();
  instance = createPagegeist({ random: () => 0.5, spawn: 'center', onRelease: release });
  for (const type of ['grab', 'release', 'poke'] as const) instance.on(type, () => events.push(type));
  loop.run(5);
  hitbox().dispatchEvent(pointer('pointerdown', { clientX: 100, clientY: 100 }));
  hitbox().dispatchEvent(pointer('pointermove', { clientX: 140, clientY: 120 }));
  expect(instance.state).toBe(MascotState.GRABBED);
  return { loop, events, release, instance };
}

describe('dragging', () => {
  it('drops her when paused mid-drag instead of leaving her stuck in GRABBED', () => {
    const { loop, events, release, instance } = grabbed();
    instance.pause();
    expect(instance.state).toBe(MascotState.FALL);
    expect(events).toEqual(['grab', 'release']);
    expect(release).toHaveBeenCalledWith({ velocity: { x: 0, y: 0 } });
    // Further pointer moves no longer drag her.
    hitbox().dispatchEvent(pointer('pointermove', { clientX: 400, clientY: 400 }));
    expect(instance.state).toBe(MascotState.FALL);
    instance.resume();
    loop.run(240);
    expect(instance.state).not.toBe(MascotState.GRABBED);
    expect(instance.state).not.toBe(MascotState.FALL);
  });

  it('ends the drag on respawn() with a consistent grab → release sequence', () => {
    const { events, instance } = grabbed();
    const states: string[] = [];
    instance.on('stateChange', (e) => states.push(`${e.from}>${e.to}`));
    instance.respawn();
    expect(events).toEqual(['grab', 'release']);
    expect(states).toEqual(['GRABBED>FALL']);
    hitbox().dispatchEvent(pointer('pointerup', { clientX: 400, clientY: 400 }));
    expect(events).toEqual(['grab', 'release']); // no poke, no second release
  });

  it('treats lostpointercapture like pointercancel', () => {
    const { events, release, instance } = grabbed();
    hitbox().dispatchEvent(pointer('lostpointercapture'));
    expect(instance.state).toBe(MascotState.FALL);
    expect(release).toHaveBeenCalledWith({ velocity: { x: 0, y: 0 } });
    hitbox().dispatchEvent(pointer('pointerup'));
    expect(events).toEqual(['grab', 'release']);
  });

  it('does not poke when the capture is lost before the pointer moved', () => {
    const loop = fakeLoop();
    const poke = vi.fn();
    instance = createPagegeist({ onPoke: poke });
    loop.run(2);
    hitbox().dispatchEvent(pointer('pointerdown'));
    hitbox().dispatchEvent(pointer('lostpointercapture'));
    hitbox().dispatchEvent(pointer('pointerup'));
    expect(poke).not.toHaveBeenCalled();
  });

  it('ignores lostpointercapture of another pointer', () => {
    const { instance } = grabbed();
    hitbox().dispatchEvent(pointer('lostpointercapture', { pointerId: 7 }));
    expect(instance.state).toBe(MascotState.GRABBED);
  });

  it('grabs on a near miss with a mouse, but leaves touch taps next to her alone', () => {
    const loop = fakeLoop();
    instance = createPagegeist({ spawn: 'center' });
    loop.run(2);
    expect(instance.state).toBe(MascotState.FALL); // a moving state
    const r = (instance as unknown as { hitboxRect: { x: number; y: number } }).hitboxRect;
    const near = { clientX: r.x - 5, clientY: r.y - 5 };

    const touch = pointer('pointerdown', { ...near, pointerType: 'touch' });
    document.body.dispatchEvent(touch);
    expect(touch.defaultPrevented).toBe(false);

    const mouse = pointer('pointerdown', { ...near, pointerType: 'mouse', pointerId: 2 });
    document.body.dispatchEvent(mouse);
    expect(mouse.defaultPrevented).toBe(true);
  });
});
