# The character

Pagegeist is a young woman in gothic style: pale, slightly ghostly skin, long straight
black hair with blunt bangs, a choker with pendant and – by default – a velvet top with lace
neckline, bell sleeves with lace cuffs, a laced corset, a layered asymmetric skirt and
knee-high stiletto boots. Her attitude: the page's poltergeist – bratty, bossy, easily
annoyed, and out to annoy you right back. Never helpless.

## Attitude

She is not a helper and not a pet. She haunts your page, considers every button and heading
hers, and is mildly offended that you are here at all. Poke her and she snaps back; pick her
up and she demands to be put down; leave her alone and she gets bored and tells you about it.
Her contempt is aimed at the situation – the cursor in her way, the button she has claimed,
the boredom – never at the person reading the page. She stays cheeky, not cruel.

### Writing your own phrases

When you add phrases (see [`phrases`](api.md#phrases) and `data-pagegeist-say`), keep them in
her voice:

- **Bossy and bratty: yes.** Orders, dares, eye-rolls, claiming things: *"Scroll. Now."*,
  *"Mine."*, *"Poke me again. I dare you."*
- **Insulting the user: no.** She is rude to the situation, not to people. *"Your cursor's
  in my way."* works; anything about the reader's looks, intelligence or identity does not.
- **No slurs, no profanity aimed at anyone.**
- **Strictly SFW.** This runs on customer sites – no innuendo, no double meanings.
- **Short.** One or two short sentences that fit a speech bubble (they wrap at ~220 px).
- **Never helpless.** She does not cry for help or beg; she complains and gives orders.
- **Teasing her little sister: yes.** `sunny` is fair game, as long as it stays sibling
  banter: *"White is not a color. Tell my sister."*

Examples for your own triggers:

```tsx
<Pagegeist
  phrases={{
    landOn: {
      '.pricing .pro': ['Fancy. I approve.'],
      '.newsletter button': ['Subscribe. I said subscribe.'],
    },
    sit: ['My seat now.', 'Comfy. Go away.'],
  }}
/>
```

### Default phrases

| Trigger | Phrases |
|---|---|
| `poke` | "Did you just poke me?", "Again?", "Stop it.", "Rude.", "Hmpf.", "Poke me again. I dare you.", "I'm busy.", "Hands where I can see them.", "Who said you could touch me?", "Do that again. See what happens.", "Ghost, not toy.", "Poke my sister. She likes that." |
| `grab` | "Put. Me. Down.", "Hands off the lace.", "I will haunt you.", "Excuse you?", "Unhand me.", "Careful. I am vintage.", "You will regret this.", "Down. Now.", "My sister likes this. I don't." |
| `cursorNear` | "Personal space.", "Can I help you?", "Your cursor's in my way.", "Mine.", "Go click something else.", "Scroll. Now.", "Back off.", "Did I say you could come closer?", "Hover somewhere else.", "Looking for the cute one? Wrong ghost." |
| `sit` | "This button is mine now.", "I sit here now. Deal.", "…", "Throne acquired.", "Not moving. Make me.", "My seat. My rules.", "My sister would share. I won't." |
| `idle` | "\*sigh\*", "Bored.", "Entertain me.", "I was here first.", "This page is mine.", "Bow to the ghost.", "I'm waiting.", "Amuse me. Now.", "I could rearrange your buttons, you know.", "Tick tock.", "Somewhere my sister is waving. Ugh.", "She bleached my dress. Unforgivable.", "White is not a color. Tell my sister." |
| `land` | (none) |

They are exported as `DEFAULT_PHRASES` if you want to extend them instead of replacing them.

## Her little sister: `sunny`

***Same dress. Opposite ghost.***

Pagegeist has a little sister. She wears her big sister's hand-me-downs – the same velvet,
lace, corset and boots, the same long black hair – but she bleached every piece of clothing a
ghostly, slightly bluish white. Black and white, the perfect contrast. And she got the opposite
mood. Where the goth wants you gone, `sunny` wants your attention: she spots your cursor from
across the page, hurries over to it, loves every poke, cheers when you pick her up and keeps
calling "Look at me!" when you ignore her.

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

Vanilla: `createPagegeist({ character: sunny })`. `sunny` lives in its own entry
(`@d4ndel1on/pagegeist/sunny`, < 1 kB), so the default bundle does not grow. Switch back at
runtime with `update({ character: goth })` (`goth` comes from the main entry) or by removing the
React prop.

What changes with the character: her colors, the speech bubble and pause button (light and
cool instead of dark and violet), the built-in phrases and the `'auto'` outline – `sunny` gets a
blue-grey rim on light backgrounds, where her white clothes would wash out, and a ghostly glow on
dark ones, where her black hair would.

And her temper: `sunny` is eager. She notices the cursor from further away (looking at it,
turning towards it, greeting it), walks over to it at a brisker pace, prefers jumps that bring
her closer to it and takes shorter breaks. Turning off `watchCursor` (or `walk`) stops the
chasing. In `reducedMotion: 'static'` she stays put like her sister.

Everything else stays the same: skeleton, wardrobe (`outfit`, `shoes`, `fishnets` work for
both sisters), and all other behaviors. Her own look may follow.

### Her voice

Friendly, bubbly, attention-seeking – the mirror image of her sister, with the same limits:
SFW, short, never insulting. And she is **never needy**: she invites and cheers, she does not
beg, guilt-trip or cling. Teasing her big sister is fine (*"Goth is a phase. Hers lasted 300 years."*).

| Trigger | Phrases |
|---|---|
| `poke` | "Hi! Hi! Hi!", "Again! Again!", "That tickles!", "You noticed me!", "Boop!", "Best. Poke. Ever.", "Do it again!", "My sister would hiss at you.", "Hehe.", "Finally, a friend!", "You poke, I sparkle.", "Don't tell my sister I liked that." |
| `grab` | "Wheee!", "Higher!", "We're flying!", "Careful, the dress is borrowed!", "Spin me!", "Best ride on this page!", "My sister hates this part.", "Throw me! Go on!", "My sister bites. I hug." |
| `cursorNear` | "Hi there!", "Ooh, a cursor!", "Come closer!", "Wanna see a trick?", "Over here!", "Click me! Click me!", "Hello, friend!", "Stay a while!", "I like your cursor.", "My sister says hi! She doesn't, but still." |
| `sit` | "Saving this seat for you!", "Comfy! Come sit!", "Best seat on the page!", "This button is great. Click it!", "I sit, you scroll. Deal?", "Tea party up here!", "Saved my sister a seat. She won't come." |
| `idle` | "Look at me!", "Watch this!", "Hey! Over here!", "Is anyone there?", "This page is the best!", "I bleached it myself.", "Black was her color. Not mine.", "Same dress. Opposite ghost.", "Wanna be friends?", "Scroll! I wanna see more!", "So many buttons!", "Goth is a phase. Hers lasted 300 years.", "My sister says smiling is cringe.", "Don't tell her I borrowed the boots." |
| `land` | (none) |

They are exported as `SUNNY_PHRASES` from `@d4ndel1on/pagegeist/sunny`.

## Wardrobe

Three options change what she wears. All of them can be switched at runtime via `update()`
or React props; the change shows up on the next frame.

### `outfit`

- **`'classic'`** (default) – the look described above: velvet top with lace neckline and
  bell sleeves, laced corset, long layered asymmetric skirt.
- **`'corset'`** – a sleeveless corset top on thin spaghetti straps (bare shoulders and
  arms) with light front lacing like the classic corset, and a short two-layer ruffled
  miniskirt: a velvet top layer over a slightly longer lace layer, both swinging with the
  skirt's secondary motion. A black band sits around her near thigh, about a hand's width
  below the hem, with a small red satin bow. The choker carries a red drop pendant instead
  of the metal one. Her bare legs are drawn slimmer: tapered thighs, a narrow knee, a slight
  calf and a slim ankle.

### `shoes`

- **`'boots'`** (default) – knee-high stiletto boots.
- **`'heels'`** – high-top lace-up platform boots in matte black canvas. The shaft rises
  well above the ankle bone with a full, rounded heel counter and a padded collar; the front
  is laced from the toe box up to the collar (small silver eyelets, black laces zig-zagging
  over the tongue). A round, slightly bulbous sneaker toe sits on a massive lug-sole
  platform with a visible welt, and a tall chunky block heel – about twice the platform's
  height, straight at the back – joins it through a shallow concave arch, so the boot reads
  solid through the ankle and instep. Both platform and heel
  have serrated tread teeth. Shaft, upper, platform and heel are drawn as one clean
  outline (no separate sole pieces).

Both styles are drawn on exactly the same foot geometry – the same ankle, heel tip and toe
points (`LEG`, `HEEL` and `TOE` in `src/core/render/walk.ts`). The high-heel walk and the
heel-strike timing are therefore identical in both; only the drawing changes.

### `fishnets`

`fishnets: true` (default `false`) adds diamond-mesh fishnet tights. The mesh follows her
legs in every pose – walking, sitting, hanging, climbing. With boots it is only visible
above the boot shaft; with heels down to the boot collar. It pairs with either outfit, though it
shows most with `outfit: 'corset'`.

```tsx
<Pagegeist outfit="corset" shoes="heels" fishnets />
```

## How she is drawn

There are no image assets. `GothRenderer` builds a small skeleton every frame (forward
kinematics plus 2-bone IK for arms and legs) and paints her with Canvas 2D paths. Body
parts are queued with depth values and sorted per pose – for example, the near arm moves
in front of her head while she hangs, and the knee moves in front of her torso while she
climbs. A ground shadow and a wall shadow (while hanging or climbing) add a 2.5D feel.
The shadows are only drawn on dark backgrounds – on light pages they look like dirt
rather than depth, so they are left out there.

This keeps the package small, resolution independent (sharp up to 2× device pixel ratio,
where the canvas is capped) and lets every
motion – walking cycles bound to distance, hair springs, squash on landing, head tracking –
react continuously instead of playing fixed frames.

## Hands

Her hands have a palm, four tapering fingers and a thumb, drawn in her skin tone with the
same faint contour as her arms (with sleeves, the lace cuff covers the wrist), and a
silver ring on the ring finger. They follow the pose: relaxed and slightly curled along
the forearm while she stands or walks, fingers hooked over the edge while she hangs or
climbs, spread open while she is dragged, falls or jumps, and resting flat while she sits.
They read as simple shapes at the default size and as hands at larger sizes.

## Size

`size` is her standing height in CSS pixels (default `112`). Everything scales with it:
the drawing, the hitbox, and the physics – a smaller mascot walks slower and jumps lower
in absolute terms, but looks identical in motion.

## Outline

On dark backgrounds a subtle rim keeps her visible (`outline: 'auto'`); `sunny` needs it everywhere – a
ghostly glow on dark backgrounds, a blue-grey rim on light ones. The rim is
computed from her silhouette on a small offscreen canvas, so overlapping body parts do not
get inner outlines.

## Speech bubble

Bubbles wrap at ~220 px, use system fonts with CJK and emoji fallbacks, and stay
inside the viewport.

## License of the artwork

Both character designs – `goth` and `sunny` – are dedicated to the **public domain (CC0 1.0)**
– see [LICENSE-ARTWORK](../LICENSE-ARTWORK). Use them in your projects, draw fan art, make
stickers, sell merch – no permission or attribution needed. The code is MIT licensed.

## Other characters

Besides the two built-in sisters (`goth`, `sunny`), swappable characters (sprite sheets,
Spine, Rive) are not supported yet. The fields of `PagegeistCharacter` are internal, so do not
build your own. The internal
renderer interface already separates simulation from drawing, so this can be added later
without breaking the public API.
