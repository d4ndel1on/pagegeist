import { describe, expect, it } from 'vitest';
import {
  createPagegeist,
  DEFAULT_BEHAVIORS,
  DEFAULT_PHRASES,
  DEFAULT_PLATFORMS,
  DEFAULT_SIZE,
  PagegeistStates,
} from '../src';
import { resolveOptions } from '../src/core/options';

describe('option validation', () => {
  it('replaces non-finite or out-of-range numbers', () => {
    const o = resolveOptions({ zIndex: Number.NaN, respawnAfter: -3, timeScale: Number.POSITIVE_INFINITY });
    expect(o.zIndex).toBe(9999);
    expect(o.respawnAfter).toBe(0);
    expect(o.timeScale).toBe(1);
    expect(resolveOptions({ zIndex: 12.6 }).zIndex).toBe(13);
    expect(resolveOptions({ respawnAfter: Number.NaN }).respawnAfter).toBe(1.5);
  });

  it('falls back to the default size for invalid sizes', () => {
    for (const size of [Number.NaN, 0, -5, Number.POSITIVE_INFINITY]) {
      const instance = createPagegeist({ size });
      const { renderer } = instance as unknown as { renderer: { metrics: { height: number } } };
      expect(renderer.metrics.height).toBe(DEFAULT_SIZE);
      instance.destroy();
    }
  });
});

describe('exported defaults', () => {
  it('are frozen', () => {
    expect(Object.isFrozen(DEFAULT_BEHAVIORS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_PLATFORMS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_PLATFORMS.selectors)).toBe(true);
    expect(Object.isFrozen(DEFAULT_PLATFORMS.ignore)).toBe(true);
  });

  it('are never shared with resolved options', () => {
    const o = resolveOptions({});
    expect(o.behaviors).not.toBe(DEFAULT_BEHAVIORS);
    expect(o.platforms).not.toBe(DEFAULT_PLATFORMS);
    o.behaviors.walk = false;
    expect(DEFAULT_BEHAVIORS.walk).toBe(true);
  });

  it('exposes phrases and state names', () => {
    expect(DEFAULT_PHRASES.poke.length).toBeGreaterThan(0);
    expect(PagegeistStates.WALK).toBe('WALK');
  });
});
