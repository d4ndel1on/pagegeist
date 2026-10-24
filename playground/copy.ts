import type { PhraseMap } from '@d4ndel1on/pagegeist';

/** Demo-page texts per sister: the page switches its copy (and theme) with the character. */
export interface PageCopy {
  /** Switch label (with a decorative glyph) and the theme the page switches to. */
  label: string;
  glyph: string;
  light: boolean;
  eyebrow: string;
  title: string;
  sub: string;
  lead: string;
  /** Demo-page specific phrases (not shown in the snippet). */
  landOn: NonNullable<PhraseMap['landOn']>;
  bait: { label: string; clicked: string; say: string };
  /** What the three step buttons make her say; the last one also summons her. */
  steps: [string, string, string];
  cardSay: string;
  landDemo: string;
  claimed: string;
  sayButton: string;
  defaultText: string;
  /** Said when she takes over the page from her sister. */
  hello: string;
  footerNote: string;
}

export const COPY: Record<'goth' | 'sunny', PageCopy> = {
  goth: {
    label: 'Goth',
    glyph: '☾',
    light: false,
    eyebrow: 'Interactive demo · haunted since you arrived',
    title: 'She lives here now.',
    sub: "You're just visiting.",
    lead: "Pagegeist is the poltergeist of this page. She stomps across headings, claims your buttons, dangles from edges and shimmies along lines of text like she pays rent here. Poke her, drag her, throw her – she'll complain, but the page stays fully usable.",
    landOn: { '.btn--primary': ['This one looks important. Mine now.', 'Click it. I dare you.'] },
    bait: { label: 'Do not click', clicked: 'Told you.', say: "I said don't.|Don't you dare." },
    steps: ['One step at a time. Mine.', "Higher. I'm not carrying you.", 'Fine. I am coming.'],
    cardSay: "I'm sitting here now.|This card is mine.",
    landDemo: 'Watch me land.',
    claimed: '🖤 Claimed.',
    sayButton: 'Annoy her',
    defaultText: 'This page is mine now.',
    hello: "Finally. She's gone.",
    footerNote: 'No ghosts were harmed. Several cursors were.',
  },
  sunny: {
    label: 'Sunny',
    glyph: '☀',
    light: true,
    eyebrow: 'Interactive demo · now with 100% more waving',
    title: 'She lives here too.',
    sub: 'Come play!',
    lead: "Pagegeist's little sister. Same dress, bleached ghostly white – opposite mood. She hops across headings, saves you a seat on the buttons and hurries over whenever your cursor shows up. Poke her, drag her, throw her – she loves every second, and the page stays fully usable.",
    landOn: { '.btn--primary': ['Ooh, shiny! Click it!', 'This one! Pick this one!'] },
    bait: { label: 'Click me!', clicked: 'Yay!', say: 'Yay! Again!|Best button ever!' },
    steps: ['Wait for me!', 'Race you to the top!', 'Coming! Coming!'],
    cardSay: 'Saving this card for you!|Comfy card!',
    landDemo: 'Watch me land! Watch!',
    claimed: '🤍 Shared!',
    sayButton: 'Cheer her on',
    defaultText: 'Hi! Look at me!',
    hello: "My turn! She's sulking upstairs.",
    footerNote: 'No ghosts were harmed. Several cursors were hugged.',
  },
};
