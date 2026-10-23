import { describe, expect, it } from 'vitest';
import { DEFAULT_BEHAVIORS, DEFAULT_PLATFORMS, resolveOptions } from '../src/core/options';

describe('resolveOptions', () => {
  it('fills in defaults', () => {
    const o = resolveOptions({});
    expect(o.behaviors).toEqual(DEFAULT_BEHAVIORS);
    expect(o.platforms).toEqual(DEFAULT_PLATFORMS);
    expect(o.reducedMotion).toBe('static');
    expect(o.pauseControl).toBeNull();
    expect(o.markElements).toBe(false);
  });

  it('merges nested objects per key', () => {
    const o = resolveOptions({ behaviors: { hang: false }, platforms: { ignore: ['nav'] } });
    expect(o.behaviors.hang).toBe(false);
    expect(o.behaviors.jump).toBe(true);
    expect(o.platforms.ignore).toEqual(['nav']);
    expect(o.platforms.selectors).toEqual(DEFAULT_PLATFORMS.selectors);
  });

  it('keeps previous values on partial updates', () => {
    const base = resolveOptions({ zIndex: 5, behaviors: { sit: false } });
    const next = resolveOptions({ behaviors: { drop: false } }, base);
    expect(next.zIndex).toBe(5);
    expect(next.behaviors.sit).toBe(false);
    expect(next.behaviors.drop).toBe(false);
  });

  it('resolves the pause control flag', () => {
    expect(resolveOptions({ pauseControl: true }).pauseControl?.pauseLabel).toBe('Pause mascot');
    expect(resolveOptions({ pauseControl: { pauseLabel: 'Stop' } }).pauseControl?.pauseLabel).toBe('Stop');
    const on = resolveOptions({ pauseControl: true });
    expect(resolveOptions({ pauseControl: false }, on).pauseControl).toBeNull();
  });

  it('resolves and clamps timeScale', () => {
    expect(resolveOptions({}).timeScale).toBe(1);
    expect(resolveOptions({ timeScale: 0.25 }).timeScale).toBe(0.25);
    expect(resolveOptions({ timeScale: 0 }).timeScale).toBe(0.05);
    expect(resolveOptions({ timeScale: 100 }).timeScale).toBe(4);
    expect(resolveOptions({ timeScale: Number.NaN }).timeScale).toBe(1);
    const slow = resolveOptions({ timeScale: 0.5 });
    expect(resolveOptions({ zIndex: 1 }, slow).timeScale).toBe(0.5);
  });
});
