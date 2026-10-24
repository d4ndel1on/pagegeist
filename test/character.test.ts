import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPagegeist, DEFAULT_PHRASES, goth, type PagegeistInstance } from '../src';
import { Engine } from '../src/core/Engine';
import { resolveOptions } from '../src/core/options';
import { GOTH_PALETTE, GothRenderer } from '../src/core/render/GothRenderer';
import { DEFAULT_LOOK, type Look } from '../src/core/render/types';
import { sunny } from '../src/sunny';
import { fakeCanvas, fakeLoop } from './engine-harness';
import { drawLog, HEIGHT, hash, poseSequence } from './render-helpers';

let instance: PagegeistInstance | null = null;
afterEach(() => {
  instance?.destroy();
  instance = null;
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const LOOKS: Look[] = [DEFAULT_LOOK, { outfit: 'corset', shoes: 'heels', fishnets: true }];
const label = (l: Look) => `${l.outfit}-${l.shoes}-${l.fishnets ? 'fishnets' : 'bare'}`;

function log(look: Look, palette = GOTH_PALETTE): unknown[] {
  const r = new GothRenderer(HEIGHT);
  r.look = { ...look };
  r.palette = palette;
  return drawLog(r, poseSequence());
}

/** The log with every palette color masked, so two palettes give the same log. */
function masked(entries: unknown[], palette: Record<string, string>): string {
  const colors = new Set(Object.values(palette));
  return JSON.stringify(entries.map((e) => (e as unknown[]).map((v) => (colors.has(v as string) ? '<color>' : v))));
}

describe('characters', () => {
  it('defaults to goth', () => {
    expect(resolveOptions({}).character).toBe(goth);
    expect(goth.palette).toBe(GOTH_PALETTE);
    expect(goth.phrases).toBe(DEFAULT_PHRASES);
  });

  it('are frozen', () => {
    for (const c of [goth, sunny]) {
      expect(Object.isFrozen(c)).toBe(true);
      expect(Object.isFrozen(c.palette)).toBe(true);
      expect(Object.isFrozen(c.phrases)).toBe(true);
    }
  });

  it('sunny keeps no goth color', () => {
    const gothColors = new Set(Object.values(GOTH_PALETTE));
    expect(Object.values(sunny.palette).filter((c) => gothColors.has(c))).toEqual([]);
  });

  for (const look of LOOKS) {
    it(`sunny only recolors (${label(look)})`, () => {
      const sunnyLog = log(look, sunny.palette);
      expect(masked(sunnyLog, sunny.palette)).toBe(masked(log(look), GOTH_PALETTE));
      expect(hash(sunnyLog)).toMatchSnapshot();
    });
  }
});

describe('character in the engine', () => {
  const background = (dark: boolean) =>
    vi
      .spyOn(Engine.prototype as unknown as { detectDarkBackground(): boolean }, 'detectDarkBackground')
      .mockReturnValue(dark);
  const outlined = () =>
    vi
      .spyOn(Engine.prototype as unknown as { drawOutlined(...args: unknown[]): void }, 'drawOutlined')
      .mockImplementation(() => {});

  it.each([
    ['goth', goth, true, goth.outline[0]],
    ['goth', goth, false, null],
    ['sunny', sunny, true, sunny.outline[0]],
    ['sunny', sunny, false, sunny.outline[1]],
  ])("'auto' outline follows the character (%s, dark background: %s)", (_, character, dark, color) => {
    const loop = fakeLoop();
    fakeCanvas();
    background(dark);
    const draw = outlined();
    instance = createPagegeist({ character });
    loop.run(5);
    expect(draw.mock.calls.at(-1)?.[5] ?? null).toBe(color);
  });

  it("prefers outlineColor and draws 'always' where the character has none", () => {
    const loop = fakeLoop();
    fakeCanvas();
    background(false);
    const draw = outlined();
    instance = createPagegeist({ outline: 'always' });
    loop.run(2);
    expect(draw.mock.calls.at(-1)?.[5]).toBe(goth.outline[0]);
    instance.update({ character: sunny, outlineColor: 'red' });
    loop.run(2);
    expect(draw.mock.calls.at(-1)?.[5]).toBe('red');
  });

  it('styles the pause button and switches at runtime', () => {
    instance = createPagegeist({ character: sunny, pauseControl: true });
    const button = document.querySelector<HTMLButtonElement>('.pagegeist-pause')!;
    expect(button.style.color).toBe(sunny.bubble[2]);
    instance.update({ character: goth });
    expect(button.style.color).toBe(goth.bubble[2]);
  });
});
