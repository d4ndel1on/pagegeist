# API reference

- [`createPagegeist(options)`](#createpagegeistoptions) – vanilla entry (`@d4ndel1on/pagegeist`)
- [`<Pagegeist />` and `usePagegeist()`](#react) – React entry (`@d4ndel1on/pagegeist/react`)
- [Options](#options)
- [Events](#events)
- [Other exports](#other-exports)

## `createPagegeist(options?)`

```ts
import { createPagegeist } from '@d4ndel1on/pagegeist';
const pagegeist: PagegeistInstance = createPagegeist(options);
```

Creates the mascot and mounts it immediately (synchronously). Importing the module is
SSR-safe; calling the function requires `document`, `ResizeObserver` and `MutationObserver`
and throws a descriptive `pagegeist: …` error otherwise. If setup fails half-way, everything
created so far (DOM nodes, listeners, observers) is rolled back before the error is rethrown.

### `PagegeistInstance`

| Member | Description |
|---|---|
| `state: PagegeistState` | Current activity, see [states](#states). |
| `paused: boolean` | Whether the simulation is paused. |
| `say(text, { duration? })` | Shows a speech bubble. `text` is rendered as plain text (never HTML). `duration` in seconds; default scales with the text length (2–5 s). |
| `pause()` / `resume()` | Freezes / continues her. While paused she does not move and cannot be grabbed; pausing during a drag releases her. The animation loop sleeps while paused. |
| `respawn()` | Lets her fall into view again (in static reduced-motion mode she reappears on an element). Releases her if she is being dragged. |
| `update(options)` | Applies new options at runtime and **merges**: only the given keys change, nested objects (`behaviors`, `platforms`, `safeArea`) are merged per key, and omitted keys keep their current value (pass the default explicitly to reset). `container`, `size` and `random` cannot be updated. The React adapter is declarative instead, see [below](#react). |
| `on(type, listener)` | Subscribes to an [event](#events); returns an unsubscribe function. |
| `destroy()` | Removes all DOM nodes, listeners, observers and attributes. Idempotent. |

## React

```tsx
import { Pagegeist, usePagegeist, type PagegeistHandle } from '@d4ndel1on/pagegeist/react';
```

### `<Pagegeist {...options} ref? />`

Accepts every [option](#options) as a prop and renders `null` (the mascot lives in a fixed
overlay). Props are **declarative**:

- Prop changes are applied via `update()` without remounting. **Removing a prop restores its
  default** (unlike the merging `instance.update()`). `update()` is skipped entirely when
  nothing changed (nested objects are compared by value), so inline objects are fine.
- `container` and `size` **recreate** the mascot (she falls in again). `container` must be a
  stable element. `ref.current` is still `null` during the first render, so keep the element
  in state (e.g. via a callback ref) instead of passing `someRef.current`.
- `random` is read only when the mascot is created; changing it later has no effect, so an
  inline `random={seeded(42)}` is fine.
- `paused` is applied only when its value changes, so pausing via the handle or the built-in
  button is not undone by unrelated re-renders. Removing the prop resumes her.
- Callback props always call the latest function without updating or recreating the mascot –
  no need for `useCallback`.

### `usePagegeist(options?) → PagegeistHandle`

The same as a hook, for when you want the handle without a ref.

### `PagegeistHandle`

| Member | Description |
|---|---|
| `say(text, { duration? })`, `pause()`, `resume()`, `respawn()` | Same as on the instance; no-ops before mount. |
| `on(type, listener)` | Subscribes to an [event](#events); returns an unsubscribe function. Unlike `instance.on()`, the subscription survives recreation of the mascot (e.g. when `size` changes) and can be made before mount. |
| `state: PagegeistState \| null` | `null` before mount and during SSR. |
| `paused: boolean` | |
| `instance: PagegeistInstance \| null` | The underlying vanilla instance (`null` before mount). It is replaced when the mascot is recreated – prefer `handle.on()` over `instance.on()`. |

The handle object is stable for the component's lifetime.

## Options

All options are optional. Everything except `container`, `size` and `random` can be changed
at runtime via `update()` or React props – including her wardrobe (`outfit`, `shoes`, `fishnets`).

### General

| Option | Type | Default | Description |
|---|---|---|---|
| `container` | `HTMLElement` | `document.body` | Where the overlay is appended. Not updatable. |
| `size` | `number` | `112` | Standing height in CSS pixels. Physics scale with it, so a small mascot jumps proportionally shorter. Must be finite and > 0, otherwise `112` is used. Not updatable. |
| `zIndex` | `number` | `9999` | z-index of the canvas; the hitbox uses `+1`, the pause control `+2`. Rounded to an integer; non-finite values fall back to `9999`. |
| `spawn` | `'random' \| 'left' \| 'center' \| 'right' \| number` | `'random'` | Horizontal start position; a number is a fraction of the viewport width (0..1). |
| `paused` | `boolean` | `false` | Start paused / pause & resume declaratively. |
| `outfit` | `'classic' \| 'corset'` (`OutfitStyle`) | `'classic'` | Clothing style. `'classic'`: velvet top with bell sleeves, corset and a long layered skirt. `'corset'`: sleeveless corset top with spaghetti straps and front lacing, short ruffled two-layer miniskirt, a thigh band with a red bow and a red drop pendant on the choker. See [The character](character.md#wardrobe). |
| `shoes` | `'boots' \| 'heels'` (`ShoeStyle`) | `'boots'` | Footwear: knee-high stiletto boots or black high-top lace-up platform boots (padded collar above the ankle, silver eyelets and front lacing, round toe on a lug-sole platform, tall chunky block heel). Both share the same foot geometry, so the gait is identical. |
| `fishnets` | `boolean` | `false` | Diamond-mesh fishnet tights. With boots they only show above the shaft. |
| `outline` | `'auto' \| 'always' \| 'never'` | `'auto'` | Light rim around her dark outfit. `'auto'` enables it when the background behind her is dark. (Independent of this option, her ground and wall shadows are only drawn on dark backgrounds.) |
| `outlineColor` | CSS color | `'rgba(220, 205, 255, 0.32)'` | Color of the rim. |
| `debug` | `boolean` | `false` | Draws platforms, safe area, hitbox, her current plan and a trace of her ankle positions (near foot cyan, far foot pink) – planted feet pile up on one spot, so sliding is easy to see. |
| `respawnAfter` | `number` | `1.5` | Seconds off-screen before she falls back into view. Clamped to ≥ 0; non-finite values fall back to `1.5`. |
| `timeScale` | `number` | `1` | Simulation speed multiplier – slow motion for debugging and demos (e.g. `0.25`). Walking, physics, blinking and breathing slow down uniformly; rendering stays at full frame rate. Clamped to 0.05–4. |
| `random` | `() => number` | `Math.random` | Random source in [0, 1) – pass `seeded(42)` for reproducible behavior. Not updatable. |

### `behaviors`

Each flag defaults to `true`. Disabled behaviors are never chosen.

| Flag | What it controls |
|---|---|
| `walk` | Wandering around on the current element. |
| `jump` | Jumping to neighboring elements. |
| `hang` | Hanging from edges, shimmying along them, climbing up; also grab-jumps to high edges. |
| `sit` | Sitting down on elements. |
| `drop` | Dropping off the edge of an element. |
| `drag` | Users can grab, carry and throw her. |
| `poke` | Clicks/taps make her react. |
| `watchCursor` | Her head follows the cursor. |
| `chatter` | She occasionally says something on her own (idle remarks, greeting a lingering cursor). |

### `platforms`

| Key | Type | Default | Description |
|---|---|---|---|
| `selectors` | `readonly string[]` | `['h1','h2','h3','p','button','.card','[data-pagegeist-platform]']` | Elements whose top edges become platforms. Replaces the default list. |
| `ignore` | `readonly string[]` | `[]` | Elements matching or inside these selectors never become platforms. Elements inside `[data-pagegeist-ignore]` are always ignored. |
| `textLines` | `'all' \| 'first' \| 'none'` | `'all'` | Paragraphs are split into text lines: every line, only the first, or one platform spanning the text. Headings always use their text lines. Text platforms are as wide as the rendered text, not the (often full-width) element box. |
| `minWidth` | `number` | `28` | Narrower elements are ignored. |

Invalid selectors are skipped instead of throwing.

### `safeArea`

| Key | Type | Default | Description |
|---|---|---|---|
| `top` | `number \| 'auto'` | `'auto'` | Viewport band at the top she must stay out of. `'auto'` measures fixed/sticky headers. |
| `bottom` | `number \| 'auto'` | `'auto'` | Same for the bottom (cookie banners, bottom navigation). The virtual floor sits above it. |

### `phrases`

Either a `PhraseMap` or a `PhraseResolver` function.

```ts
interface PhraseMap {
  poke?: string[];        // clicked
  grab?: string[];        // picked up
  cursorNear?: string[];  // cursor lingers next to her (needs `chatter`)
  sit?: string[];         // sat down (sometimes)
  idle?: string[];        // unprompted remark (needs `chatter`)
  land?: string[];        // any landing – empty by default
  landOn?: Record<string, string[]>; // landing on an element matching the selector
}

type PhraseResolver = (ctx: { trigger: PhraseTrigger; element: Element | null; state: PagegeistState })
  => string | string[] | null | undefined;
```

- A list replaces the built-in list for that trigger; an empty list silences it.
- A resolver may return a phrase, a list to pick from, `null` (silence) or `undefined` (use the built-in phrases). If it throws, the error is logged and she stays silent.
- Lists are typed `PhraseList` (`readonly string[]`).
- For `land` and `sit`, a `data-pagegeist-say="A|B"` attribute on the element (or an ancestor) wins over both.
- Phrases are drawn with `fillText` – they can never inject markup.

### Accessibility options

| Option | Type | Default | Description |
|---|---|---|---|
| `reducedMotion` | `'static' \| 'calm' \| 'hidden' \| 'ignore'` | `'static'` | Applied while the user has `prefers-reduced-motion: reduce`. Reacts to changes at runtime. See [Accessibility](accessibility.md). |
| `pauseControl` | `boolean \| { position?, pauseLabel?, resumeLabel? }` (`PauseControlOptions`) | `false` | Shows a small pause/resume button. `position`: `'bottom-right'` (default), `'bottom-left'`, `'top-left'`, `'top-right'`. The button's accessible name is the action – `pauseLabel` / `resumeLabel`, default `'Pause mascot'` / `'Resume mascot'` – with no `aria-pressed`; the ❚❚/▶ glyph is hidden from screen readers. Off by default; enable it for WCAG 2.2.2 conformance. |
| `announce` | `boolean` | `false` | Mirrors speech bubbles into a polite `aria-live` region. |
| `markElements` | `boolean` | `false` | Sets `data-pagegeist-occupied` on the element she stands on and `data-pagegeist-landed` (for ~0.25 s) on landing – for your own CSS effects. Off by default so your DOM stays untouched. The `pagegeist:land` DOM event (see [Events](#events)) is dispatched regardless of this option. |

### Callbacks

`onStateChange`, `onLand`, `onPoke`, `onGrab`, `onRelease`, `onSay`, `onPause`, `onResume`
(type `PagegeistCallbacks`) – each receives the event object described below. With
`instance.update()`, passing a callback key replaces it and passing `undefined` removes it.

## Events

| Event | Payload | When |
|---|---|---|
| `stateChange` | `{ from: PagegeistState \| null, to: PagegeistState }` | Every state transition (`from` is `null` initially). |
| `land` | `{ element: Element \| null, impactSpeed: number }` | She landed. `element` is `null` for the virtual floor. |
| `poke` | `{}` | She was clicked/tapped. |
| `grab` | `{}` | A user picked her up. |
| `release` | `{ velocity: Vec2 }` | She was let go: throw velocity `{ x, y }` in px/s. Pausing, `respawn()` or losing pointer capture during a drag also release her, with velocity `{ x: 0, y: 0 }`. |
| `say` | `{ text: string, trigger: PhraseTrigger \| 'api' }` | A speech bubble appeared. |
| `pause` / `resume` | `{}` | Pause state changed (API, prop or pause control). |

Errors thrown by listeners are caught and logged, so they never break the animation loop.

Additionally, a bubbling DOM event `pagegeist:land` (`CustomEvent<{ impactSpeed: number }>`)
is dispatched on the element she lands on – always, independent of `markElements`:

```ts
document.addEventListener('pagegeist:land', (e) => {
  if ((e.target as Element).matches('.cta')) confetti();
});
```

### States

`IDLE`, `WALK`, `JUMP`, `FALL`, `HANG_ON_EDGE`, `CLIMB`, `SIT_ON_ELEMENT`, `GRABBED` –
available as the `PagegeistStates` constant.

## Other exports

From `@d4ndel1on/pagegeist`:

| Export | Description |
|---|---|
| `seeded(seed)` | Small seeded PRNG for the `random` option. |
| `DEFAULT_PHRASES` | The built-in phrases, e.g. to extend instead of replace. Frozen. |
| `DEFAULT_BEHAVIORS`, `DEFAULT_PLATFORMS`, `DEFAULT_SIZE` | Defaults. The objects (and their arrays) are frozen and typed `Readonly` – copy before changing (`[...DEFAULT_PLATFORMS.selectors, '.hero']`). |
| `SAY_ATTRIBUTE` | `'data-pagegeist-say'` |
| `IGNORE_ATTRIBUTE` | `'data-pagegeist-ignore'` |
| `PagegeistStates` | State name constants. |
| Types | `PagegeistOptions`, `PagegeistInstance`, `PagegeistState`, `PagegeistEventMap`, `PagegeistEventName`, `BehaviorOptions`, `PlatformOptions`, `SafeAreaOptions`, `PhraseMap`, `PhraseResolver`, `PhraseTrigger`, `PhraseContext`, `PhraseList`, `PagegeistCallbacks`, `ReducedMotionMode`, `OutlineMode`, `OutfitStyle`, `ShoeStyle`, `PauseControlOptions`, `TextLineMode`, `Vec2` |

From `@d4ndel1on/pagegeist/react`: `Pagegeist`, `usePagegeist`, the types `PagegeistProps` and
`PagegeistHandle`, and all of the types above (re-exported, so one import path is enough).
