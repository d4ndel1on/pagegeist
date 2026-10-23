import { describe, expect, it } from 'vitest';
import { createRandom, seeded } from '../src/core/random';

describe('random', () => {
  it('is reproducible with a seed', () => {
    const a = seeded(42);
    const b = seeded(42);
    const seqA = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(seqA);
    for (const n of seqA) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });

  it('never picks zero-weight items', () => {
    const rng = createRandom(seeded(1));
    for (let i = 0; i < 200; i++) {
      expect(
        rng.weighted([
          { weight: 0, value: 'never' },
          { weight: 1, value: 'a' },
          { weight: 3, value: 'b' },
        ]),
      ).not.toBe('never');
    }
  });

  it('returns null when all weights are zero', () => {
    expect(createRandom().weighted([{ weight: 0, value: 1 }])).toBeNull();
  });

  it('picks from lists and handles empty ones', () => {
    const rng = createRandom(() => 0.99);
    expect(rng.pick(['a', 'b', 'c'])).toBe('c');
    expect(rng.pick([])).toBeUndefined();
  });
});
