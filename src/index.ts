import { Engine, type PagegeistInstance } from './core/Engine';
import type { PagegeistOptions } from './core/options';

/**
 * Creates the mascot and mounts it immediately.
 *
 * Importing this module is SSR-safe; calling this function requires a browser
 * (`document`), so call it from client code – e.g. in a `useEffect`.
 *
 * @example
 * const pagegeist = createPagegeist({ phrases: { poke: ['Hey!'] } });
 * pagegeist.say('Welcome.');
 * // later
 * pagegeist.destroy();
 */
export function createPagegeist(options: PagegeistOptions = {}): PagegeistInstance {
  return new Engine(options);
}

export type { PagegeistInstance } from './core/Engine';
export type {
  BehaviorOptions,
  OutfitStyle,
  OutlineMode,
  PagegeistCallbacks,
  PagegeistEventMap,
  PagegeistEventName,
  PagegeistOptions,
  PagegeistState,
  PauseControlOptions,
  PhraseContext,
  PhraseList,
  PhraseMap,
  PhraseResolver,
  PhraseTrigger,
  PlatformOptions,
  ReducedMotionMode,
  SafeAreaOptions,
  ShoeStyle,
  TextLineMode,
  Vec2,
} from './core/options';
export { DEFAULT_BEHAVIORS, DEFAULT_PLATFORMS, DEFAULT_SIZE } from './core/options';
export { DEFAULT_PHRASES, SAY_ATTRIBUTE } from './core/phrases';
export { seeded } from './core/random';
export { PagegeistStates } from './core/types';
export { IGNORE_ATTRIBUTE } from './core/World';
