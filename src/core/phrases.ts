import type { PhraseContext, PhraseList, PhraseMap, PhraseResolver, PhraseTrigger } from './options';
import type { Random } from './random';

/** Built-in phrases. Persona: the page's poltergeist – bratty, bossy, easily annoyed, never helpless. */
export const DEFAULT_PHRASES: Readonly<Record<PhraseTrigger, PhraseList>> = Object.freeze({
  poke: [
    'Did you just poke me?',
    'Again?',
    'Stop it.',
    'Rude.',
    'Hmpf.',
    'Poke me again. I dare you.',
    "I'm busy.",
    'Hands where I can see them.',
    'Who said you could touch me?',
    'Do that again. See what happens.',
    'Ghost, not toy.',
  ],
  grab: [
    'Put. Me. Down.',
    'Hands off the lace.',
    'I will haunt you.',
    'Excuse you?',
    'Unhand me.',
    'Careful. I am vintage.',
    'You will regret this.',
    'Down. Now.',
  ],
  cursorNear: [
    'Personal space.',
    'Can I help you?',
    "Your cursor's in my way.",
    'Mine.',
    'Go click something else.',
    'Scroll. Now.',
    'Back off.',
    'Did I say you could come closer?',
    'Hover somewhere else.',
  ],
  sit: [
    'This button is mine now.',
    'I sit here now. Deal.',
    '…',
    'Throne acquired.',
    'Not moving. Make me.',
    'My seat. My rules.',
  ],
  idle: [
    '*sigh*',
    'Bored.',
    'Entertain me.',
    'I was here first.',
    'This page is mine.',
    'Bow to the ghost.',
    "I'm waiting.",
    'Amuse me. Now.',
    'I could rearrange your buttons, you know.',
    'Tick tock.',
  ],
  land: [],
});

/** Attribute authors can put on any element: `data-pagegeist-say="Nice button.|Click it."` */
export const SAY_ATTRIBUTE = 'data-pagegeist-say';

const pickFrom = (value: string | PhraseList | null | undefined, rng: Random): string | null | undefined => {
  if (value == null) return value;
  if (typeof value === 'string') return value;
  return rng.pick(value) ?? null;
};

function fromMap(map: PhraseMap, ctx: PhraseContext): PhraseList | undefined {
  if (ctx.trigger === 'land' && ctx.element && map.landOn) {
    for (const [selector, list] of Object.entries(map.landOn)) {
      try {
        if (ctx.element.matches(selector)) return list;
      } catch {
        // Invalid selector from user config – ignore it instead of breaking the loop.
      }
    }
  }
  return map[ctx.trigger];
}

/**
 * Resolves the text to say for a trigger, or null for silence.
 * Order: `data-pagegeist-say` on the element → user config → built-in defaults.
 */
export function resolvePhrase(config: PhraseMap | PhraseResolver, ctx: PhraseContext, rng: Random): string | null {
  if (ctx.element && (ctx.trigger === 'land' || ctx.trigger === 'sit')) {
    const attr = ctx.element.closest(`[${SAY_ATTRIBUTE}]`)?.getAttribute(SAY_ATTRIBUTE);
    if (attr) {
      const parts = attr
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length) return rng.pick(parts) ?? null;
    }
  }
  let custom: string | null | undefined;
  try {
    custom = pickFrom(typeof config === 'function' ? config(ctx) : fromMap(config, ctx), rng);
  } catch (error) {
    // A throwing user resolver must not break the animation frame: stay silent instead.
    console.error('pagegeist: error in phrase resolver', error);
    return null;
  }
  if (custom !== undefined) return custom;
  return rng.pick(DEFAULT_PHRASES[ctx.trigger]) ?? null;
}
