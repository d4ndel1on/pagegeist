import {
  type BehaviorOptions,
  DEFAULT_BEHAVIORS,
  DEFAULT_PLATFORMS,
  DEFAULT_SIZE,
  goth,
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
import { sunny } from '@d4ndel1on/pagegeist/sunny';
import { type JSX, lazy, type RefObject, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { COPY, type PageCopy } from './copy';

/**
 * The gait lab tweaks internal (non-public) tuning constants. It is only loaded on the dev
 * server or with `?lab` in the URL, as a separate chunk, so the regular playground never
 * imports library internals.
 */
const LAB_ENABLED = import.meta.env.DEV || new URLSearchParams(window.location.search).has('lab');
const GaitLab = lazy(() => import('./GaitLab'));

const TRIGGERS: readonly PhraseTrigger[] = ['poke', 'grab', 'cursorNear', 'sit', 'idle', 'land'];
type Spawn = 'random' | 'left' | 'center' | 'right';
type PausePosition = 'off' | PauseControlOptions['position'];

const DEFAULT_RESPAWN_AFTER = 1.5;
const CHARACTERS = { goth, sunny };
type CharacterName = keyof typeof CHARACTERS;
const NAMES = Object.keys(CHARACTERS) as CharacterName[];

/** `?character=sunny` deep-links to a sister (used by the README and docs). */
const INITIAL_CHARACTER: CharacterName =
  new URLSearchParams(window.location.search).get('character') === 'sunny' ? 'sunny' : 'goth';

/** Keyboard shortcuts – also listed in the panel. */
const SHORTCUTS = 'D debug · P pause · R respawn · S slow-mo · Esc close';

/** Hover help for every control, keyed by its label (mirrors the option docs in options.ts). */
const HINTS: Record<string, string> = {
  // behaviors
  walk: 'Wander around on the element she stands on.',
  jump: 'Jump to neighboring elements.',
  hang: 'Hang from edges, shimmy along them and climb up.',
  sit: 'Sit down on elements, legs dangling.',
  drop: 'Drop off the edge of an element down to the next one.',
  drag: 'Let visitors grab, carry and throw her.',
  poke: 'React when she is clicked or tapped.',
  watchCursor: 'Turn her head towards the cursor.',
  chatter: 'Occasionally say something on her own.',
  // options
  fishnets: 'Fishnet tights.',
  announce: 'Also read her speech bubbles to screen readers (polite live region).',
  markElements:
    'Set data-pagegeist-occupied / data-pagegeist-landed on the elements she stands or lands on – for your own CSS effects (the cards here glow).',
  'light page':
    'Demo only: light or dark page background. Follows the character (sunny: light) – flip it to see each sister on the other background.',
  // look
  character:
    'goth: the bratty gothic poltergeist · sunny: her little sister – same dress, bleached white, opposite mood.',
  size: 'Standing height in CSS pixels.',
  outfit: 'classic: velvet top, corset and long layered skirt · corset: strappy corset top and short ruffled skirt.',
  shoes: 'boots: knee-high stiletto boots · heels: lace-up platform boots.',
  outline: 'Rim around her. auto: where she would blend in (goth: dark pages, sunny: both) · always · never.',
  outlineColor: "CSS color of the outline. reset = the character's default.",
  // placement
  spawn: 'Where she appears horizontally. Changing it remounts her.',
  textLines:
    'How paragraphs become platforms. all: every text line · first: only the first line · none: the whole block.',
  minWidth: 'Elements narrower than this (px) are not platforms.',
  ignore: 'Comma-separated CSS selectors that never become platforms, e.g. ".nav, h1".',
  'safeArea.top':
    'Strip at the top of the viewport (px) she never stands in. Empty = auto: detects fixed/sticky headers, so her head never ends up under the navigation.',
  'safeArea.bottom': 'Same at the bottom edge (px), e.g. for cookie banners or bottom bars. Empty = auto.',
  respawnAfter: 'Seconds she may stay off-screen before she drops back into view.',
  // motion & controls
  timeScale: 'Simulation speed: below 1 is slow motion, everything slows down uniformly.',
  reducedMotion:
    "Only applies when the OS setting 'reduce motion' is on. static: stays put, only blinks · calm: moves less, no acrobatics · hidden: not shown · ignore: no change.",
  pauseControl: 'Show a small built-in pause/resume button in a corner of the page.',
  // phrases
  trigger:
    'Situation to edit phrases for. poke: clicked · grab: picked up · cursorNear: cursor close by · sit: sits down · idle: bored · land: after landing.',
};

/** Keep in sync with the sidebar breakpoint in styles.css. */
const DOCKED_QUERY = '(min-width: 1100px)';

const REPO_URL = 'https://github.com/d4ndel1on/pagegeist';

export function App(): JSX.Element {
  const ref = useRef<PagegeistHandle>(null);
  const [state, setState] = useState<PagegeistState | null>(null);
  const [behaviors, setBehaviors] = useState<BehaviorOptions>(DEFAULT_BEHAVIORS);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [spawn, setSpawn] = useState<Spawn>('random');
  const [outline, setOutline] = useState<OutlineMode>('auto');
  const [outlineColor, setOutlineColor] = useState(''); // '' = library default
  const [character, setCharacter] = useState<CharacterName>(INITIAL_CHARACTER);
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
  const [light, setLight] = useState(COPY[INITIAL_CHARACTER].light);
  const [text, setText] = useState(COPY[INITIAL_CHARACTER].defaultText);
  const copy = COPY[character];
  const shown = useRef(character);
  // Docked sidebar on wide screens starts open; the bottom sheet on small screens starts closed.
  const [panelOpen, setPanelOpen] = useState(() => window.matchMedia(DOCKED_QUERY).matches);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelTouched = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
  }, [light]);

  // The page follows the sister: accent colors, a shareable URL and a short entrance. The
  // mascot (a child) has already applied the new character when this effect runs.
  useEffect(() => {
    document.documentElement.dataset.character = character;
    const url = new URL(window.location.href);
    if (character === 'goth') url.searchParams.delete('character');
    else url.searchParams.set('character', character);
    window.history.replaceState(null, '', url);
    // Compared, not flagged: StrictMode runs this effect twice on mount.
    if (shown.current === character) return;
    shown.current = character;
    ref.current?.respawn();
    ref.current?.say(COPY[character].hello);
  }, [character]);

  const selectCharacter = useCallback((name: CharacterName) => {
    setCharacter(name);
    setLight(COPY[name].light);
    setText(COPY[name].defaultText);
  }, []);

  // The page reserves room for the docked sidebar via this attribute (see styles.css).
  // Focus follows the toggle so keyboard users don't get lost – but not on the first render.
  useEffect(() => {
    document.documentElement.dataset.panel = panelOpen ? 'open' : 'closed';
    if (panelTouched.current) (panelOpen ? closeRef : toggleRef).current?.focus();
    panelTouched.current = true;
  }, [panelOpen]);

  // Keyboard shortcuts. Escape always closes the panel; the letters are ignored while typing
  // and for any modifier combination (so browser shortcuts like Cmd+R or Ctrl+D keep working).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPanelOpen(false);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || isEditable(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === 'd') setDebug((d) => !d);
      else if (key === 'p') togglePause(ref.current);
      else if (key === 'r') ref.current?.respawn();
      else if (key === 's') setTimeScale(toggleSlowMo);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const claimed = copy.claimed;
  const onLand = useCallback(
    ({ element }: { element: Element | null }) => {
      if (element instanceof HTMLElement && element.matches('.card .btn')) element.textContent = claimed;
    },
    [claimed],
  );

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
    // Removed props fall back to the defaults in React, so undefined resets the color.
    outlineColor: outlineColor || undefined,
    character: CHARACTERS[character],
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
    character: character !== 'goth' ? new Code(character) : undefined,
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
        phrases={{ ...phrases, landOn: copy.landOn }}
        onStateChange={({ to }) => setState(to)}
        onLand={onLand}
      />
      {/* Remounted per sister, so mascot-made changes ("Claimed.") reset with her copy. */}
      <Page key={character} geist={ref} copy={copy} character={character} onCharacter={selectCharacter} />

      {!panelOpen && (
        <button
          ref={toggleRef}
          type="button"
          className="panel-toggle"
          aria-controls="controls"
          aria-expanded={false}
          onClick={() => setPanelOpen(true)}
          data-pagegeist-ignore
        >
          <span aria-hidden="true">⚙</span> Controls <span className="panel__state">{state ?? '–'}</span>
        </button>
      )}
      <aside id="controls" className="panel" aria-label="Pagegeist controls" hidden={!panelOpen} data-pagegeist-ignore>
        <div className="panel__header">
          <p className="panel__title">
            Controls <span className="panel__state">{state ?? '–'}</span>
          </p>
          <button
            ref={closeRef}
            type="button"
            className="panel__close"
            aria-label="Close controls"
            title="Close (Esc)"
            onClick={() => setPanelOpen(false)}
          >
            ×
          </button>
        </div>
        <div className="panel__body">
          <div className="panel__row">
            <button
              type="button"
              onClick={() => setDebug((d) => !d)}
              title="Show platforms, her hitbox and current plan (key D)"
            >
              Debug
            </button>
            <button
              type="button"
              title="Freeze or unfreeze her – pause() / resume() (key P)"
              onClick={() => togglePause(ref.current)}
            >
              Pause / resume
            </button>
            <button
              type="button"
              onClick={() => ref.current?.respawn()}
              title="Make her drop back into view – respawn() (key R)"
            >
              Summon
            </button>
            <button type="button" onClick={() => setTimeScale(toggleSlowMo)} title="Toggle quarter speed (key S)">
              Slow-mo
            </button>
          </div>
          <p className="panel__hint panel__keys">Keys: {SHORTCUTS}. Hover any control for an explanation.</p>
          <form
            className="panel__row"
            onSubmit={(e) => {
              e.preventDefault();
              ref.current?.say(text);
            }}
          >
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label="Phrase"
              title="Text for her speech bubble"
            />
            <button type="submit" title="Make her say the text – say(text)">
              {copy.sayButton}
            </button>
          </form>

          <fieldset>
            <legend>behaviors</legend>
            {(Object.keys(DEFAULT_BEHAVIORS) as Array<keyof BehaviorOptions>).map((key) => (
              <label key={key} title={HINTS[key]}>
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
            <Select label="character" value={character} options={NAMES} onChange={selectCharacter} />
            <Range label="size" min={48} max={240} step={1} value={size} onChange={setSize} format={(v) => `${v}px`} />
            <Select label="outfit" value={outfit} options={['classic', 'corset']} onChange={setOutfit} />
            <Select label="shoes" value={shoes} options={['boots', 'heels']} onChange={setShoes} />
            <Select label="outline" value={outline} options={['auto', 'always', 'never']} onChange={setOutline} />
            <label title={HINTS.outlineColor}>
              outlineColor
              <input
                type="color"
                value={outlineColor || '#dccdff'}
                onChange={(e) => setOutlineColor(e.target.value)}
                aria-label="Outline color"
              />
              <button
                type="button"
                title="Back to the default outline color"
                onClick={() => setOutlineColor('')}
                disabled={!outlineColor}
              >
                reset
              </button>
            </label>
          </fieldset>

          <fieldset className="panel__lab">
            <legend>placement</legend>
            <Select label="spawn" value={spawn} options={['random', 'left', 'center', 'right']} onChange={setSpawn} />
            <Select label="textLines" value={textLines} options={['all', 'first', 'none']} onChange={setTextLines} />
            <Range label="minWidth" min={0} max={200} step={1} value={minWidth} onChange={setMinWidth} />
            <label title={HINTS.ignore}>
              ignore
              <input type="text" value={ignore} placeholder=".nav, h1" onChange={(e) => setIgnore(e.target.value)} />
            </label>
            <label title={HINTS['safeArea.top']}>
              safeArea.top
              <input
                type="text"
                inputMode="numeric"
                value={safeTop}
                placeholder="auto"
                onChange={(e) => setSafeTop(e.target.value)}
              />
            </label>
            <label title={HINTS['safeArea.bottom']}>
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
                title="Turn on debug drawing and quarter speed together"
                onClick={() => {
                  setDebug(true);
                  setTimeScale(SLOW_MO);
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
              title="Your own phrases for the selected trigger, one per line. Empty = built-in phrases."
              value={customPhrases[trigger] ?? ''}
              placeholder={
                CHARACTERS[character].phrases[trigger].length
                  ? `Built-in (one per line):\n${CHARACTERS[character].phrases[trigger].join('\n')}`
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
          <pre title="Copy & paste: the props for your current settings (only what differs from the defaults)">
            {snippet}
          </pre>
        </div>
      </aside>
    </>
  );
}

const SLOW_MO = 0.25;
const toggleSlowMo = (t: number) => (t === 1 ? SLOW_MO : 1);

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
    <label title={HINTS[label]}>
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
}) {
  return (
    <label title={HINTS[props.label]}>
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
    <label title={HINTS[label]}>
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
/** Rendered as-is in the snippet, e.g. an imported value. */
class Code {
  constructor(readonly code: string) {}
}

function literal(value: unknown): string {
  if (value instanceof Code) return value.code;
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
function BaitButton({ bait }: { bait: PageCopy['bait'] }) {
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
      data-pagegeist-say={bait.say}
      onClick={() => setClicked(true)}
    >
      {clicked ? bait.clicked : bait.label}
    </button>
  );
}

const DOCS_URL = `${REPO_URL}/blob/main/docs`;

/** Every button does something: links into the docs, or a reaction from her. */
/** The big sister switch in the hero: a pair of toggle buttons, mirrored by the panel select. */
function SisterSwitch({ value, onChange }: { value: CharacterName; onChange: (name: CharacterName) => void }) {
  return (
    <fieldset className="sisters">
      <legend className="sisters__label">Pick a sister</legend>
      {NAMES.map((name) => (
        <button
          key={name}
          type="button"
          className="sisters__option"
          aria-pressed={value === name}
          onClick={() => onChange(name)}
        >
          <span aria-hidden="true">{COPY[name].glyph}</span> {COPY[name].label}
        </button>
      ))}
    </fieldset>
  );
}

function Page({
  geist,
  copy,
  character,
  onCharacter,
}: {
  geist: RefObject<PagegeistHandle | null>;
  copy: PageCopy;
  character: CharacterName;
  onCharacter: (name: CharacterName) => void;
}) {
  const say = (text: string) => geist.current?.say(text);
  const summon = (text: string) => {
    geist.current?.respawn();
    say(text);
  };
  return (
    <>
      <nav className="nav">
        <span className="nav__brand">Hollow House</span>
        <div className="nav__links">
          <a className="btn btn--ghost nav__link--wide" href="#how-it-works">
            How it works
          </a>
          <a className="btn btn--ghost" href={`${REPO_URL}/blob/main/docs/guide.md`}>
            Docs
          </a>
          <a className="btn btn--ghost" href={REPO_URL}>
            GitHub
          </a>
        </div>
      </nav>

      <header className="hero">
        <p className="hero__eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p className="hero__sub">{copy.sub}</p>
        <SisterSwitch value={character} onChange={onCharacter} />
        <p className="hero__lead">{copy.lead}</p>
        <div className="hero__actions">
          <a className="btn btn--primary" href={`${REPO_URL}#install`}>
            Get started
          </a>
          <a className="btn" href="#how-it-works">
            How she works
          </a>
          <BaitButton bait={copy.bait} />
        </div>
      </header>

      <main>
        <section className="section" id="how-it-works">
          <h2>How it works</h2>
          <p>
            One transparent canvas lies over the whole page and lets every click through. Only a tiny invisible hitbox
            follows her around, so you can poke her and nothing else breaks. Headings, paragraphs, buttons and cards are
            measured with <code>getBoundingClientRect()</code> and become her floor – paragraphs even line by line.
          </p>
          <p>
            A small state machine picks what's next: stroll, jump to the next element, sit down, dangle off an edge – or
            just stare at your cursor until you feel watched.
          </p>
        </section>

        <section className="cards">
          <article className="card">
            <h2>Platforms</h2>
            <p>
              Every card's top edge is a one-way platform: she jumps up through it and lands on top. Like a cat, minus
              the hair on your keyboard.
            </p>
            <a className="btn btn--small" href={`${DOCS_URL}/guide.md#platforms`}>
              Details
            </a>
          </article>
          <article className="card">
            <h2>Edges</h2>
            <p>Too high to jump? She grabs the edge, hangs there for a dramatic moment and pulls herself up.</p>
            <a className="btn btn--small" href={`${DOCS_URL}/guide.md#what-she-does`}>
              Details
            </a>
          </article>
          <article className="card">
            <h2>Depth</h2>
            <p>
              Contact shadows and depth-sorted limbs fake a third dimension, so she sits on your cards, not in them.
            </p>
            <a className="btn btn--small" href={`${DOCS_URL}/character.md`}>
              Details
            </a>
          </article>
        </section>

        <section className="section section--split">
          <div>
            <h2>Step by step</h2>
            <p>
              Heel strike, roll over the toe, push off: her boots stay planted on every step, and she brakes before she
              arrives. No moonwalking on our watch. Press the buttons to send her up the stairs.
            </p>
          </div>
          <div className="button-stack">
            <button type="button" className="btn" onClick={() => say(copy.steps[0])}>
              First step
            </button>
            <button type="button" className="btn" onClick={() => say(copy.steps[1])}>
              Second step
            </button>
            <button type="button" className="btn btn--primary" onClick={() => summon(copy.steps[2])}>
              Top
            </button>
          </div>
        </section>

        <section className="section">
          <h2>Scroll all you like</h2>
          <p>
            Physics and platforms live in page coordinates, so scrolling never knocks her off. Scroll her out of sight
            and she drops back in from the top a moment later. She never stands under the sticky navigation either – she
            has standards.
          </p>
          <p>
            This paragraph is mostly here to be walked on. Every line of text is a ledge: she can stroll along it, sit
            on its edge or shimmy hand over hand from one end to the other. Long paragraphs make excellent balance
            beams. This one is doing its best.
          </p>
        </section>

        <section className="cards cards--two">
          <article className="card card--tall" data-pagegeist-say={copy.cardSay}>
            <h2>Say something</h2>
            <p>
              Any element can bring its own lines: <code>data-pagegeist-say="This card is mine."</code> – she says them
              when she lands or sits there. Always plain text, never HTML: no ghost in the markup.
            </p>
          </article>
          <article className="card">
            <h2>Events</h2>
            <p>
              Every landing fires <code>pagegeist:land</code> and <code>onLand</code> – handy for small easter eggs.
              This page uses it to let her claim buttons. Summon her and watch.
            </p>
            <button type="button" className="btn btn--small" onClick={() => summon(copy.landDemo)}>
              Try it
            </button>
          </article>
        </section>
      </main>

      <footer className="footer">
        <p>Hollow House · the haunted demo page of Pagegeist</p>
        <p className="footer__note">{copy.footerNote}</p>
      </footer>
    </>
  );
}
