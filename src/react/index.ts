'use client';

import {
  type ForwardRefExoticComponent,
  forwardRef,
  type RefAttributes,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { CALLBACK_KEYS } from '../core/Engine';
import { type ResolvedOptions, resolveOptions } from '../core/options';
import {
  createPagegeist,
  type PagegeistEventMap,
  type PagegeistEventName,
  type PagegeistInstance,
  type PagegeistOptions,
  type PagegeistState,
} from '../index';

/**
 * Props of `<Pagegeist />` (and options of `usePagegeist()`). Declarative: removing a prop
 * restores its default.
 *
 * - `container` and `size` recreate the mascot when they change. `container` must be a
 *   stable element – note that `ref.current` is still `null` during the first render, so
 *   pass an element from state (e.g. a callback ref) rather than `someRef.current`.
 * - `random` is read only when the mascot is created; changing it later has no effect,
 *   so an inline `random={seeded(42)}` is fine.
 * - `paused` is applied only when its value changes, so pausing via the handle or the
 *   built-in button is not undone by unrelated re-renders. Removing it resumes.
 * - Callbacks always call the latest prop; changing them never recreates or updates the mascot.
 */
export type PagegeistProps = PagegeistOptions;

/** Imperative handle exposed via `ref` and returned by `usePagegeist()`. Stable for the component's lifetime. */
export interface PagegeistHandle {
  /** Show a speech bubble (plain text). No-op until mounted. */
  say(text: string, options?: { duration?: number }): void;
  /** Pause the animation (no-op until mounted). A later change of the `paused` prop overrides it. */
  pause(): void;
  /** Resume after `pause()` (no-op until mounted). */
  resume(): void;
  /** Let her fall into view again (or reappear on an element in static mode). */
  respawn(): void;
  /**
   * Subscribe to an event. Unlike `instance.on()`, the listener survives recreation of the
   * mascot (e.g. when `size` changes) and may be added before mount. Returns an unsubscribe function.
   */
  on<K extends PagegeistEventName>(type: K, listener: (event: PagegeistEventMap[K]) => void): () => void;
  /** Current activity, or null before mount / during SSR. */
  readonly state: PagegeistState | null;
  readonly paused: boolean;
  /**
   * The underlying vanilla instance (null before mount). It is replaced when the mascot is
   * recreated, so prefer `handle.on()` over `instance.on()`.
   */
  readonly instance: PagegeistInstance | null;
}

type Callback = (event: unknown) => void;
interface Subscription {
  type: PagegeistEventName;
  listener: Callback;
  off?: () => void;
}
/** Mutable per-hook state, kept in one ref. */
interface HookState {
  instance: PagegeistInstance | null;
  /** Latest options (read by the callback trampolines and on creation). */
  options: PagegeistOptions;
  /** Options last applied to the instance. */
  applied?: ResolvedOptions;
  /** `paused` prop last applied to the instance. */
  paused?: boolean;
  subs: Set<Subscription>;
}

const CALLBACKS = Object.values(CALLBACK_KEYS);

/** Shallow equality; nested plain objects (behaviors, platforms, phrase maps…) compared by value. */
function sameOptions(a: ResolvedOptions, b?: ResolvedOptions): boolean {
  for (const key in a) {
    const x = a[key as keyof ResolvedOptions];
    const y = b?.[key as keyof ResolvedOptions];
    if (x !== y && (typeof x !== 'object' || JSON.stringify(x) !== JSON.stringify(y))) return false;
  }
  return true;
}

/**
 * Hook version of `<Pagegeist />`: mounts the mascot while the calling component is
 * mounted and keeps it in sync with `options` (see {@link PagegeistProps} for the semantics).
 */
export function usePagegeist(options: PagegeistOptions = {}): PagegeistHandle {
  const self = useRef<HookState>({ instance: null, options, subs: new Set() }).current;
  self.options = options;
  const { container, size } = options;

  // Structural options recreate the instance; everything else is applied via update().
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps are the structural options by design
  useEffect(() => {
    const current = self.options;
    const init: PagegeistOptions = { ...current };
    // Stable trampolines: callbacks always reach the latest props without update() calls.
    for (const key of CALLBACKS) init[key] = (event: never) => (self.options[key] as Callback | undefined)?.(event);
    const instance = createPagegeist(init);
    self.instance = instance;
    self.applied = resolveOptions(current);
    self.paused = current.paused;
    for (const sub of self.subs) sub.off = instance.on(sub.type, sub.listener);
    return () => {
      instance.destroy();
      if (self.instance === instance) self.instance = null;
    };
  }, [container, size]);

  // Runs after every render, but only calls update() when something actually changed.
  useEffect(() => {
    // Resolved against the defaults (not the current state), so every key is explicit
    // and removing a prop restores its default.
    const live = resolveOptions(options);
    const update: PagegeistOptions = { ...live, pauseControl: live.pauseControl ?? false };
    let changed = !sameOptions(live, self.applied);
    if (options.paused !== self.paused) {
      self.paused = options.paused;
      update.paused = !!options.paused;
      changed = true;
    }
    if (changed && self.instance) {
      self.applied = live;
      self.instance.update(update);
    }
  });

  return useMemo<PagegeistHandle>(
    () => ({
      say: (text, opts) => self.instance?.say(text, opts),
      pause: () => self.instance?.pause(),
      resume: () => self.instance?.resume(),
      respawn: () => self.instance?.respawn(),
      on: (type, listener) => {
        const sub: Subscription = { type, listener: listener as Callback, off: self.instance?.on(type, listener) };
        self.subs.add(sub);
        return () => {
          self.subs.delete(sub);
          sub.off?.();
        };
      },
      get state() {
        return self.instance?.state ?? null;
      },
      get paused() {
        return self.instance?.paused ?? false;
      },
      get instance() {
        return self.instance;
      },
    }),
    [self],
  );
}

/**
 * Drop-in component. Renders nothing itself – the mascot lives in a fixed overlay
 * appended to `document.body` (or `container`). Safe to render on the server.
 * See {@link PagegeistProps} for how prop changes are applied.
 *
 * @example
 * const ref = useRef<PagegeistHandle>(null);
 * <Pagegeist ref={ref} phrases={{ poke: ['Hey!'] }} onLand={({ element }) => …} />
 * ref.current?.say('Hello.');
 */
export const Pagegeist: ForwardRefExoticComponent<PagegeistProps & RefAttributes<PagegeistHandle>> = forwardRef<
  PagegeistHandle,
  PagegeistProps
>(function Pagegeist(props, ref) {
  const handle = usePagegeist(props);
  useImperativeHandle(ref, () => handle, [handle]);
  return null;
});

export type {
  BehaviorOptions,
  OutfitStyle,
  OutlineMode,
  PagegeistCallbacks,
  PagegeistEventMap,
  PagegeistEventName,
  PagegeistInstance,
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
} from '../index';
