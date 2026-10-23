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
| `poke` | "Did you just poke me?", "Again?", "Stop it.", "Rude.", "Hmpf.", "Poke me again. I dare you.", "I'm busy.", "Hands where I can see them.", "Who said you could touch me?", "Do that again. See what happens.", "Ghost, not toy." |
| `grab` | "Put. Me. Down.", "Hands off the lace.", "I will haunt you.", "Excuse you?", "Unhand me.", "Careful. I am vintage.", "You will regret this.", "Down. Now." |
| `cursorNear` | "Personal space.", "Can I help you?", "Your cursor's in my way.", "Mine.", "Go click something else.", "Scroll. Now.", "Back off.", "Did I say you could come closer?", "Hover somewhere else." |
| `sit` | "This button is mine now.", "I sit here now. Deal.", "…", "Throne acquired.", "Not moving. Make me.", "My seat. My rules." |
| `idle` | "\*sigh\*", "Bored.", "Entertain me.", "I was here first.", "This page is mine.", "Bow to the ghost.", "I'm waiting.", "Amuse me. Now.", "I could rearrange your buttons, you know.", "Tick tock." |
| `land` | (none) |

They are exported as `DEFAULT_PHRASES` if you want to extend them instead of replacing them.

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

On dark backgrounds a subtle rim keeps her visible (`outline: 'auto'`). The rim is
computed from her silhouette on a small offscreen canvas, so overlapping body parts do not
get inner outlines.

## Speech bubble

Bubbles wrap at ~220 px, use system fonts with CJK and emoji fallbacks, and stay
inside the viewport.

## License of the artwork

The character design is dedicated to the **public domain (CC0 1.0)** – see
[LICENSE-ARTWORK](../LICENSE-ARTWORK). Use her in your projects, draw fan art, make
stickers, sell merch – no permission or attribution needed. The code is MIT licensed.

## Other characters

Swappable characters (sprite sheets, Spine, Rive) are not supported yet. The internal
renderer interface already separates simulation from drawing, so this can be added later
without breaking the public API.
