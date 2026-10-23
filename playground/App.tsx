import {
  type BehaviorOptions,
  DEFAULT_BEHAVIORS,
  DEFAULT_PHRASES,
  DEFAULT_PLATFORMS,
  DEFAULT_SIZE,
  type OutfitStyle,
  type OutlineMode,
  type PagegeistOptions,
  type PagegeistState,
  type PauseControlOptions,
  type PhraseMap,
  type PhraseTrigger,
  type ReducedMotionMode,
  type ShoeStyle,
  type TextLineMode,
} from '@d4ndel1on/pagegeist';
import { Pagegeist, type PagegeistHandle } from '@d4ndel1on/pagegeist/react';
import { type JSX, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';

/**
 * The gait lab tweaks internal (non-public) tuning constants. It is only loaded on the dev
 * server or with `?lab` in the URL, as a separate chunk, so the regular playground never
 * imports library internals.
 */
const LAB_ENABLED = import.meta.env.DEV || new URLSearchParams(window.location.search).has('lab');
const GaitLab = lazy(() => import('./GaitLab'));

/** Demo-page specific phrases (not shown in the snippet). */
const LAND_ON: PhraseMap['landOn'] = {
  '.btn--primary': ['This one looks important. Mine now.', 'Click it. I dare you.'],
};

const TRIGGERS: readonly PhraseTrigger[] = ['poke', 'grab', 'cursorNear', 'sit', 'idle', 'land'];
type Spawn = 'random' | 'left' | 'center' | 'right';
type PausePosition = 'off' | PauseControlOptions['position'];

/** Library default, needed to reset the color after a custom one was applied via update(). */
const DEFAULT_OUTLINE_COLOR = 'rgba(220, 205, 255, 0.32)';
const DEFAULT_RESPAWN_AFTER = 1.5;

/** Keyboard shortcuts – also listed in the panel. */
const SHORTCUTS = 'D debug · P pause · R respawn · S slow-mo';

export function App(): JSX.Element {
  const ref = useRef<PagegeistHandle>(null);
  const [state, setState] = useState<PagegeistState | null>(null);
  const [behaviors, setBehaviors] = useState<BehaviorOptions>(DEFAULT_BEHAVIORS);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [spawn, setSpawn] = useState<Spawn>('random');
  const [outline, setOutline] = useState<OutlineMode>('auto');
  const [outlineColor, setOutlineColor] = useState(''); // '' = library default
  const [outfit, setOutfit] = useState<OutfitStyle>('classic');
  const [shoes, setShoes] = useState<ShoeStyle>('boots');
  const [fishnets, setFishnets] = useState(false);
  const [reducedMotion, setReducedMotion] = useState<ReducedMotionMode>('static');
  const [textLines, setTextLines] = useState<TextLineMode>(DEFAULT_PLATFORMS.textLines);
  const [minWidth, setMinWidth] = useState(DEFAULT_PLATFORMS.minWidth);
  const [ignore, setIgnore] = useState(''); // comma-separated selectors
  const [safeTop, setSafeTop] = useState(''); // '' = 'auto'
  const [safeBottom, setSafeBottom] = useState('');
  const [pausePosition, setPausePosition] = useState<PausePosition>('off');
  const [announce, setAnnounce] = useState(false);
  const [markElements, setMarkElements] = useState(false);
  const [respawnAfter, setRespawnAfter] = useState(DEFAULT_RESPAWN_AFTER);
  const [debug, setDebug] = useState(false);
  const [timeScale, setTimeScale] = useState(1);
  const [trigger, setTrigger] = useState<PhraseTrigger>('poke');
  const [customPhrases, setCustomPhrases] = useState<Partial<Record<PhraseTrigger, string>>>({});
  const [light, setLight] = useState(false);
  const [text, setText] = useState('This page is mine now.');

  useEffect(() => {
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
  }, [light]);

  // Keyboard shortcuts. Ignored while typing and for any modifier combination
  // (so browser shortcuts like Cmd+R or Ctrl+D keep working).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || isEditable(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === 'd') setDebug((d) => !d);
      else if (key === 'p') togglePause(ref.current);
      else if (key === 'r') ref.current?.respawn();
      else if (key === 's') setTimeScale((t) => (t === 1 ? 0.25 : 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onLand = useCallback(({ element }: { element: Element | null }) => {
    if (element instanceof HTMLElement && element.matches('.card .btn')) element.textContent = '🖤 Claimed.';
  }, []);

  // Every option is always passed explicitly: update() keeps the previous value of an
  // omitted option, so leaving one out would not reset it.
  const phrases: PhraseMap = {};
  for (const t of TRIGGERS) {
    const lines = parseLines(customPhrases[t]);
    if (lines) phrases[t] = lines;
  }
  const ignoreList = parseList(ignore);
  const options = {
    size,
    spawn,
    outline,
    outlineColor: outlineColor || DEFAULT_OUTLINE_COLOR,
    outfit,
    shoes,
    fishnets,
    reducedMotion,
    pauseControl: pausePosition === 'off' ? false : { position: pausePosition },
    announce,
    markElements,
    debug,
    respawnAfter,
    timeScale,
    behaviors,
    platforms: { textLines, minWidth, ignore: ignoreList },
    safeArea: { top: parseSafe(safeTop), bottom: parseSafe(safeBottom) },
  } satisfies PagegeistOptions;

  // Only what differs from the library defaults ends up in the copy & paste snippet.
  const offBehaviors = Object.fromEntries(Object.entries(behaviors).filter(([, on]) => !on));
  const snippet = toJsx({
    size: size !== DEFAULT_SIZE ? size : undefined,
    spawn: spawn !== 'random' ? spawn : undefined,
    outline: outline !== 'auto' ? outline : undefined,
    outlineColor: outlineColor || undefined,
    outfit: outfit !== 'classic' ? outfit : undefined,
    shoes: shoes !== 'boots' ? shoes : undefined,
    fishnets: fishnets || undefined,
    reducedMotion: reducedMotion !== 'static' ? reducedMotion : undefined,
    pauseControl:
      pausePosition === 'off' ? undefined : pausePosition === 'bottom-right' ? true : { position: pausePosition },
    announce: announce || undefined,
    markElements: markElements || undefined,
    debug: debug || undefined,
    respawnAfter: respawnAfter !== DEFAULT_RESPAWN_AFTER ? respawnAfter : undefined,
    timeScale: timeScale !== 1 ? timeScale : undefined,
    behaviors: Object.keys(offBehaviors).length ? offBehaviors : undefined,
    platforms: compact({
      textLines: textLines !== DEFAULT_PLATFORMS.textLines ? textLines : undefined,
      minWidth: minWidth !== DEFAULT_PLATFORMS.minWidth ? minWidth : undefined,
      ignore: ignoreList.length ? ignoreList : undefined,
    }),
    safeArea: compact({
      top: safeTop.trim() ? parseSafe(safeTop) : undefined,
      bottom: safeBottom.trim() ? parseSafe(safeBottom) : undefined,
    }),
    phrases: Object.keys(phrases).length ? phrases : undefined,
  });

  return (
    <>
      <Pagegeist
        // `spawn` only applies when the mascot is created, so remount to show it.
        key={spawn}
        ref={ref}
        {...options}
        phrases={{ ...phrases, landOn: LAND_ON }}
        onStateChange={({ to }) => setState(to)}
        onLand={onLand}
      />
      <Page />

      <aside className="panel" data-pagegeist-ignore>
        <details open>
          <summary>
            Pagegeist · <span className="panel__state">{state ?? '–'}</span>
          </summary>
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            <div className="panel__row">
              <button type="button" onClick={() => setDebug((d) => !d)} title="Key D">
                Debug
              </button>
              <button type="button" title="Key P" onClick={() => togglePause(ref.current)}>
                Pause / resume
              </button>
              <button type="button" onClick={() => ref.current?.respawn()} title="respawn() · Key R">
                Summon
              </button>
              <button type="button" onClick={() => setTimeScale((t) => (t === 1 ? 0.25 : 1))} title="Key S">
                Slow-mo
              </button>
            </div>
            <p className="panel__stats">Keys: {SHORTCUTS}</p>
            <form
              className="panel__row"
              onSubmit={(e) => {
                e.preventDefault();
                ref.current?.say(text);
              }}
            >
              <input type="text" value={text} onChange={(e) => setText(e.target.value)} aria-label="Phrase" />
              <button type="submit" title="say(text)">
                Annoy her
              </button>
            </form>

            <fieldset>
              <legend>behaviors</legend>
              {(Object.keys(DEFAULT_BEHAVIORS) as Array<keyof BehaviorOptions>).map((key) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={behaviors[key]}
                    onChange={(e) => setBehaviors((b) => ({ ...b, [key]: e.target.checked }))}
                  />
                  {key}
                </label>
              ))}
            </fieldset>

            <fieldset>
              <legend>options</legend>
              <Toggle label="fishnets" value={fishnets} onChange={setFishnets} />
              <Toggle label="announce" value={announce} onChange={setAnnounce} />
              <Toggle label="markElements" value={markElements} onChange={setMarkElements} />
              <Toggle label="light page" value={light} onChange={setLight} />
            </fieldset>

            <fieldset className="panel__lab">
              <legend>look</legend>
              <Range
                label="size"
                min={48}
                max={240}
                step={1}
                value={size}
                onChange={setSize}
                format={(v) => `${v}px`}
              />
              <Select label="outfit" value={outfit} options={['classic', 'corset']} onChange={setOutfit} />
              <Select label="shoes" value={shoes} options={['boots', 'heels']} onChange={setShoes} />
              <Select label="outline" value={outline} options={['auto', 'always', 'never']} onChange={setOutline} />
              <label>
                outlineColor
                <input
                  type="color"
                  value={outlineColor || '#dccdff'}
                  onChange={(e) => setOutlineColor(e.target.value)}
                  aria-label="Outline color"
                />
                <button type="button" onClick={() => setOutlineColor('')} disabled={!outlineColor}>
                  reset
                </button>
              </label>
            </fieldset>

            <fieldset className="panel__lab">
              <legend>placement</legend>
              <Select label="spawn" value={spawn} options={['random', 'left', 'center', 'right']} onChange={setSpawn} />
              <Select label="textLines" value={textLines} options={['all', 'first', 'none']} onChange={setTextLines} />
              <Range label="minWidth" min={0} max={200} step={1} value={minWidth} onChange={setMinWidth} />
              <label title="Comma-separated CSS selectors that never become platforms">
                ignore
                <input type="text" value={ignore} placeholder=".nav, h1" onChange={(e) => setIgnore(e.target.value)} />
              </label>
              <label title="px; empty = auto (detects fixed/sticky headers)">
                safeArea.top
                <input
                  type="text"
                  inputMode="numeric"
                  value={safeTop}
                  placeholder="auto"
                  onChange={(e) => setSafeTop(e.target.value)}
                />
              </label>
              <label title="px; empty = auto (detects fixed/sticky footers)">
                safeArea.bottom
                <input
                  type="text"
                  inputMode="numeric"
                  value={safeBottom}
                  placeholder="auto"
                  onChange={(e) => setSafeBottom(e.target.value)}
                />
              </label>
              <Range
                label="respawnAfter"
                min={0}
                max={5}
                step={0.5}
                value={respawnAfter}
                onChange={setRespawnAfter}
                format={(v) => `${v}s`}
              />
            </fieldset>

            <fieldset className="panel__lab">
              <legend>motion & controls</legend>
              <Range
                label="timeScale"
                min={0.1}
                max={2}
                step={0.05}
                value={timeScale}
                onChange={setTimeScale}
                format={(v) => `${v.toFixed(2)}×`}
              />
              <Select
                label="reducedMotion"
                value={reducedMotion}
                options={['static', 'calm', 'hidden', 'ignore']}
                onChange={setReducedMotion}
                title="Only applies when the OS setting 'reduce motion' is on"
              />
              <Select
                label="pauseControl"
                value={pausePosition}
                options={['off', 'bottom-right', 'bottom-left', 'top-right', 'top-left']}
                onChange={setPausePosition}
              />
              <div className="panel__row">
                <button
                  type="button"
                  onClick={() => {
                    setDebug(true);
                    setTimeScale(0.25);
                  }}
                >
                  Debug + slow-mo
                </button>
              </div>
            </fieldset>

            <fieldset className="panel__lab">
              <legend>phrases</legend>
              <Select label="trigger" value={trigger} options={TRIGGERS} onChange={setTrigger} />
              <textarea
                rows={4}
                aria-label={`Custom ${trigger} phrases, one per line`}
                value={customPhrases[trigger] ?? ''}
                placeholder={
                  DEFAULT_PHRASES[trigger].length
                    ? `Built-in (one per line):\n${DEFAULT_PHRASES[trigger].join('\n')}`
                    : 'Silent by default. One phrase per line.'
                }
                onChange={(e) => setCustomPhrases((p) => ({ ...p, [trigger]: e.target.value }))}
              />
            </fieldset>

            {LAB_ENABLED && (
              <Suspense fallback={null}>
                <GaitLab size={size} />
              </Suspense>
            )}
            <pre>{snippet}</pre>
          </div>
        </details>
      </aside>
    </>
  );
}

function togglePause(g: PagegeistHandle | null): void {
  if (g?.paused) g.resume();
  else g?.pause();
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest('input, textarea, select, [contenteditable]') !== null)
  );
}

/** Non-empty trimmed lines, or undefined if there are none (= use the built-in phrases). */
function parseLines(value: string | undefined): string[] | undefined {
  const lines = (value ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length ? lines : undefined;
}

function parseList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseSafe(value: string): number | 'auto' {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : 'auto';
}

/** Drops undefined values; returns undefined for an empty object. */
function compact(obj: Record<string, unknown>): Record<string, unknown> | undefined {
  const entries = Object.entries(obj).filter(([, v]) => v !== undefined);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Select<T extends string>(props: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  title?: string;
}) {
  return (
    <label title={props.title}>
      {props.label}
      <select value={props.value} onChange={(e) => props.onChange(e.target.value as T)}>
        {props.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Range(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  const { label, min, max, step, value, onChange, format = String } = props;
  return (
    <label>
      {label}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output>{format(value)}</output>
    </label>
  );
}

/** Formats a value as a JavaScript literal (single-quoted strings, inline objects). */
function literal(value: unknown): string {
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  if (Array.isArray(value)) return `[${value.map(literal).join(', ')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(
      ([k, v]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : literal(k)}: ${literal(v)}`,
    );
    return `{ ${entries.join(', ')} }`;
  }
  return String(value);
}

/** Renders the given (non-default) props as JSX for copy & paste. */
function toJsx(props: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue;
    if (value === true) lines.push(key);
    else if (typeof value === 'string' && !/["\\]/.test(value)) lines.push(`${key}="${value}"`);
    else lines.push(`${key}={${literal(value)}}`);
  }
  return lines.length ? `<Pagegeist\n  ${lines.join('\n  ')}\n/>` : '<Pagegeist />';
}

/** Bait for visitors (and a platform for her). Clicking only earns a brief, harmless wiggle. */
function BaitButton() {
  const [clicked, setClicked] = useState(false);
  useEffect(() => {
    if (!clicked) return;
    const id = window.setTimeout(() => setClicked(false), 1200);
    return () => window.clearTimeout(id);
  }, [clicked]);
  return (
    <button
      type="button"
      className={clicked ? 'btn btn--bait btn--bait-clicked' : 'btn btn--bait'}
      data-pagegeist-say="I said don't.|Don't you dare."
      onClick={() => setClicked(true)}
    >
      {clicked ? 'Told you.' : 'Do not click'}
    </button>
  );
}

function Page() {
  return (
    <>
      <nav className="nav">
        <span className="nav__brand">Night Atelier</span>
        <div className="nav__links">
          <button type="button" className="btn btn--ghost">
            Collection
          </button>
          <button type="button" className="btn btn--ghost">
            Journal
          </button>
          <button type="button" className="btn btn--ghost">
            Contact
          </button>
        </div>
      </nav>

      <header className="hero">
        <p className="hero__eyebrow">Interactive 2.5D demo</p>
        <h1>She lives here now.</h1>
        <p className="hero__sub">You're just visiting.</p>
        <p className="hero__lead">
          Pagegeist is the poltergeist of this page. She stomps across headings, sits on your buttons, hangs from edges
          and shimmies along lines of text like she owns them. Click her or drag her around if you must – she'll
          complain, but the page stays fully usable.
        </p>
        <div className="hero__actions">
          <button type="button" className="btn btn--primary">
            Get started
          </button>
          <button type="button" className="btn">
            Learn more
          </button>
          <BaitButton />
        </div>
      </header>

      <main>
        <section className="section">
          <h2>How it works</h2>
          <p>
            A transparent canvas covers the whole page and ignores pointer events. Only a small invisible hitbox follows
            the mascot and catches clicks. Headings, paragraphs, buttons and cards are measured with{' '}
            <code>getBoundingClientRect()</code> and turned into walkable edges – paragraphs even line by line.
          </p>
          <p>
            A small state machine decides what happens next: wander around, jump to a neighboring element, sit down,
            lower herself over an edge or just watch the cursor.
          </p>
        </section>

        <section className="cards">
          <article className="card">
            <h2>Platforms</h2>
            <p>Every card's top edge is a one-way platform. She jumps through from below and lands from above.</p>
            <button type="button" className="btn btn--small">
              Details
            </button>
          </article>
          <article className="card">
            <h2>Edges</h2>
            <p>Too high to jump? She grabs the edge, hangs for a moment and pulls herself up.</p>
            <button type="button" className="btn btn--small">
              Details
            </button>
          </article>
          <article className="card">
            <h2>Depth</h2>
            <p>Shadows and sorted body layers create spatial depth on a flat canvas.</p>
            <button type="button" className="btn btn--small">
              Details
            </button>
          </article>
        </section>

        <section className="section section--split">
          <div>
            <h2>Step by step</h2>
            <p>
              Heel strike, roll over the toe, push off: her stilettos stay planted while she walks, and she slows down
              before she arrives.
            </p>
          </div>
          <div className="button-stack">
            <button type="button" className="btn">
              First step
            </button>
            <button type="button" className="btn">
              Second step
            </button>
            <button type="button" className="btn btn--primary">
              Top
            </button>
          </div>
        </section>

        <section className="section">
          <h2>Scrolling allowed</h2>
          <p>
            Physics and platforms live in page coordinates. While you scroll she stays on her element; if she leaves the
            screen she drops back in from the top after a moment. She never stands under the sticky navigation.
          </p>
          <p>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer posuere erat a ante venenatis dapibus
            posuere velit aliquet. Cras mattis consectetur purus sit amet fermentum. Vestibulum id ligula porta felis
            euismod semper. Nullam quis risus eget urna mollis ornare vel eu leo.
          </p>
          <p>
            Donec ullamcorper nulla non metus auctor fringilla. Maecenas sed diam eget risus varius blandit sit amet non
            magna. Aenean lacinia bibendum nulla sed consectetur.
          </p>
        </section>

        <section className="cards cards--two">
          <article className="card card--tall" data-pagegeist-say="I'm sitting here now.|This card is mine.">
            <h2>Say something</h2>
            <p>
              Elements can carry their own lines: <code>data-pagegeist-say="This card is mine."</code>. Phrases are
              always rendered as plain text, never as HTML.
            </p>
          </article>
          <article className="card">
            <h2>Events</h2>
            <p>
              When she lands on an element it fires <code>pagegeist:land</code> – and <code>onLand</code> – for little
              easter eggs.
            </p>
            <button type="button" className="btn btn--small">
              Try it
            </button>
          </article>
        </section>
      </main>

      <footer className="footer">
        <p>Night Atelier · Playground for the Pagegeist website mascot</p>
        <p className="footer__note">No ghosts were harmed. Several cursors were.</p>
      </footer>
    </>
  );
}
