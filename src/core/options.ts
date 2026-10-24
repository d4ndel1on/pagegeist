import { goth, type PagegeistCharacter } from './character';
import type { PagegeistState, Vec2 } from './types';

export type { PagegeistState, Vec2 };

/** Situations in which the mascot may say something. */
export type PhraseTrigger = 'poke' | 'grab' | 'cursorNear' | 'sit' | 'idle' | 'land';

/** Passed to a {@link PhraseResolver}. */
export interface PhraseContext {
  /** What made her talk. */
  trigger: PhraseTrigger;
  /** The element she landed or sits on, if any. */
  element: Element | null;
  /** Her current activity. */
  state: PagegeistState;
}

/** Candidate phrases; one is picked at random. */
export type PhraseList = readonly string[];

/**
 * Phrases per trigger. A provided list replaces the default list for that trigger;
 * an empty list silences it. Omitted triggers keep the built-in phrases.
 *
 * @example
 * createPagegeist({
 *   phrases: {
 *     poke: ['Hey.', 'Rude.'],
 *     idle: [], // never talk unprompted
 *     landOn: { '.buy-button': ['Click it. I dare you.'] },
 *   },
 * });
 */
export interface PhraseMap {
  /** Said when she is clicked/tapped. */
  poke?: PhraseList;
  /** Said when a user picks her up. */
  grab?: PhraseList;
  /** Said when the cursor lingers next to her (needs `behaviors.chatter`). */
  cursorNear?: PhraseList;
  /** Said (sometimes) when she sits down. */
  sit?: PhraseList;
  /** Unprompted remarks while idle (needs `behaviors.chatter`). */
  idle?: PhraseList;
  /** Said on (some) landings anywhere. Empty by default. */
  land?: PhraseList;
  /** Said when landing on an element matching the CSS selector (first match wins). */
  landOn?: Readonly<Record<string, PhraseList>>;
}

/**
 * Full control, e.g. for i18n: return a phrase, a list to pick from, `null` to stay
 * silent, or `undefined` to fall back to the built-in phrases. Errors thrown here are
 * logged and she stays silent.
 *
 * @example
 * createPagegeist({ phrases: ({ trigger }) => i18n.t(`mascot.${trigger}`, { returnObjects: true }) });
 */
export type PhraseResolver = (context: PhraseContext) => string | PhraseList | null | undefined;

/** Toggles for individual behaviors. All `true` by default. */
export interface BehaviorOptions {
  /** Wander around on the current platform. */
  walk: boolean;
  /** Jump to neighboring platforms. */
  jump: boolean;
  /** Hang from edges, shimmy along them and climb up. */
  hang: boolean;
  /** Sit down on elements. */
  sit: boolean;
  /** Drop off the edge of a platform. */
  drop: boolean;
  /** Let users grab, carry and throw her. */
  drag: boolean;
  /** React to clicks/taps. */
  poke: boolean;
  /** Turn the head towards the cursor. */
  watchCursor: boolean;
  /** Occasionally say something on her own. */
  chatter: boolean;
}

/** How paragraphs are split into platforms, see {@link PlatformOptions.textLines}. */
export type TextLineMode = 'all' | 'first' | 'none';

/** Which elements she can stand on. */
export interface PlatformOptions {
  /**
   * Elements whose top edges become platforms. Replaces the default list – spread
   * `DEFAULT_PLATFORMS.selectors` to extend it. Invalid selectors are skipped.
   * @defaultValue `['h1', 'h2', 'h3', 'p', 'button', '.card', '[data-pagegeist-platform]']`
   */
  selectors: readonly string[];
  /**
   * Elements matching (or inside) these selectors never become platforms. Elements inside
   * `[data-pagegeist-ignore]` are always ignored.
   * @defaultValue `[]`
   */
  ignore: readonly string[];
  /**
   * Paragraphs (`p`) are split into text lines via Range.getClientRects().
   * 'all' = every line is a platform, 'first' = only the first one, 'none' = the whole block.
   * Headings always use their text lines.
   * @defaultValue `'all'`
   */
  textLines: TextLineMode;
  /**
   * Platforms narrower than this (px) are ignored.
   * @defaultValue `28`
   */
  minWidth: number;
}

/** Viewport margins she keeps clear of. */
export interface SafeAreaOptions {
  /**
   * Viewport area at the top she must not stand in (px). 'auto' detects fixed/sticky
   * headers, so she never ends up with her head under your navigation bar.
   * @defaultValue `'auto'`
   */
  top: number | 'auto';
  /**
   * Same for the bottom edge (cookie banners, bottom nav bars). The virtual floor sits above it.
   * @defaultValue `'auto'`
   */
  bottom: number | 'auto';
}

/**
 * What to do when the user has `prefers-reduced-motion: reduce` enabled.
 * - 'static': she stays put on one element and only blinks/looks around (default)
 * - 'calm':   she moves, but less often and without acrobatics
 * - 'hidden': she is not shown at all
 * - 'ignore': no change
 */
export type ReducedMotionMode = 'static' | 'calm' | 'hidden' | 'ignore';

/**
 * Rim around her so she stays visible where she would blend in.
 * - 'auto':   only where the character needs it (goth: dark backgrounds, sunny: both – a
 *             ghostly glow on dark ones for her black hair, a blue-grey rim on light ones)
 * - 'always' / 'never'
 */
export type OutlineMode = 'auto' | 'always' | 'never';

/**
 * Clothing style.
 * - 'classic': velvet top with bell sleeves, corset and a long layered skirt (default)
 * - 'corset':  corset top with spaghetti straps, short ruffled miniskirt and a thigh band
 */
export type OutfitStyle = 'classic' | 'corset';

/**
 * Footwear. Both share the same foot geometry, so the gait is identical.
 * - 'boots': knee-high stiletto boots (default)
 * - 'heels': black high-top lace-up platform boots with a chunky block heel
 */
export type ShoeStyle = 'boots' | 'heels';

/** Placement and labels of the built-in pause button. */
export interface PauseControlOptions {
  /**
   * Viewport corner of the button.
   * @defaultValue `'bottom-right'`
   */
  position: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  /**
   * Accessible name while she moves (names the action, no `aria-pressed`).
   * @defaultValue `'Pause mascot'`
   */
  pauseLabel: string;
  /**
   * Accessible name while she is paused.
   * @defaultValue `'Resume mascot'`
   */
  resumeLabel: string;
}

/** Event payloads per event name, for `instance.on(type, listener)`. */
export interface PagegeistEventMap {
  /** Every state transition; `from` is `null` for the first one. */
  stateChange: { from: PagegeistState | null; to: PagegeistState };
  /** She landed; `element` is `null` for the virtual floor. `impactSpeed` in px/s. */
  land: { element: Element | null; impactSpeed: number };
  /** She was clicked/tapped. */
  poke: Record<string, never>;
  /** A user picked her up. */
  grab: Record<string, never>;
  /**
   * She was let go; throw `velocity` in px/s. Pausing, `respawn()` or losing pointer capture
   * during a drag release her with zero velocity.
   */
  release: { velocity: Vec2 };
  /** A speech bubble appeared (`trigger` is `'api'` for `say()`). */
  say: { text: string; trigger: PhraseTrigger | 'api' };
  /** She was paused (API, `paused` prop or pause button). */
  pause: Record<string, never>;
  /** She was resumed (API, `paused` prop or pause button). */
  resume: Record<string, never>;
}

/** Name of an event in {@link PagegeistEventMap}. */
export type PagegeistEventName = keyof PagegeistEventMap;

/**
 * Callback props/options, one per event in {@link PagegeistEventMap}. In React they always call
 * the latest function (no `useCallback` needed), but they cannot be passed from a server component.
 */
export interface PagegeistCallbacks {
  onStateChange?(event: PagegeistEventMap['stateChange']): void;
  onLand?(event: PagegeistEventMap['land']): void;
  onPoke?(event: PagegeistEventMap['poke']): void;
  onGrab?(event: PagegeistEventMap['grab']): void;
  onRelease?(event: PagegeistEventMap['release']): void;
  onSay?(event: PagegeistEventMap['say']): void;
  onPause?(event: PagegeistEventMap['pause']): void;
  onResume?(event: PagegeistEventMap['resume']): void;
}

/**
 * Options for `createPagegeist()` / props of `<Pagegeist />`. All optional.
 *
 * Everything except `container`, `size` and `random` can be changed later: in React by changing
 * props (declarative – removing a prop restores its default), in vanilla JS with
 * `instance.update()` (merging – omitted keys keep their current value).
 *
 * @example
 * createPagegeist({
 *   pauseControl: true,
 *   size: 96,
 *   behaviors: { chatter: false },
 *   platforms: { ignore: ['footer', '.checkout'] },
 * });
 */
export interface PagegeistOptions extends PagegeistCallbacks {
  /**
   * Element the overlay is appended to. Keep it outside transformed elements and elements that
   * create a stacking context. Not updatable (React: changing it recreates the mascot).
   * @defaultValue `document.body`
   */
  container?: HTMLElement;
  /**
   * Standing height in CSS pixels; physics scale with it. Must be finite and > 0, otherwise the
   * default is used. Not updatable (React: changing it recreates the mascot).
   * @defaultValue `112`
   */
  size?: number;
  /**
   * z-index of the overlay canvas; the hitbox uses +1, the pause button +2. Rounded; non-finite
   * values fall back to the default. Top-layer content (modal `<dialog>`, popovers) is always above.
   * @defaultValue `9999`
   */
  zIndex?: number;
  /**
   * Horizontal spawn position: keyword or fraction of the viewport width (0..1).
   * @defaultValue `'random'`
   */
  spawn?: 'random' | 'left' | 'center' | 'right' | number;
  /**
   * Which elements she can stand on. Merged per key with the defaults.
   * @example
   * platforms: { selectors: [...DEFAULT_PLATFORMS.selectors, '.hero'], ignore: ['footer'] }
   */
  platforms?: Partial<PlatformOptions>;
  /**
   * Viewport bands she keeps clear of (fixed/sticky headers and bottom bars).
   * @defaultValue `{ top: 'auto', bottom: 'auto' }`
   */
  safeArea?: Partial<SafeAreaOptions>;
  /**
   * Turn individual behaviors off; every flag defaults to `true`. Merged per key.
   * @example
   * behaviors: { hang: false, chatter: false }
   */
  behaviors?: Partial<BehaviorOptions>;
  /**
   * What she says: a {@link PhraseMap} (per-trigger lists replace the built-ins) or a
   * {@link PhraseResolver} function (e.g. for i18n). Rendered as plain text, never HTML.
   * @defaultValue the built-in phrases (`DEFAULT_PHRASES`)
   */
  phrases?: PhraseMap | PhraseResolver;
  /**
   * What happens while the user prefers reduced motion; watched at runtime.
   * @defaultValue `'static'`
   */
  reducedMotion?: ReducedMotionMode;
  /**
   * Who haunts the page: {@link goth} (default) or her little sister `sunny` – same
   * hand-me-down clothes, bleached ghostly white, opposite mood (colors, speech bubble, built-in
   * phrases, and an eager temper: she notices the cursor from further away and hurries over to it).
   * Import `sunny` from `@d4ndel1on/pagegeist/sunny`, so it costs nothing unless used.
   * @defaultValue `goth`
   * @example
   * import { sunny } from '@d4ndel1on/pagegeist/sunny';
   * createPagegeist({ character: sunny });
   */
  character?: PagegeistCharacter;
  /**
   * Rim around her. 'auto' shows it where the character would blend in: on dark backgrounds
   * for `goth`; on both for `sunny` (a ghostly glow on dark ones, a blue-grey rim on light ones).
   * @defaultValue `'auto'`
   */
  outline?: OutlineMode;
  /**
   * CSS color of the outline.
   * @defaultValue the character's: `'rgba(220, 205, 255, 0.32)'` for `goth`; for `sunny`
   * `'rgba(205, 220, 255, 0.4)'` on dark and `'rgba(70, 85, 130, 0.35)'` on light backgrounds
   */
  outlineColor?: string;
  /**
   * Clothing style.
   * @defaultValue `'classic'`
   */
  outfit?: OutfitStyle;
  /**
   * Footwear: knee-high stiletto boots or high-top lace-up platform boots.
   * @defaultValue `'boots'`
   */
  shoes?: ShoeStyle;
  /**
   * Diamond-mesh fishnet tights.
   * @defaultValue `false`
   */
  fishnets?: boolean;
  /**
   * Show a small, keyboard-accessible pause/resume button. Enable it (or provide your own
   * control wired to `paused` / `pause()`) for WCAG 2.2.2 conformance.
   * @defaultValue `false`
   * @example
   * pauseControl: { position: 'bottom-left' }
   */
  pauseControl?: boolean | Partial<PauseControlOptions>;
  /**
   * Also announce speech bubbles to screen readers via a polite live region.
   * @defaultValue `false`
   */
  announce?: boolean;
  /**
   * Set `data-pagegeist-occupied` / `data-pagegeist-landed` on the elements she stands or
   * lands on, for your own CSS effects. Off by default, so your DOM stays untouched.
   * @defaultValue `false`
   */
  markElements?: boolean;
  /**
   * Start paused. In React it pauses/resumes declaratively and is applied only when its value
   * changes, so the pause button and `pause()` survive re-renders.
   * @defaultValue `false`
   */
  paused?: boolean;
  /**
   * Draw platforms, safe area, hitbox and her current plan.
   * @defaultValue `false`
   */
  debug?: boolean;
  /**
   * Seconds off-screen before she falls back into view (>= 0).
   * @defaultValue `1.5`
   */
  respawnAfter?: number;
  /**
   * Simulation speed multiplier – slow motion for debugging/demos. Everything (walking,
   * physics, blinking, breathing) slows uniformly. Clamped to 0.05–4.
   * @defaultValue `1`
   */
  timeScale?: number;
  /**
   * Custom random source in [0, 1) for deterministic behavior, e.g. `seeded(42)`. Read only on
   * creation, not updatable.
   * @defaultValue `Math.random`
   */
  random?: () => number;
}

export interface ResolvedOptions {
  zIndex: number;
  spawn: NonNullable<PagegeistOptions['spawn']>;
  platforms: PlatformOptions;
  safeArea: SafeAreaOptions;
  behaviors: BehaviorOptions;
  phrases: PhraseMap | PhraseResolver;
  reducedMotion: ReducedMotionMode;
  character: PagegeistCharacter;
  outline: OutlineMode;
  /** '' = the character's default. */
  outlineColor: string;
  outfit: OutfitStyle;
  shoes: ShoeStyle;
  fishnets: boolean;
  pauseControl: PauseControlOptions | null;
  announce: boolean;
  markElements: boolean;
  debug: boolean;
  respawnAfter: number;
  timeScale: number;
}

/** Default standing height in CSS pixels. */
export const DEFAULT_SIZE = 112;

/** Default platform options (frozen). */
export const DEFAULT_PLATFORMS: Readonly<PlatformOptions> = Object.freeze({
  selectors: Object.freeze(['h1', 'h2', 'h3', 'p', 'button', '.card', '[data-pagegeist-platform]']),
  ignore: Object.freeze([]),
  textLines: 'all',
  minWidth: 28,
});

/** Default behavior toggles (frozen). */
export const DEFAULT_BEHAVIORS: Readonly<BehaviorOptions> = Object.freeze({
  walk: true,
  jump: true,
  hang: true,
  sit: true,
  drop: true,
  drag: true,
  poke: true,
  watchCursor: true,
  chatter: true,
});

const DEFAULT_PAUSE_CONTROL: PauseControlOptions = {
  position: 'bottom-right',
  pauseLabel: 'Pause mascot',
  resumeLabel: 'Resume mascot',
};

/**
 * Merges user options onto `base` (or the defaults). Pure – safe to call during SSR.
 * Nested objects are merged per key into fresh objects; the frozen defaults are never mutated.
 */
export function resolveOptions(options: PagegeistOptions, base?: ResolvedOptions): ResolvedOptions {
  const pick = <K extends keyof ResolvedOptions>(key: K, fallback: ResolvedOptions[K]): ResolvedOptions[K] =>
    base ? base[key] : fallback;
  const pc = options.pauseControl;
  return {
    zIndex: Math.round(finite(options.zIndex ?? pick('zIndex', 9999), 9999)),
    spawn: options.spawn ?? pick('spawn', 'random'),
    platforms: { ...pick('platforms', DEFAULT_PLATFORMS), ...options.platforms },
    safeArea: { ...pick('safeArea', { top: 'auto', bottom: 'auto' }), ...options.safeArea },
    behaviors: { ...pick('behaviors', DEFAULT_BEHAVIORS), ...options.behaviors },
    phrases: options.phrases ?? pick('phrases', {}),
    reducedMotion: options.reducedMotion ?? pick('reducedMotion', 'static'),
    outline: options.outline ?? pick('outline', 'auto'),
    character: options.character ?? pick('character', goth),
    outlineColor: options.outlineColor ?? pick('outlineColor', ''),
    outfit: options.outfit ?? pick('outfit', 'classic'),
    shoes: options.shoes ?? pick('shoes', 'boots'),
    fishnets: options.fishnets ?? pick('fishnets', false),
    pauseControl:
      pc === undefined
        ? pick('pauseControl', null)
        : pc === false
          ? null
          : { ...DEFAULT_PAUSE_CONTROL, ...(pc === true ? {} : pc) },
    announce: options.announce ?? pick('announce', false),
    markElements: options.markElements ?? pick('markElements', false),
    debug: options.debug ?? pick('debug', false),
    respawnAfter: Math.max(0, finite(options.respawnAfter ?? pick('respawnAfter', 1.5), 1.5)),
    timeScale: Math.min(4, Math.max(0.05, finite(options.timeScale ?? pick('timeScale', 1), 1))),
  };
}

/** `value` if it is a finite number, otherwise `fallback`. */
const finite = (value: number, fallback: number): number => (Number.isFinite(value) ? value : fallback);
