# Usage guide

## Pick a sister

Two characters share the same moves and options; pick the one that fits the tone of your site.

| | `goth` (default) | `sunny` |
|---|---|---|
| Look | black velvet, lace and boots | the same dress, bleached ghostly white |
| Mood | bratty, bossy, wants you gone | bubbly, friendly, wants your attention |
| Cursor | watches it, keeps her distance | spots it from afar and hurries over |
| Fits | dark, edgy, playful-mean sites, portfolios, Halloween | light, friendly sites, products, docs, anything cute |
| Import | nothing extra | `import { sunny } from '@d4ndel1on/pagegeist/sunny'` |
| Option | – | `character={sunny}` / `{ character: sunny }` |

Speech bubbles, the pause button, the `'auto'` outline and the built-in phrases follow the
character; your own `phrases` replace hers per trigger as usual. See
[The character](character.md#her-little-sister-sunny).

## How she works

Pagegeist adds one element to your page: a `div.pagegeist` overlay containing

- a **fullscreen canvas** with `pointer-events: none` – she is drawn here, clicks pass through,
- a small **hitbox** that follows her – the only element that receives pointer events,
- optionally a **pause button** and a visually hidden **live region**.

Every frame she first *reads* the layout, then simulates, then *writes* (canvas + hitbox
position). Reads and writes are never interleaved, so she does not cause layout thrashing.

### Platforms

The top edges of matching elements become **one-way platforms**: she lands on them from
above and jumps through them from below. For headings and paragraphs she walks on the
rendered text itself – each line is its own platform, exactly as wide as its text – so she
never sits in the empty space next to a short heading.
The bottom of the viewport acts as a floor.

Platforms are rescanned when the layout can have changed – resize, DOM mutations (throttled
to ~7×/s, React apps mutate a lot; text-only changes such as clocks or counters at most every
500 ms), web fonts loading – plus a slow fallback poll for CSS animations (every 0.8 s,
backing off to ~2.4 s while nothing changes, paused in background tabs). A scan covers a
band of ±2 viewport heights around the visible area. **Scrolling does not rescan**: normal-flow
elements do not move relative to the page, so only fixed/sticky elements and the safe area
are re-measured; a full rescan happens once the viewport leaves the scanned band.

Choose what she walks on:

```tsx
<Pagegeist
  platforms={{
    selectors: ['h1', 'h2', '.card', 'button'], // replaces the default list
    ignore: ['footer', '[role="dialog"]'],      // never walk on these (or anything inside)
    textLines: 'first',                         // only the first line of each paragraph
  }}
/>
```

Or in markup: `data-pagegeist-platform` makes any element a platform,
`data-pagegeist-ignore` excludes an element and everything inside it.

### Safe area

With `safeArea: { top: 'auto' }` (the default) she measures fixed/sticky bars glued to the
top of the viewport and never lands where her head would disappear under your navigation.
If you scroll so that her element slides under the header, she hops down. The same applies
to bottom bars (`safeArea.bottom`). Pass numbers to set the bands explicitly.

### What she does

While idle she picks the next activity by weighted chance: wander, jump to a neighbor
(buttons and headings are her favorites), sit down, lower herself over an edge and hang,
shimmy along the edge, climb back up, or drop down. Disable anything via `behaviors`.

Users can click her (`poke`) and drag & throw her (`drag`). While she is moving, a mouse or
pen click slightly next to her still grabs her instead of starting a text selection (touch
has to hit her, so taps next to her reach your page). Pausing, `respawn()` or losing pointer
capture during a drag lets her go (`release` with zero velocity).

### Light and dark pages

Twice per second she checks the background color behind her. On dark backgrounds she gets a
light rim (`outline: 'auto'`) and casts a soft ground shadow (and a wall shadow while hanging
or climbing). On light backgrounds the rim and both shadows are left out – dark shadow blobs
look unnatural there.

## Phrases

*"You want to put words in my mouth? Fine. Short ones."*

```tsx
<Pagegeist
  phrases={{
    poke: ['Hey.', 'Rude.'],                 // replaces the built-in poke list
    idle: [],                                 // never talk unprompted
    landOn: { '.pricing .pro': ['Fancy.'] },  // landing on specific elements
  }}
/>
```

For i18n, pass a function – return `undefined` to fall back to the built-in phrases:

```tsx
<Pagegeist phrases={({ trigger }) => t(`mascot.${trigger}`, { returnObjects: true })} />
```

See [Recipes](recipes.md#i18n) for a complete example, and [The character](character.md#attitude)
for the built-in phrases and tips on writing your own in her voice.

## Events and the imperative API

```tsx
const ref = useRef<PagegeistHandle>(null);

<Pagegeist
  ref={ref}
  onLand={({ element }) => element?.classList.add('was-visited')}
  onStateChange={({ to }) => setActivity(to)}
/>;

ref.current?.say('Saved.');
ref.current?.pause();
```

Vanilla:

```ts
const pagegeist = createPagegeist();
const off = pagegeist.on('poke', () => analytics.track('mascot_poked'));
```

## Updating options

In React, just change props – they are declarative: removing a prop restores its default.
Everything except `container` and `size` is applied in place; those two recreate her (she
falls in again). `random` is only read on creation. See [React semantics](api.md#react).

Vanilla: `pagegeist.update({ behaviors: { hang: false } })` **merges** – only the given keys
change, everything else keeps its current value (pass a default explicitly to reset it).

Invalid numbers never break her: a non-positive or non-finite `size` falls back to 112,
`zIndex` is rounded (non-finite → 9999), `respawnAfter` is clamped to ≥ 0 (non-finite → 1.5).

## React specifics

- **StrictMode**: the double mount/unmount in development creates and destroys her cleanly; you will only ever see one.
- **SSR / Next.js**: `@d4ndel1on/pagegeist/react` carries `"use client"`; on the server `<Pagegeist />` renders nothing and touches no browser APIs. The vanilla entry is safe to import on the server, but `createPagegeist()` must run in the browser.
- **Placement**: render her once, high in the tree (root layout). She is not part of your layout – where the component sits in JSX does not matter.
- **Declarative props**: removing a prop restores its default; `paused` is only applied when its value changes (so the pause button or `handle.pause()` survive re-renders), and removing it resumes; callbacks always call the latest prop.
- **`container`**: must be a stable element. `ref.current` is `null` during the first render, so use state + a callback ref:

  ```tsx
  const [host, setHost] = useState<HTMLElement | null>(null);
  <div ref={setHost} />
  {host && <Pagegeist container={host} />}
  ```
- **Events that survive recreation**: `handle.on('land', …)` stays subscribed when `size` or `container` recreate the mascot; `handle.instance.on(…)` does not.

## Touch and mobile

- Tap her to poke, press and drag to carry and throw. Touch input must hit her body; the forgiving near-miss grab is for mouse and pen only, so taps next to her always reach your page.
- The canvas is sized in pixels from `innerWidth`/`innerHeight`, so collapsing mobile URL bars do not distort her, and it follows `devicePixelRatio` changes (browser zoom, moving to another screen). The backing store is capped at 2× DPR to bound memory and fill cost.
- On small screens consider a smaller `size`, and `safeArea.bottom` for bottom navigation bars (`'auto'` detects fixed/sticky ones).

## Stacking

The overlay is a fixed element appended to `document.body` (or `container`) with
`z-index: 9999` by default.

- **Modals in the top layer** (`<dialog>` opened with `showModal()`, the Popover API, fullscreen) always render above any z-index, so she is hidden behind them. That is usually what you want; there is no way to put her above the top layer.
- **Transformed ancestors**: `position: fixed` is relative to the nearest ancestor with `transform`, `filter`, `perspective`, `contain` or `will-change: transform`. If you pass a `container` inside such an element, the overlay is positioned relative to it, not the viewport – keep `container` outside transformed elements (the default `document.body` is safe).
- **Stacking contexts**: a `container` inside an element that creates its own stacking context (e.g. `isolation: isolate`, `opacity < 1`, a z-indexed positioned parent) limits her to that context, whatever `zIndex` you set.

## Multiple instances

Each `createPagegeist()` / `<Pagegeist />` is independent. Two mascots work, but they do not
know about each other. Use different `zIndex` values if their stacking matters.

## Cleanup guarantees

`destroy()` (or unmounting the component) cancels the animation frame, removes all
listeners and observers, restores `user-select` if a drag was in progress, removes any
`data-pagegeist-*` attributes she set and removes the overlay.
