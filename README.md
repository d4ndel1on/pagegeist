# pagegeist

[![npm](https://img.shields.io/npm/v/@d4ndel1on/pagegeist)](https://www.npmjs.com/package/@d4ndel1on/pagegeist)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@d4ndel1on/pagegeist)](https://bundlephobia.com/package/@d4ndel1on/pagegeist)
[![license](https://img.shields.io/badge/license-MIT%20%2B%20CC0%20artwork-blue)](#license)
[![CI](https://github.com/d4ndel1on/pagegeist/actions/workflows/ci.yml/badge.svg)](https://github.com/d4ndel1on/pagegeist/actions/workflows/ci.yml)

***She lives here now. You're just visiting.***

**A tiny, bratty gothic poltergeist that moves into your web page.** She walks on your
headings, sits on your buttons, dangles from edges and shimmies along your lines of text –
your real DOM is her level, and she acts like she pays rent. Poke her, drag her, throw her:
she will complain. Your page stays fully usable.

Too grumpy for your site? Her **little sister `sunny`** wears the same dress, bleached
ghostly white, and has the opposite problem: she *wants* your attention.

Great as an easter egg, or to give a portfolio, landing page, docs site or side project some
personality. Vanilla JS core with zero dependencies, plus a React adapter (Next.js ready).

```sh
npm install @d4ndel1on/pagegeist
```

<!-- snippet: examples/minimal.ts -->
```ts
import { createPagegeist } from '@d4ndel1on/pagegeist';

createPagegeist({ pauseControl: true }); // React: <Pagegeist pauseControl /> from '@d4ndel1on/pagegeist/react'
```

**[Live demo](https://d4ndel1on.github.io/pagegeist/)** · [Quick start](#quick-start) ·
Using an AI coding agent? Point it at [docs/usage-for-agents.md](docs/usage-for-agents.md)
(also shipped in the npm package) or [llms.txt](https://d4ndel1on.github.io/pagegeist/llms.txt).

## Meet the sisters

| ☾ `goth` – the default | ☀ `sunny` – her little sister |
|---|---|
| ![goth: Pagegeist in black, sitting on the edge of a card on a dark page](docs/assets/screenshot.jpg) | ![sunny: her little sister in white, sitting on a heading on a light page](docs/assets/screenshot-sunny.jpg) |
| Black velvet, bratty, bossy. Thinks your page is hers. *"She lives here now. You're just visiting."* | Same dress, bleached white. Bubbly, friendly, chases your cursor. *"She lives here too. Come play!"* |
| [![Try goth](https://img.shields.io/badge/%E2%96%B6%20try-goth-a678e6?style=for-the-badge)](https://d4ndel1on.github.io/pagegeist/) | [![Try sunny](https://img.shields.io/badge/%E2%96%B6%20try-sunny-3f6fc0?style=for-the-badge)](https://d4ndel1on.github.io/pagegeist/?character=sunny) |
| Default – nothing to configure. | One import – [invite her](#invite-her-little-sister). |

They have opinions about each other: *"White is not a color. Tell my sister."* –
*"Goth is a phase. Hers lasted 300 years."*

## Why let her haunt your page

- **Your page is the level** – headings, text lines, buttons and cards become platforms; fixed and sticky headers are avoided automatically.
- **Zero runtime dependencies, no image assets** – every frame is drawn procedurally on a Canvas 2D, in ~24 kB min+brotli. CI enforces the size budget, so she can't put on weight.
- **React adapter included** – `<Pagegeist />`, `usePagegeist()` and an imperative ref; StrictMode-safe, SSR-safe and marked `"use client"` (Next.js App Router ready). The vanilla core works anywhere.
- **Reduced motion done properly** – `prefers-reduced-motion` is watched at runtime, with four modes (`static`, `calm`, `hidden`, `ignore`).
- **CSP-safe** – no `eval`, no inline scripts, no injected `<style>`; phrases are always rendered as plain text.
- **Light on the page** – no rescans while scrolling; the loop sleeps while paused and stops in background tabs.
- **Supply chain** – published from CI with npm provenance; SHA-pinned GitHub Actions.
- **Yours to style** – two sisters, two outfits, two pairs of boots, optional fishnets, your own phrases (i18n included), behaviors and events.

*"Reduced motion? I'll sit still. Happy now?"* – *"Sitting still! See? Sitting!"*

## Install

*"Ugh. Fine. Install me."* – *"Yay! Install me too!"*

```sh
npm install @d4ndel1on/pagegeist
```

React 18.2+ or 19 is an optional peer dependency – only needed for the `/react` entry.

Without a bundler, pin an exact version from a CDN:

```html
<script type="module">
  import { createPagegeist } from 'https://esm.sh/@d4ndel1on/pagegeist@0.2.0';
  createPagegeist();
</script>
```

## Quick start

Try it without installing anything – each starter is a complete app, tested in CI against the
package:

[![React starter on StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/d4ndel1on/pagegeist/tree/main/examples/starters/react?file=src/Layout.tsx) React + Vite ·
[![Vite starter on StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/d4ndel1on/pagegeist/tree/main/examples/starters/vite?file=src/main.ts) Vanilla + Vite ·
[Next.js App Router starter](https://github.com/d4ndel1on/pagegeist/tree/main/examples/starters/next) (runs locally;
current Next.js versions [do not run on StackBlitz](https://github.com/stackblitz/webcontainer-core/issues/1978))

### React

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

The React entry is marked `"use client"`, so you can render it straight from a server
component layout – no `dynamic(..., { ssr: false })` needed. On the server it renders nothing.

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

> Callback props (`onLand`, `phrases` as a function, …) cannot be passed from a server
> component. Wrap `<Pagegeist />` in your own client component when you need them – see
> [Usage for agents](docs/usage-for-agents.md#nextjs-app-router).

### Vanilla JS

<!-- snippet: examples/vanilla.ts -->
```ts
import { createPagegeist } from '@d4ndel1on/pagegeist';

const pagegeist = createPagegeist({ pauseControl: true });
pagegeist.say('Oh. You again.');
// later: pagegeist.destroy();
```

## Invite her little sister

*"Same dress. Opposite ghost."*

`sunny` lives in her own entry, so the default bundle doesn't grow. Same moves and options,
light speech bubbles, her own phrases – and she spots your cursor from across the page and
hurries over:

<!-- snippet: examples/sunny.tsx -->
```tsx
import { Pagegeist } from '@d4ndel1on/pagegeist/react';
import { sunny } from '@d4ndel1on/pagegeist/sunny';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Pagegeist character={sunny} pauseControl />
    </>
  );
}
```

Vanilla: `createPagegeist({ character: sunny })`. Not sure which sister fits your site?
[Pick a sister](docs/guide.md#pick-a-sister).

## Make her yours

```tsx
const ref = useRef<PagegeistHandle>(null);

<Pagegeist
  ref={ref}
  size={140}
  outfit="corset"
  shoes="heels"
  fishnets
  phrases={{
    poke: ['Hey.', 'Rude.'],
    landOn: { '.buy-button': ['Click it. I dare you.'] },
  }}
  behaviors={{ hang: false, drag: false }}
  platforms={{ ignore: ['footer', '.modal'] }}
  pauseControl
  onLand={({ element }) => console.log('landed on', element)}
/>;

ref.current?.say('Took you long enough.');
```

Or right in your markup – `data-pagegeist-say` is what she says when she lands or sits on
that element, and `data-pagegeist-ignore` keeps her off it and everything inside:

```html
<button data-pagegeist-say="This button is mine now.|Press it.">Subscribe</button>
<aside data-pagegeist-ignore>She never walks on anything in here.</aside>
```

*"Off-limits? We'll see."* (She respects it anyway.)

## Accessibility

She is decorative: `aria-hidden`, never focusable, and your DOM stays untouched unless you
opt in. Reduced motion is honored by default. The **pause control is off by default** – if
your site needs to conform to WCAG 2.2.2 (Pause, Stop, Hide), enable `pauseControl` or
provide your own pause button. See [Accessibility](docs/accessibility.md).

## Browser support

Evergreen browsers: **Chrome/Edge 86+, Firefox 79+, Safari 14+ (iOS 14+)**. The package is
compiled to ES2022 and needs `ResizeObserver`, `MutationObserver` and Pointer Events
(`createPagegeist()` throws a clear `pagegeist: …` error without the observers). Newer APIs
such as `checkVisibility()` and `CanvasRenderingContext2D.roundRect()` are used when
available, with fallbacks. Touch works too: tap to poke, drag to carry and throw.

## Documentation

| | |
|---|---|
| [Usage for agents](docs/usage-for-agents.md) | Copy-paste setups (vanilla, React, Next.js, Vite) and the rules that keep an integration correct |
| [Usage guide](docs/guide.md) | Picking a sister, how she works, platforms, phrases, events, React semantics, touch, stacking |
| [API reference](docs/api.md) | Every option, event, method and export |
| [Recipes](docs/recipes.md) | i18n, easter eggs, CTA reactions, quiet mode, CDN, tests … |
| [The character](docs/character.md) | Both sisters: design, voice, wardrobe, outline, licensing of the artwork |
| [Accessibility](docs/accessibility.md) | Reduced motion, pause control, screen readers |
| [FAQ & troubleshooting](docs/faq.md) | Performance, z-index, sticky headers, CSP, browser support … |
| [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) | Releases, development setup, reporting vulnerabilities |

Run the playground locally with `npm run dev` in this repository.

## Versioning

pagegeist follows [Semantic Versioning](https://semver.org/). While the version is **0.x**,
breaking changes can land in minor releases (`0.1` → `0.2`) and are called out in the
[changelog](CHANGELOG.md); patch releases stay compatible. Pin a minor range (`~0.1.0`) if
you want to opt in to changes explicitly. **1.0** will mark a stable API: from then on,
breaking changes only land in major versions.

## License

- Code: [MIT](LICENSE)
- Character designs: [CC0 1.0](LICENSE-ARTWORK) – public domain, both sisters. Use them however
  you like.
