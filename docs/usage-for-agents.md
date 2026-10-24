# Usage for agents

Everything needed to add pagegeist to a project correctly, in one file – written for AI coding
agents, useful for humans in a hurry. This file ships in the npm package
(`node_modules/@d4ndel1on/pagegeist/docs/usage-for-agents.md`), next to the other docs.

## What it is

An animated mascot overlay for web pages: a small gothic poltergeist drawn on a fullscreen
canvas that walks on the page's real headings, text lines, buttons and cards. It is purely
decorative – `aria-hidden`, never focusable, clicks pass through everywhere except her body –
and it does not change the page's DOM unless asked to (`markElements`).

- **Use it for**: easter eggs, personality on portfolios, landing pages, docs sites, side
  projects, Halloween themes.
- **Not for**: conveying information (speech bubbles are canvas-only unless `announce` is set),
  content inside iframes or shadow DOM (not detected as platforms).
- Zero runtime dependencies. React 18.2+/19 is an optional peer dependency, only for the
  `/react` entry. Evergreen browsers (Chrome/Edge 86+, Firefox 79+, Safari 14+).

## Install

```sh
npm install @d4ndel1on/pagegeist
```

## Pick the entry point

| Project | Import | API |
|---|---|---|
| React, Next.js, Remix, React Router | `@d4ndel1on/pagegeist/react` | `<Pagegeist />` component (or `usePagegeist()`) |
| Anything else (vanilla, Vite, Vue, Svelte, Angular, Astro script) | `@d4ndel1on/pagegeist` | `createPagegeist(options)` → instance with `destroy()` |

Both entries are ESM-only and fully typed. Every option is optional; the defaults are good.

## Copy-paste setups

All snippets below are type-checked in CI (`examples/` in the repository).

### React

Render the component **once**, high in the tree. Where it sits in JSX does not matter – the
mascot lives in a fixed overlay on `document.body`.

<!-- snippet: examples/react.tsx -->
```tsx
import { Pagegeist } from '@d4ndel1on/pagegeist/react';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Pagegeist pauseControl />
    </>
  );
}
```

### Next.js (App Router)

The React entry carries `"use client"` and renders nothing on the server, so it can be used
directly in a server component layout. **Do not** wrap it in `dynamic(..., { ssr: false })`
and do not add `"use client"` to the layout for it.

<!-- snippet: examples/next-app-layout.tsx -->
```tsx
// app/layout.tsx
import { Pagegeist } from '@d4ndel1on/pagegeist/react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Pagegeist pauseControl />
      </body>
    </html>
  );
}
```

Functions (`onLand`, `phrases` as a resolver, …) cannot be passed from a server component.
When you need them, wrap the component in your own client component and render that from the
layout instead:

<!-- snippet: examples/next-client-wrapper.tsx -->
```tsx
// app/haunt.tsx – a client component, so callback props are allowed
'use client';

import { Pagegeist } from '@d4ndel1on/pagegeist/react';

export function Haunt() {
  return <Pagegeist pauseControl onLand={({ element }) => console.log('landed on', element)} />;
}
```

Next.js Pages Router: render `<Pagegeist />` in `pages/_app.tsx`.

### Vite (no framework)

<!-- snippet: examples/vite-main.ts -->
```ts
// src/main.ts – module scripts run after the document is parsed, so document.body exists
import { createPagegeist } from '@d4ndel1on/pagegeist';

const pagegeist = createPagegeist({ pauseControl: true });

// Hot module replacement re-runs this module: remove the old mascot first.
import.meta.hot?.dispose(() => pagegeist.destroy());
```

### Vanilla JS

<!-- snippet: examples/vanilla.ts -->
```ts
import { createPagegeist } from '@d4ndel1on/pagegeist';

const pagegeist = createPagegeist({ pauseControl: true });
pagegeist.say('Oh. You again.');
// later: pagegeist.destroy();
```

Without a bundler, import a pinned version from a CDN inside `<script type="module">`:
`import { createPagegeist } from 'https://esm.sh/@d4ndel1on/pagegeist@0.1.3';`

### Vanilla core inside React

Only when you specifically need the vanilla instance – otherwise use `<Pagegeist />`:

<!-- snippet: examples/react-effect.tsx -->
```tsx
// Only when you need the vanilla instance in React – prefer <Pagegeist /> otherwise.
import { createPagegeist } from '@d4ndel1on/pagegeist';
import { useEffect } from 'react';

export function Haunted() {
  useEffect(() => {
    const pagegeist = createPagegeist({ pauseControl: true });
    return () => pagegeist.destroy(); // StrictMode mounts twice in development – this keeps one
  }, []);
  return null;
}
```

### Other frameworks

- **Vue / Svelte / Angular**: call `createPagegeist()` in the mount hook (`onMounted`,
  `onMount`, `ngAfterViewInit`) and `destroy()` in the unmount hook (`onUnmounted`, the
  function returned from `onMount`, `ngOnDestroy`).
- **Astro**: use the React integration with `client:only="react"`, or call `createPagegeist()`
  in a client-side `<script>`.
- **Remix / React Router**: render `<Pagegeist />` in the root component.

## Rules for a correct integration

1. **One mascot, mounted once.** Render `<Pagegeist />` once in the root layout, or call
   `createPagegeist()` once at app start. Do not combine the component with a manual
   `createPagegeist()` call, and do not mount it per page or per route.
2. **`createPagegeist()` runs in the browser only.** Importing either entry is SSR-safe;
   calling `createPagegeist()` needs `document`, `ResizeObserver` and `MutationObserver` and
   throws a `pagegeist: …` error otherwise. Call it in a `useEffect`/mount hook or a module
   script – never at module top level of server-rendered code. It also needs `document.body`
   to exist (classic `<script>` tags in `<head>` run too early – use `type="module"` or
   `defer`).
3. **Always clean up the vanilla instance.** Every `createPagegeist()` needs a matching
   `destroy()` when its owner goes away (effect cleanup, unmount hook, Vite HMR `dispose`).
   `destroy()` removes all DOM nodes, listeners and observers and is idempotent. The React
   component cleans up by itself.
4. **React StrictMode is fine.** The development double mount creates and destroys her
   cleanly; only one mascot is ever visible.
5. **Updating options differs by API.**
   - React props are **declarative**: change props to change her; removing a prop restores its
     default. Inline objects (`behaviors={{ hang: false }}`) are fine – they are compared by
     value. Callback props always call the latest function; no `useCallback` needed.
   - `instance.update(options)` **merges**: only the given keys change, nested objects
     (`behaviors`, `platforms`, `safeArea`) merge per key, omitted keys keep their current
     value. To reset something, pass its default explicitly.
   - `container`, `size` and `random` cannot be changed with `update()`. In React, changing
     `container` or `size` recreates the mascot; `random` is read only on creation.
   - `paused` in React is applied only when its value changes, so the built-in pause button
     and `handle.pause()` survive re-renders.
6. **`container` must be a stable element.** The default `document.body` is right for almost
   every case. If you pass one in React, keep it in state via a callback ref – `ref.current`
   is `null` during the first render:
   `const [host, setHost] = useState<HTMLElement | null>(null)` → `<div ref={setHost} />` →
   `{host && <Pagegeist container={host} />}`.
7. **Accessibility.** Pass `pauseControl` (shown in every snippet above) unless the site has
   its own pause control wired to the `paused` prop or `pause()`/`resume()` – moving content
   needs a way to stop it for WCAG 2.2.2. Keep the default `reducedMotion: 'static'`; never set
   `'ignore'` unless motion is essential. Set `announce` only if her phrases carry meaning.
8. **Stacking.** The overlay is `position: fixed` with `z-index: 9999` (hitbox `+1`, pause
   button `+2`). Raise `zIndex` if site headers or modals are higher. Top-layer content
   (`<dialog>` via `showModal()`, popovers, fullscreen) is always above her – intended. Never
   pass a `container` inside an element with `transform`, `filter`, `contain`, `isolation:
   isolate` or `opacity < 1`; that traps her in its coordinate system or stacking context.
9. **Keep her off important controls** with `platforms: { ignore: ['.checkout'] }` or the
   `data-pagegeist-ignore` attribute (excludes the element and everything inside). Make any
   element a platform with `data-pagegeist-platform`; give it a line with
   `data-pagegeist-say="Line one|Line two"`.
10. **Tests.** In happy-dom/jsdom she mounts without drawing. jsdom lacks `ResizeObserver` –
    stub it (`globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }`).
    Use `random: seeded(42)` for deterministic behavior. To keep her out of end-to-end tests,
    don't render her when `navigator.webdriver` is true.
11. **CSP.** No `eval`, no inline scripts, no injected `<style>` – no CSP changes needed.
12. **Versions.** While the package is 0.x, minor releases may break; pin `~0.1.0` (or an exact
    version) and read the changelog before bumping the minor.

## Common customizations

```tsx
<Pagegeist
  pauseControl
  size={96}                                      // standing height in px (default 112)
  outfit="corset"                                // 'classic' (default) | 'corset'
  shoes="heels"                                  // 'boots' (default) | 'heels'
  fishnets
  behaviors={{ chatter: false, drag: false }}   // each behavior defaults to true
  platforms={{ ignore: ['footer', '[role="dialog"]'] }}
  phrases={{ poke: ['Hey.', 'Rude.'], landOn: { '.buy-button': ['Click it. I dare you.'] } }}
  onLand={({ element }) => console.log(element)} // client components only
/>
```

The same keys work as `createPagegeist({ … })` options. For i18n, pass `phrases` as a
function: ``({ trigger }) => t(`mascot.${trigger}`)`` – return `undefined` to fall back to the
built-in phrases, `null` for silence.

## Verify the integration

- She falls into view right after mounting and lands on a heading, paragraph or button
  (with reduced motion she appears directly on an element and stays put).
- `debug: true` draws the detected platforms (colored lines), the safe area under sticky
  headers (red dashed) and her hitbox. Without any matching elements she stands on the bottom
  edge of the viewport.
- Nothing visible? Check the console for `pagegeist: …`, a higher z-index covering her, or
  `prefers-reduced-motion` combined with `reducedMotion: 'hidden'`.

## Further reading

- [API reference](api.md) – every option with type and default, events, methods, exports
- [Usage guide](guide.md) – platforms, safe area, phrases, React semantics, stacking, cleanup
- [Recipes](recipes.md) – i18n, CTA reactions, quiet mode, remembering the pause choice
- [Accessibility](accessibility.md) · [FAQ & troubleshooting](faq.md) · [The character](character.md)
