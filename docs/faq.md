# FAQ & troubleshooting

### She doesn't show up

- Is something covering her? The overlay uses `z-index: 9999` by default – raise `zIndex` if your header or modals are higher. Top-layer content (`<dialog>` via `showModal()`, popovers, fullscreen) is always above her; see [Stacking](guide.md#stacking).
- Did you pass a `container` inside a transformed or `isolation: isolate` element? See [Stacking](guide.md#stacking).
- Is `prefers-reduced-motion` enabled with `reducedMotion: 'hidden'`?
- Are there any platforms? Turn on `debug` to see what she can walk on. Without matching elements she stands on the bottom edge of the viewport.
- In vanilla JS: `createPagegeist()` must run after `document.body` exists.
- Check the console: `createPagegeist()` throws `pagegeist: …` in browsers without `ResizeObserver`/`MutationObserver` (see [Browser support](#which-browsers-are-supported)).

### She stands somewhere weird

Turn on `debug`: colored lines are platforms, red dashed lines are the safe area. Exclude
elements with `platforms.ignore` or `data-pagegeist-ignore`, or restrict `platforms.selectors`.

### Her head disappears under my sticky header

`safeArea.top: 'auto'` detects headers that are `position: fixed` or `sticky` and touch the
top edge. If your header is built differently (e.g. a transformed element), set the height
explicitly: `safeArea={{ top: 72 }}`.

### Clicking her selects text / is hard to hit

While she moves, mouse and pen clicks up to ~22 px (scaled with `size`) next to her still
grab her and no selection starts. Touch has to hit her directly, so taps next to her are never
hijacked. If she is too small for touch users, increase `size`.

### She blocks a button I need

The hitbox only covers her body. If she sits on an important control, exclude it:
`platforms={{ ignore: ['.checkout-button'] }}`.

### Performance

- One canvas, one `requestAnimationFrame` loop. While paused the loop sleeps and only wakes up to redraw (scroll, resize, `say()`, `update()`, `respawn()`, `resume()`); in hidden tabs it stops completely.
- Layout is read once per frame at most, and only when something changed. Scrolling does not rescan the page – only fixed/sticky elements and the safe area are re-measured.
- Platforms are scanned in a band of ±2 viewport heights; text lines far from the viewport are skipped before measuring. Very long, dense pages still cost more per rescan; use `textLines: 'first'` or narrower `selectors`.
- The fallback poll pauses in background tabs and slows to ~2.4 s while nothing changes; text-only DOM mutations (clocks, counters) rescan at most every 500 ms.
- The canvas backing store is capped at 2× device pixel ratio – on 3× screens she is rendered at 2× and scaled, which is barely visible but saves memory and fill time.

### Do the source maps make my bundle bigger?

No. The package ships `dist/*.js.map` (with the original TypeScript embedded) so you can
debug into pagegeist, but bundlers never copy a dependency's maps into your production output:
a Vite 8 and an esbuild production build of a test app were byte-identical with and without
the maps in the package (~71.7 kB minified JS, no `.map` files emitted). They
are only used when *you* enable source maps: esbuild then resolves stack frames to
`node_modules/@d4ndel1on/pagegeist/src/*.ts`, while Vite 8 keeps mapping to the bundled
`dist/*.js` (it does not read dependency maps). The only cost is install size on developer
machines and CI: ~90 kB more in the tarball and ~318 kB more unpacked.

### Content Security Policy

No `eval`, no inline `<script>`, no `<style>` injection. Styles are set via the CSSOM
(`element.style.x = …`), which CSP allows without `'unsafe-inline'`.

### Which browsers are supported?

Evergreen browsers: Chrome/Edge 86+, Firefox 79+, Safari 14+ (iOS 14+). The bundle targets
ES2022 and needs `ResizeObserver`, `MutationObserver` and Pointer Events. `checkVisibility()`
and `roundRect()` are optional (fallbacks exist). Internet Explorer and legacy Edge are not supported.

### Why is there no shadow under her on my light page?

On purpose: shadows are only drawn on dark backgrounds, where they add depth. On light
backgrounds the dark blobs looked unnatural, so they are left out (the same background check
drives `outline: 'auto'`).

### Will updates break my page?

While the version is 0.x, minor releases may contain breaking changes (always listed in the
[changelog](../CHANGELOG.md)); patch releases do not. Pin `~0.x.y` or an exact version. From
1.0 on, breaking changes only come with major versions.

### Does it work with Next.js / Remix / Astro?

Next.js App Router: yes, see the README. Remix/React Router: render `<Pagegeist />` in your
root component. Astro: use the React integration with `client:only="react"`, or call
`createPagegeist()` in a client-side `<script>`.

### Shadow DOM / iframes

Elements inside shadow roots and iframes are not detected as platforms.

### Can I use my own character?

Not yet – see [The character](character.md#other-characters).

### She talks too much

`behaviors={{ chatter: false }}` stops unprompted remarks; `phrases={{ poke: [] }}` etc. silences single triggers.
