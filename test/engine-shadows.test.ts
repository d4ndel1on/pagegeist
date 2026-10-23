import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPagegeist, type PagegeistInstance } from '../src';
import { Engine } from '../src/core/Engine';
import { drawGroundShadow, drawWallShadow } from '../src/core/render/effects';
import { fakeCanvas, fakeLoop } from './engine-harness';

vi.mock('../src/core/render/effects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/core/render/effects')>();
  return { ...actual, drawGroundShadow: vi.fn(), drawWallShadow: vi.fn() };
});

let instance: PagegeistInstance | null = null;
afterEach(() => {
  instance?.destroy();
  instance = null;
  vi.restoreAllMocks();
  vi.mocked(drawGroundShadow).mockClear();
  vi.mocked(drawWallShadow).mockClear();
  document.body.innerHTML = '';
});

/** Forces the result of the engine's background brightness check. */
const background = (dark: boolean) =>
  vi
    .spyOn(Engine.prototype as unknown as { detectDarkBackground(): boolean }, 'detectDarkBackground')
    .mockReturnValue(dark);

describe('shadows', () => {
  it('are drawn on dark backgrounds', () => {
    const loop = fakeLoop();
    fakeCanvas();
    background(true);
    instance = createPagegeist();
    loop.run(5);
    expect(drawGroundShadow).toHaveBeenCalled();
  });

  it('are not drawn on light backgrounds', () => {
    const loop = fakeLoop();
    fakeCanvas();
    background(false);
    instance = createPagegeist();
    loop.run(5);
    expect(drawGroundShadow).not.toHaveBeenCalled();
    expect(drawWallShadow).not.toHaveBeenCalled();
  });

  it('checks the background independent of the outline option', () => {
    const loop = fakeLoop();
    fakeCanvas();
    const check = background(true);
    instance = createPagegeist({ outline: 'never' });
    loop.run(5);
    expect(check).toHaveBeenCalled();
    expect(drawGroundShadow).toHaveBeenCalled();
  });

  it('follows a change of the background at runtime', () => {
    const loop = fakeLoop();
    fakeCanvas();
    const check = background(true);
    instance = createPagegeist();
    loop.run(3);
    expect(drawGroundShadow).toHaveBeenCalled();
    check.mockReturnValue(false);
    loop.run(40, 20); // > 500 ms: next background check
    vi.mocked(drawGroundShadow).mockClear();
    loop.run(5);
    expect(drawGroundShadow).not.toHaveBeenCalled();
  });
});
