# @d4ndel1on/pagegeist

## 0.1.3

### Patch Changes

- 1c4442a: Docs for AI coding agents and humans in a hurry: the npm package now ships `docs/*.md`, including the new `docs/usage-for-agents.md` (copy-paste setups for vanilla, React, Next.js App Router and Vite, plus the rules for a correct integration). The type declarations gained descriptions, `@defaultValue` and `@example` tags for every public option, and `update()` documents its merge semantics.

## 0.1.2

### Patch Changes

- 2c872fb: Leaner internals: removed dead code and merged duplicated helpers (bubble timing, size validation, drawing helpers). No behavior or visual changes – every frame is drawn exactly as before – and the bundle is slightly smaller.

## 0.1.1

### Patch Changes

- 2617670: More attitude: new built-in phrases for `poke`, `grab`, `cursorNear`, `sit` and `idle` (for example "Throne acquired.", "Did I say you could come closer?", "Careful. I am vintage."). The existing phrases are unchanged and still come first. The package `homepage` now points to the live demo at https://d4ndel1on.github.io/pagegeist/.

## 0.1.0

### Minor Changes

- ed08601: Initial release: a bratty gothic poltergeist that haunts your web page – she lives here now, you're just visiting. She walks on your headings, sits on your buttons, hangs from edges, shimmies along lines of text and climbs up – using your real DOM as her level. Zero runtime dependencies, drawn procedurally on a canvas (no image assets).
  
  **Core (`@d4ndel1on/pagegeist`)**
  
  - `createPagegeist(options)` returns an instance with `say`, `pause`, `resume`, `respawn`, `update`, `on`, `destroy`, `state` and `paused`. `update()` merges the given keys into the current options.
  - Platforms from your DOM: headings, paragraphs (one platform per rendered text line), buttons, `.card` and `[data-pagegeist-platform]`; configurable via `platforms` (`selectors`, `ignore`, `textLines`, `minWidth`) and `data-pagegeist-ignore`. A safe area keeps her head out from under fixed/sticky headers and bottom bars.
  - Behaviors (walk, jump, hang/shimmy/climb, sit, drop, drag & throw, poke, cursor watching, chatter), each switchable via `behaviors`.
  - Natural motion: a high-heel walk with heel strike and heel rocker, a calm upper body, smooth blends between states, acceleration, braking and turning, and secondary motion for hair and skirt.
  - Built-in phrases in her voice: bratty, bossy and easily annoyed ("Put. Me. Down.", "Personal space.").
  - Phrases per trigger, per element (`landOn`, `data-pagegeist-say`) or via a resolver function for i18n. Phrases are always rendered as plain text. A resolver that throws is logged and treated as silence.
  - Events `stateChange`, `land`, `poke`, `grab`, `release`, `say`, `pause`, `resume` (as `on()` listeners or `on…` callbacks) plus the bubbling DOM event `pagegeist:land`.
  - Options for size (default 112 px), z-index, spawn position, outline (`auto` rim on dark backgrounds), time scale, debug overlay and seeded randomness (`seeded()`).
  - Hands with a palm, fingers and a thumb that follow the pose: relaxed while standing or walking, hooked over the edge while hanging or climbing, spread while grabbed or falling, flat while sitting.
  - 2.5D touches: a ground shadow and a wall shadow while hanging/climbing. The shadows are drawn only on dark backgrounds (the same twice-per-second background check as `outline: 'auto'`, independent of `outline`); on light pages they are left out.
  - She leaves no footprints (on light or dark pages). There is no `footprints` option: in plain JavaScript an unknown `footprints` key is ignored, in TypeScript it is a type error.
  - Invalid values are sanitized: `size` falls back to 112, `zIndex` is rounded (non-finite → 9999), `respawnAfter` is clamped to ≥ 0 (non-finite → 1.5).
  - `DEFAULT_PHRASES`, `DEFAULT_BEHAVIORS` and `DEFAULT_PLATFORMS` are frozen – copy them before changing. Exported types include `Vec2`, `OutfitStyle`, `ShoeStyle`, `PhraseList` and `PagegeistCallbacks`.
  
  **Wardrobe** (all switchable at runtime)
  
  - `outfit: 'classic' | 'corset'` – velvet top with bell sleeves and a long layered skirt, or a sleeveless corset top with a ruffled miniskirt, thigh band and red pendant.
  - `shoes: 'boots' | 'heels'` – knee-high stiletto boots, or (`'heels'`) black high-top lace-up platform boots: a shaft well above the ankle with a padded collar, silver eyelets and front lacing, a round toe on a lug-sole platform, and a tall chunky block heel joined by a concave arch – drawn as one clean silhouette. Both share the same foot geometry, so the walk is unchanged.
  - `fishnets: boolean` – diamond-mesh fishnet tights.
  
  **Accessibility**
  
  - `prefers-reduced-motion` is honored and watched at runtime, with four modes: `static` (default – she stands still, without idle micro-motion), `calm`, `hidden`, `ignore`.
  - Optional `pauseControl` button (off by default – enable it for WCAG 2.2.2 conformance): keyboard accessible, its accessible name is the action (`pauseLabel`/`resumeLabel`).
  - Optional `announce` live region for speech bubbles; canvas and hitbox are `aria-hidden`, nothing enters the tab order, and your DOM is untouched unless you opt in with `markElements`.
  - Grabbing her never leaves a stray text selection. Touch input has to hit her; the forgiving near-miss grab applies to mouse and pen only. Pausing, `respawn()` or losing pointer capture during a drag releases her.
  
  **Performance**
  
  - One canvas and one `requestAnimationFrame` loop; layout is read at most once per frame, and reads and writes are never interleaved.
  - Scrolling does not rescan the page: only fixed/sticky elements and the safe area are re-measured. Platforms are scanned in a ±2 viewport band and rescanned once the viewport leaves it.
  - DOM mutations are throttled (text-only changes at most every 500 ms); the fallback poll pauses in background tabs and backs off while nothing changes.
  - Rendering is batched: the skirt lace pattern is drawn in a single stroke, cutting canvas draw calls per frame by roughly 60% (classic outfit: ~270 → ~98).
  - The loop sleeps while paused and stops in hidden tabs. The canvas follows `devicePixelRatio` changes (capped at 2) and is sized in pixels, so mobile URL bars do not distort it.
  
  **React (`@d4ndel1on/pagegeist/react`)**
  
  - `<Pagegeist />`, `usePagegeist()` and an imperative `PagegeistHandle`; marked `"use client"`, renders nothing on the server, StrictMode-safe.
  - Declarative props: removing a prop restores its default. `container` and `size` recreate the mascot, `random` is read only on creation, `paused` is applied only when its value changes, callbacks always call the latest prop, and `update()` is skipped when nothing changed.
  - `handle.on(type, listener)` subscriptions survive recreation of the mascot.
  - The React entry re-exports all public types.
  
  **Robustness**
  
  - `createPagegeist()` throws a descriptive `pagegeist: …` error without `document`, `ResizeObserver` or `MutationObserver`, and rolls back everything it created when setup fails. `destroy()` removes all nodes, listeners, observers and attributes and is idempotent.
  - Source maps ship with `sourcesContent` and are only read when you enable source maps; they never end up in production bundles.
  - No `eval`, no inline scripts, no injected `<style>` elements (CSP-friendly). The speech bubble works without `CanvasRenderingContext2D.roundRect`.

All notable changes to this project are documented here, generated by
[Changesets](https://github.com/changesets/changesets).
