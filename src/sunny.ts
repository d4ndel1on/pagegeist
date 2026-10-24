import type { PagegeistCharacter } from './core/character';
import type { PhraseList, PhraseTrigger } from './core/options';

/**
 * Built-in phrases of `sunny` (frozen). Persona: the goth's little sister – bubbly, bouncy,
 * wants your attention and loves every poke. Spread a list to extend it instead of replacing it.
 *
 * @example
 * createPagegeist({ character: sunny, phrases: { poke: [...SUNNY_PHRASES.poke, 'Yay!'] } });
 */
export const SUNNY_PHRASES: Readonly<Record<PhraseTrigger, PhraseList>> = Object.freeze({
  poke: [
    'Hi! Hi! Hi!',
    'Again! Again!',
    'That tickles!',
    'You noticed me!',
    'Boop!',
    'Best. Poke. Ever.',
    'Do it again!',
    'My sister would hiss at you.',
    'Hehe.',
    'Finally, a friend!',
    'You poke, I sparkle.',
    "Don't tell my sister I liked that.",
  ],
  grab: [
    'Wheee!',
    'Higher!',
    "We're flying!",
    'Careful, the dress is borrowed!',
    'Spin me!',
    'Best ride on this page!',
    'My sister hates this part.',
    'Throw me! Go on!',
    'My sister bites. I hug.',
  ],
  cursorNear: [
    'Hi there!',
    'Ooh, a cursor!',
    'Come closer!',
    'Wanna see a trick?',
    'Over here!',
    'Click me! Click me!',
    'Hello, friend!',
    'Stay a while!',
    'I like your cursor.',
    "My sister says hi! She doesn't, but still.",
  ],
  sit: [
    'Saving this seat for you!',
    'Comfy! Come sit!',
    'Best seat on the page!',
    'This button is great. Click it!',
    'I sit, you scroll. Deal?',
    'Tea party up here!',
    "Saved my sister a seat. She won't come.",
  ],
  idle: [
    'Look at me!',
    'Watch this!',
    'Hey! Over here!',
    'Is anyone there?',
    'This page is the best!',
    'I bleached it myself.',
    'Black was her color. Not mine.',
    'Same dress. Opposite ghost.',
    'Wanna be friends?',
    'Scroll! I wanna see more!',
    'So many buttons!',
    'Goth is a phase. Hers lasted 300 years.',
    'My sister says smiling is cringe.',
    "Don't tell her I borrowed the boots.",
  ],
  land: [],
});

/**
 * The goth's little sister: same black hair, same hand-me-down clothes – bleached ghostly
 * white – and the opposite mood. Friendly, sunny and out for your attention. Separate entry, so the default bundle stays
 * as it is.
 *
 * @example
 * import { createPagegeist } from '@d4ndel1on/pagegeist';
 * import { sunny } from '@d4ndel1on/pagegeist/sunny';
 *
 * createPagegeist({ character: sunny, pauseControl: true }); // React: <Pagegeist character={sunny} />
 */
export const sunny: PagegeistCharacter = Object.freeze({
  name: 'sunny',
  palette: Object.freeze({
    skin: '#f9ebe3',
    skinFar: '#e8d1c6',
    skinLine: 'rgba(150, 80, 60, 0.35)',
    hair: '#100e14',
    hairHi: 'rgba(110, 120, 160, 0.4)',
    velvet: '#eef3fb',
    velvetFar: '#cdd6e6',
    velvetHi: 'rgba(255, 255, 255, 0.8)',
    corset: '#dbe4f3',
    lacing: '#7d8db0',
    lace: '#c8d3e8',
    laceHi: 'rgba(255, 255, 255, 0.7)',
    chiffon: '#f5f8fd',
    metal: '#aab5cc',
    liner: '#14121a',
    iris: '#3b6fb0',
    lips: '#d9788c',
    boot: '#f1f4fa',
    bootFar: '#c6cfdf',
    bootHi: 'rgba(125, 140, 180, 0.6)',
    buckle: '#94a1bb',
    red: '#7fa6e0',
    redHi: '#a9c6f0',
    net: 'rgba(232, 238, 250, 0.8)',
  }),
  phrases: SUNNY_PHRASES,
  bubble: Object.freeze(['rgba(248, 251, 255, 0.95)', 'rgba(120, 150, 220, 0.7)', '#1d2233'] as const),
  outline: Object.freeze(['rgba(205, 220, 255, 0.4)', 'rgba(70, 85, 130, 0.35)'] as const),
  // Eager: notices the cursor from further away, runs over to it and never sits still for long.
  temper: Object.freeze({ cursorRange: 1.6, approach: 5, pace: 1.4, patience: 0.5 }),
});

export type { PagegeistCharacter } from './core/character';
