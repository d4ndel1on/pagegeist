import type { PagegeistState, Vec2 } from './types';

export type { PagegeistState, Vec2 };

/** Situations in which the mascot may say something. */
export type PhraseTrigger = 'poke' | 'grab' | 'cursorNear' | 'sit' | 'idle' | 'land';

/** Passed to a {@link PhraseResolver}. */
export interface PhraseContext {
  trigger: PhraseTrigger;
  /** The element she landed or sits on, if any. */
  element: Element | null;
  state: PagegeistState;
}

/** Candidate phrases; one is picked at random. */
export type PhraseList = readonly string[];

/**
 * Phrases per trigger. A provided list replaces the default list for that trigger;
 * an empty list silences it.
 */
export interface PhraseMap {
  poke?: PhraseList;
  grab?: PhraseList;
  cursorNear?: PhraseList;
  sit?: PhraseList;
  idle?: PhraseList;
  /** Said on (some) landings anywhere. Empty by default. */
  land?: PhraseList;
  /** Said when landing on an element matching the CSS selector (first match wins). */
  landOn?: Readonly<Record<string, PhraseList>>;
}

/**
 * Full control, e.g. for i18n: return a phrase, a list to pick from, `null` to stay
 * silent, or `undefined` to fall back to the built-in phrases.
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
  /** Elements whose top edges become platforms. */
  selectors: readonly string[];
  /** Elements matching (or inside) these selectors never become platforms. */
  ignore: readonly string[];
  /**
   * Paragraphs (`p`) are split into text lines via Range.getClientRects().
   * 'all' = every line is a platform, 'first' = only the first one, 'none' = the whole block.
   */
  textLines: TextLineMode;
  /** Platforms narrower than this (px) are ignored. */
  minWidth: number;
}

/** Viewport margins she keeps clear of. */
export interface SafeAreaOptions {
  /**
   * Viewport area at the top she must not stand in (px). 'auto' detects fixed/sticky
   * headers, so she never ends up with her head under your navigation bar.
   */
  top: number | 'auto';
  /** Same for the bottom edge (cookie banners, bottom nav bars). */
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

/** Light rim around the dark outfit so she stays visible on dark pages. */
export type OutlineMode = 'auto' | 'always' | 'never';

/**
 * Clothing style.
 * - 'classic': velvet top with bell sleeves, corset and a long layered skirt (default)
 * - 'corset':  corset top with spaghetti straps, short ruffled miniskirt and a thigh band
 */
export type OutfitStyle = 'classic' | 'corset';

/** Footwear. Both share the same heel geometry, so the gait is identical. */
export type ShoeStyle = 'boots' | 'heels';

/** Placement and labels of the built-in pause button. */
export interface PauseControlOptions {
  /** Default: 'bottom-right'. */
  position: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  pauseLabel: string;
  resumeLabel: string;
}

/** Event payloads per event name, for `instance.on(type, listener)`. */
export interface PagegeistEventMap {
  stateChange: { from: PagegeistState | null; to: PagegeistState };
  land: { element: Element | null; impactSpeed: number };
  poke: Record<string, never>;
  grab: Record<string, never>;
  release: { velocity: Vec2 };
  say: { text: string; trigger: PhraseTrigger | 'api' };
  pause: Record<string, never>;
  resume: Record<string, never>;
}

/** Name of an event in {@link PagegeistEventMap}. */
export type PagegeistEventName = keyof PagegeistEventMap;

/** Callback props/options, one per event in {@link PagegeistEventMap}. */
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

/** Options for `createPagegeist()` / props of `<Pagegeist />`. All optional. */
export interface PagegeistOptions extends PagegeistCallbacks {
  /** Element the overlay is appended to. Default: `document.body`. Not updatable. */
  container?: HTMLElement;
  /** Standing height in CSS pixels (finite, > 0; otherwise the default). Default: 112. Not updatable. */
  size?: number;
  /** z-index of the overlay (rounded; non-finite values fall back to the default). Default: 9999. */
  zIndex?: number;
  /** Horizontal spawn position: keyword or fraction of the viewport width (0..1). Default: 'random'. */
  spawn?: 'random' | 'left' | 'center' | 'right' | number;
  platforms?: Partial<PlatformOptions>;
  safeArea?: Partial<SafeAreaOptions>;
  behaviors?: Partial<BehaviorOptions>;
  phrases?: PhraseMap | PhraseResolver;
  /** Default: 'static'. */
  reducedMotion?: ReducedMotionMode;
  /** Default: 'auto' (only on dark backgrounds). */
  outline?: OutlineMode;
  /** CSS color of the outline. */
  outlineColor?: string;
  /** Clothing style. Default: 'classic'. */
  outfit?: OutfitStyle;
  /** Footwear: knee-high boots or studded block-heel ankle boots. Default: 'boots'. */
  shoes?: ShoeStyle;
  /** Fishnet tights. Default: false. */
  fishnets?: boolean;
  /** Show a small built-in pause/resume button. Default: false. */
  pauseControl?: boolean | Partial<PauseControlOptions>;
  /** Also announce speech bubbles to screen readers via a polite live region. Default: false. */
  announce?: boolean;
  /**
   * Set `data-pagegeist-occupied` / `data-pagegeist-landed` on the elements she stands or
   * lands on, for your own CSS effects. Default: false (your DOM stays untouched).
   */
  markElements?: boolean;
  /** Start paused. Default: false. */
  paused?: boolean;
  /** Draw platforms, hitbox and plans. Default: false. */
  debug?: boolean;
  /** Seconds off-screen before she falls back into view (>= 0). Default: 1.5. */
  respawnAfter?: number;
  /**
   * Simulation speed multiplier – slow motion for debugging/demos. Everything (walking,
   * physics, blinking, breathing) slows uniformly. Clamped to 0.05–4. Default: 1.
   */
  timeScale?: number;
  /** Custom random source in [0, 1) for deterministic behavior. Not updatable. */
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
  outline: OutlineMode;
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
    outlineColor: options.outlineColor ?? pick('outlineColor', 'rgba(220, 205, 255, 0.32)'),
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
