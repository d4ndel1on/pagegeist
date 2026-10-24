# Recipes

## i18n

With any i18n library: return a list per trigger, or `undefined` to keep the English defaults.

```tsx
'use client';
import { Pagegeist, type PhraseResolver } from '@d4ndel1on/pagegeist/react';
import { useTranslation } from 'react-i18next';

export function Mascot() {
  const { t, i18n } = useTranslation();
  const phrases: PhraseResolver = ({ trigger }) =>
    i18n.exists(`mascot.${trigger}`) ? (t(`mascot.${trigger}`, { returnObjects: true }) as string[]) : undefined;
  return <Pagegeist phrases={phrases} pauseControl={{ pauseLabel: t('mascot.pause'), resumeLabel: t('mascot.resume') }} />;
}
```

```json
{ "mascot": { "poke": ["Hey.", "Nicht stupsen."], "grab": ["Lass mich runter."], "pause": "Maskottchen pausieren", "resume": "Weiter" } }
```

Without a library, a plain object works too:

```tsx
const de = { poke: ['Hey.', 'Nicht stupsen.'], grab: ['Lass mich runter.'], sit: ['Schöne Aussicht.'] };
<Pagegeist phrases={lang === 'de' ? de : undefined} />;
```

## Extend instead of replace the defaults

```ts
import { DEFAULT_PHRASES } from '@d4ndel1on/pagegeist';
const phrases = { poke: [...DEFAULT_PHRASES.poke, 'Welcome to ACME.'] };
```

The defaults (`DEFAULT_PHRASES`, `DEFAULT_BEHAVIORS`, `DEFAULT_PLATFORMS`) are frozen – always
copy them like this instead of pushing into them.

## Make her even more annoying

*"Finally, someone gets it."*

Replace the built-in lists with your own, and give her something to say about specific elements:

```tsx
<Pagegeist
  phrases={{
    poke: ['Did you just poke me?', 'Again?', 'Strike three. Leave.'],
    idle: ['Bored.', 'This page needs more black.', 'I was here first.'],
    landOn: { '.cta': ['Click it. I dare you.'], '.pricing': ['Pay up.'] },
  }}
/>
```

```html
<button data-pagegeist-say="Don't you dare.|I said don't.">Delete account</button>
```

`data-pagegeist-say` is used when she lands or sits on the button (or anything inside it) and
wins over your `phrases` for those two triggers. `landOn` uses the first selector that matches. Keep phrases
short and aimed at the situation, not at your visitors – see
[writing your own phrases](character.md#writing-your-own-phrases).

## React to your call-to-action

```tsx
<button className="cta" data-pagegeist-say="Click it. I dare you.">Start free trial</button>
```

```ts
document.addEventListener('pagegeist:land', (e) => {
  const el = e.target as HTMLElement;
  if (el.matches('.cta')) el.animate([{ transform: 'scale(0.97)' }, { transform: 'none' }], 200);
});
```

## CSS effects on the element she stands on

```tsx
<Pagegeist markElements />
```

```css
.btn[data-pagegeist-occupied] { box-shadow: 0 0 0 1px rgb(196 155 255 / 0.4); }
.btn[data-pagegeist-landed] { transform: translateY(2px) scale(0.98); }
```

## Keep her away from parts of the page

```tsx
<Pagegeist platforms={{ ignore: ['main form', '.checkout', '[role="dialog"]'] }} />
```

Or `data-pagegeist-ignore` on any container.

## No jumping onto buttons

```tsx
import { DEFAULT_PLATFORMS } from '@d4ndel1on/pagegeist';
<Pagegeist platforms={{ selectors: DEFAULT_PLATFORMS.selectors.filter((s) => s !== 'button') }} />;
```

## A quiet, calm mascot

```tsx
<Pagegeist behaviors={{ chatter: false, hang: false, drop: false }} />
```

## Only on some pages

```tsx
const pathname = usePathname();
return pathname.startsWith('/blog') ? <Pagegeist /> : null;
```

## Let users turn her off for good

```tsx
const [enabled, setEnabled] = useLocalStorage('mascot', true);
return (
  <>
    <button onClick={() => setEnabled(!enabled)}>{enabled ? 'Hide' : 'Show'} mascot</button>
    {enabled && <Pagegeist pauseControl />}
  </>
);
```

## Subscribe to events from a component

`handle.on()` keeps the subscription when the mascot is recreated (e.g. `size` changes):

```tsx
const ref = useRef<PagegeistHandle>(null);
useEffect(() => ref.current?.on('poke', () => analytics.track('mascot_poked')), []);
<Pagegeist ref={ref} size={size} />;
```

## Welcome message after she arrives

```tsx
const ref = useRef<PagegeistHandle>(null);
const greeted = useRef(false);
<Pagegeist
  ref={ref}
  onLand={() => {
    if (greeted.current) return;
    greeted.current = true;
    ref.current?.say('Welcome back.');
  }}
/>;
```

## Vanilla: script tag / any framework

```html
<script type="module">
  import { createPagegeist } from 'https://esm.sh/@d4ndel1on/pagegeist@0.2.0';
  const pagegeist = createPagegeist({ size: 140, pauseControl: true });
</script>
```

Pin an exact version (replace `0.1.0` with the version you tested) so a new release never
changes your page unannounced – while the package is 0.x, minor releases may break.

Vue/Svelte/Angular: call `createPagegeist()` in the mount hook and `destroy()` in the unmount hook.

## Deterministic behavior in tests

```ts
import { createPagegeist, seeded } from '@d4ndel1on/pagegeist';
const pagegeist = createPagegeist({ random: seeded(42) });
```

In jsdom/happy-dom (no canvas), she runs without drawing – mounting, events and `destroy()` still work.
The environment needs `ResizeObserver` and `MutationObserver`; jsdom lacks `ResizeObserver`,
so stub it (`globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }`)
or `createPagegeist()` throws.
To keep her out of end-to-end tests entirely, don't render her when `navigator.webdriver` is true.
