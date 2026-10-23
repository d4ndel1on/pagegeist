import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPagegeist, type PagegeistInstance } from '../src';
import { Mascot } from '../src/core/Mascot';

let instance: PagegeistInstance | null = null;
afterEach(() => {
  instance?.destroy();
  instance = null;
  document.body.innerHTML = '';
});

describe('createPagegeist', () => {
  it('mounts an overlay and removes it on destroy (idempotent)', () => {
    instance = createPagegeist();
    expect(document.querySelectorAll('.pagegeist')).toHaveLength(1);
    instance.destroy();
    instance.destroy();
    expect(document.querySelector('.pagegeist')).toBeNull();
  });

  it('mounts into a custom container', () => {
    const container = document.createElement('div');
    document.body.append(container);
    instance = createPagegeist({ container });
    expect(container.querySelector('.pagegeist')).not.toBeNull();
  });

  it('keeps the overlay hidden from assistive tech', () => {
    instance = createPagegeist();
    expect(document.querySelector('.pagegeist canvas')?.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('.pagegeist-hitbox')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('emits say events to callbacks and listeners', () => {
    const onSay = vi.fn();
    const listener = vi.fn();
    instance = createPagegeist({ onSay });
    const off = instance.on('say', listener);
    instance.say('Hello.');
    expect(onSay).toHaveBeenCalledWith({ text: 'Hello.', trigger: 'api' });
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    instance.say('Again.');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('isolates errors thrown by listeners', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    instance = createPagegeist({
      onSay: () => {
        throw new Error('boom');
      },
    });
    expect(() => instance?.say('Hi')).not.toThrow();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('pauses and resumes, with an optional accessible pause control', () => {
    const onPause = vi.fn();
    instance = createPagegeist({ pauseControl: { pauseLabel: 'Stop', resumeLabel: 'Go' }, onPause });
    const button = document.querySelector<HTMLButtonElement>('.pagegeist-pause')!;
    expect(button.textContent).toContain('Stop');
    button.click();
    expect(instance.paused).toBe(true);
    expect(onPause).toHaveBeenCalledTimes(1);
    // The accessible name names the action; no aria-pressed on top (no double state).
    expect(button.hasAttribute('aria-pressed')).toBe(false);
    expect(button.textContent).toContain('Go');
    instance.resume();
    expect(instance.paused).toBe(false);
    expect(button.textContent).toContain('Stop');
    // The play/pause glyph is decorative and hidden from assistive tech.
    const glyph = button.querySelector('[aria-hidden="true"]')!;
    expect(glyph.textContent?.trim()).toBe('❚❚');
    expect(
      [...button.childNodes]
        .filter((n) => n !== glyph)
        .map((n) => n.textContent)
        .join(''),
    ).toBe('Stop');
  });

  it('adds and removes the pause control via update()', () => {
    instance = createPagegeist();
    expect(document.querySelector('.pagegeist-pause')).toBeNull();
    instance.update({ pauseControl: true });
    expect(document.querySelector('.pagegeist-pause')).not.toBeNull();
    instance.update({ pauseControl: false });
    expect(document.querySelector('.pagegeist-pause')).toBeNull();
  });

  it('announces speech via a live region only when enabled', () => {
    instance = createPagegeist({ announce: true });
    instance.say('<b>not html</b>');
    const region = document.querySelector('[aria-live="polite"]')!;
    expect(region.textContent).toBe('<b>not html</b>');
    expect(region.querySelector('b')).toBeNull();
  });

  it('starts paused when requested', () => {
    instance = createPagegeist({ paused: true });
    expect(instance.paused).toBe(true);
  });

  it('scales the simulation time with timeScale (also via update())', () => {
    let frame: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frame = cb;
      return 1;
    });
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    const step = vi.spyOn(Mascot.prototype, 'update');
    try {
      instance = createPagegeist();
      const run = (now: number) => {
        step.mockClear();
        frame?.(now);
        return step.mock.calls.length;
      };
      // 1/120 s fixed steps: 50 ms → 6 steps at full speed
      expect(run(1050)).toBe(6);
      instance.update({ timeScale: 0.5 });
      expect(run(1100)).toBe(3);
      instance.update({ timeScale: 0.25 });
      expect(run(1150)).toBe(1); // 1.5 steps: one now, the rest carries over
      expect(run(1200)).toBe(2);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
