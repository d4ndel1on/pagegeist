# Accessibility

Pagegeist is decorative. She should never get in the way of people using your page.

## What is built in

| Concern | How it is handled |
|---|---|
| Screen readers | The canvas and hitbox are `aria-hidden`. Nothing is announced unless you set `announce`. |
| Keyboard | She is not in the tab order and never steals focus. |
| Pointer | The page underneath stays clickable – only her small hitbox catches pointer events. |
| Text selection | Grabbing her never leaves a stray text selection; `user-select` is restored after a drag. |
| Reduced motion | `prefers-reduced-motion: reduce` is honored and watched at runtime (see below). |
| Moving content (WCAG 2.2.2) | **Off by default.** `pauseControl` adds a visible, keyboard-accessible pause/resume button – enable it (or your own control) if you need conformance. |
| Pointer & touch | Touch must hit her body; the near-miss grab only applies to mouse and pen, so taps next to her always reach your page. |
| Your DOM | Untouched by default: no attributes, no classes. `markElements` opts in to `data-*` attributes. The bubbling `pagegeist:land` event is dispatched on the element she lands on regardless – it changes nothing in your DOM. |

## Reduced motion

`reducedMotion` decides what happens while the user prefers reduced motion:

| Mode | Behavior |
|---|---|
| `'static'` (default) | She appears on an element instead of falling in, then stays put. Idle micro-motion (breathing, sway, hair and skirt swing) is held at rest too; only blinking and looking around remain. Clicking her still makes her talk. Users can still drag her (user-initiated motion). |
| `'calm'` | She moves, but less often, without hanging/climbing acrobatics. |
| `'hidden'` | She is not shown at all. |
| `'ignore'` | No change. Only use this if motion is essential to your page. |

## WCAG 2.2.2 (Pause, Stop, Hide)

Content that moves automatically for more than five seconds needs a way to pause, stop or
hide it. **`pauseControl` is off by default** (a design decision – many sites add their own
control). If your site must meet WCAG 2.2 level A/AA, enable the pause control or offer your own:

```tsx
<Pagegeist pauseControl={{ position: 'bottom-left', pauseLabel: 'Pause mascot', resumeLabel: 'Resume mascot' }} />
```

```tsx
// your own control – the label names the action, like the built-in button
const [paused, setPaused] = useState(false);
<button onClick={() => setPaused(!paused)}>{paused ? 'Resume mascot' : 'Pause mascot'}</button>
<Pagegeist paused={paused} />
```

The built-in button works the same way: its accessible name is the action (`pauseLabel` /
`resumeLabel`), there is no `aria-pressed` (that would announce the state twice), and the
❚❚/▶ glyph is `aria-hidden`. While paused the animation loop sleeps, so she costs no CPU.

Remember the choice (e.g. in `localStorage`) and pass `paused` on the next visit.

## Speech bubbles

Bubbles are drawn on the canvas and therefore invisible to assistive technology. If what
she says is meaningful (it usually is not), set `announce` to mirror bubbles into a polite
live region. Keep chatter low in that case (`behaviors: { chatter: false }`) – frequent
announcements are annoying.

## Contrast

Her outfit is black. On dark pages `outline: 'auto'` adds a subtle light rim; set
`outline: 'always'` or a stronger `outlineColor` if your background is busy.
