import type { PhraseList, PhraseTrigger } from './options';
import { DEFAULT_PHRASES } from './phrases';
import { GOTH_PALETTE, type Palette } from './render/GothRenderer';

/**
 * A character: her colors, speech bubble and built-in phrases. Pick one of the built-ins –
 * {@link goth} (the default, from `@d4ndel1on/pagegeist`) or her little sister `sunny`
 * (from `@d4ndel1on/pagegeist/sunny`). The fields besides `name` are internal and may change
 * in any release (e.g. when a character gets her own model), so do not build your own.
 */
export interface PagegeistCharacter {
  /** Name of the character, e.g. `'goth'` or `'sunny'`. */
  readonly name: string;
  /** @internal Colors of the renderer. */
  readonly palette: Palette;
  /** @internal Built-in phrases per trigger (what `phrases` replaces per trigger). */
  readonly phrases: Readonly<Record<PhraseTrigger, PhraseList>>;
  /** @internal Speech bubble and pause button: background, border and text color. */
  readonly bubble: readonly [fill: string, stroke: string, text: string];
  /** @internal Default outline color on dark and on light backgrounds; null = no `'auto'` outline there. */
  readonly outline: readonly [dark: string | null, light: string | null];
  /** @internal How she reacts to the cursor. */
  readonly temper: Temper;
}

/** @internal How eagerly a character goes for the cursor. All factors are 1 (or 0) for `goth`. */
export interface Temper {
  /** Scales the distances at which she notices the cursor (look, turn, greet). */
  readonly cursorRange: number;
  /** Planner weight of walking (and jumping) towards the cursor; 0 = never. */
  readonly approach: number;
  /** Walking speed factor while heading for the cursor. */
  readonly pace: number;
  /** Scales her idle pauses between activities (< 1 = restless). */
  readonly patience: number;
}

/**
 * The default character: the page's bratty gothic poltergeist. Pass it to switch back from
 * `sunny`; leaving `character` out gives the same result.
 *
 * @example
 * pagegeist.update({ character: goth });
 */
export const goth: PagegeistCharacter = Object.freeze({
  name: 'goth',
  palette: GOTH_PALETTE,
  phrases: DEFAULT_PHRASES,
  bubble: Object.freeze(['rgba(18, 13, 24, 0.92)', 'rgba(190, 150, 255, 0.55)', '#f2ecff'] as const),
  outline: Object.freeze(['rgba(220, 205, 255, 0.32)', null] as const),
  temper: Object.freeze({ cursorRange: 1, approach: 0, pace: 1, patience: 1 }),
});
