/**
 * All randomness goes through this wrapper, so behavior can be made deterministic
 * (tests, replays) by passing a seeded source via the `random` option.
 */
export interface Random {
  /** Uniform number in [0, 1). */
  next(): number;
  /** Uniform number in [min, max). */
  range(min: number, max: number): number;
  chance(probability: number): boolean;
  pick<T>(list: readonly T[]): T | undefined;
  weighted<T>(items: ReadonlyArray<{ weight: number; value: T }>): T | null;
}

export function createRandom(source: () => number = Math.random): Random {
  const next = () => source();
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (list) => (list.length ? list[Math.floor(next() * list.length)] : undefined),
    weighted(items) {
      const total = items.reduce((s, i) => s + Math.max(0, i.weight), 0);
      if (total <= 0) return null;
      let r = next() * total;
      for (const item of items) {
        r -= Math.max(0, item.weight);
        if (r <= 0) return item.value;
      }
      return items[items.length - 1]?.value ?? null;
    },
  };
}

/**
 * Small seeded PRNG (mulberry32) for reproducible behavior, e.g. in tests.
 *
 * @example
 * createPagegeist({ random: seeded(42) });
 */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
