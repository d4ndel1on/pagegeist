import { describe, expect, it, vi } from 'vitest';
import type { PhraseContext } from '../src/core/options';
import { DEFAULT_PHRASES, resolvePhrase, SAY_ATTRIBUTE } from '../src/core/phrases';
import { createRandom } from '../src/core/random';
import { wrapText } from '../src/core/render/effects';

const rng = createRandom(() => 0);
const ctx = (trigger: PhraseContext['trigger'], element: Element | null = null): PhraseContext => ({
  trigger,
  element,
  state: 'IDLE',
});

describe('resolvePhrase', () => {
  it('falls back to the built-in phrases', () => {
    expect(resolvePhrase({}, ctx('poke'), rng)).toBe(DEFAULT_PHRASES.poke[0]);
  });

  it('is silent for landings by default', () => {
    expect(resolvePhrase({}, ctx('land', document.createElement('div')), rng)).toBeNull();
  });

  it('replaces a trigger list and lets an empty list silence it', () => {
    expect(resolvePhrase({ poke: ['Custom'] }, ctx('poke'), rng)).toBe('Custom');
    expect(resolvePhrase({ poke: [] }, ctx('poke'), rng)).toBeNull();
  });

  it('matches landOn selectors and skips invalid ones', () => {
    const el = document.createElement('button');
    el.className = 'cta';
    const map = { landOn: { '[[invalid': ['nope'], '.cta': ['Buy it.'] } };
    expect(resolvePhrase(map, ctx('land', el), rng)).toBe('Buy it.');
  });

  it('prefers the data attribute on the element', () => {
    const parent = document.createElement('section');
    parent.setAttribute(SAY_ATTRIBUTE, 'From the attribute | second');
    const el = document.createElement('p');
    parent.append(el);
    expect(resolvePhrase({ landOn: { p: ['From config'] } }, ctx('land', el), rng)).toBe('From the attribute');
  });

  it('supports resolver functions (string, list, null, undefined)', () => {
    expect(resolvePhrase(() => 'Hallo', ctx('poke'), rng)).toBe('Hallo');
    expect(resolvePhrase(() => ['Eins', 'Zwei'], ctx('poke'), rng)).toBe('Eins');
    expect(resolvePhrase(() => null, ctx('poke'), rng)).toBeNull();
    expect(resolvePhrase(() => undefined, ctx('poke'), rng)).toBe(DEFAULT_PHRASES.poke[0]);
  });

  it('stays silent and logs when a resolver function throws', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const resolver = () => {
      throw new Error('boom');
    };
    expect(resolvePhrase(resolver, ctx('poke'), rng)).toBeNull();
    expect(error).toHaveBeenCalledWith('pagegeist: error in phrase resolver', expect.any(Error));
    error.mockRestore();
  });

  it('freezes the built-in phrase table', () => {
    expect(Object.isFrozen(DEFAULT_PHRASES)).toBe(true);
  });

  it('never interprets phrases as markup', () => {
    const evil = '<img src=x onerror=alert(1)>';
    expect(resolvePhrase({ poke: [evil] }, ctx('poke'), rng)).toBe(evil);
  });
});

describe('wrapText', () => {
  const measure = (s: string) => s.length * 10;

  it('keeps short text on one line', () => {
    expect(wrapText(measure, 'Hey.', 100)).toEqual(['Hey.']);
  });

  it('wraps at word boundaries', () => {
    expect(wrapText(measure, 'one two three four', 100)).toEqual(['one two', 'three four']);
  });

  it('breaks overlong words (e.g. CJK runs) by character', () => {
    expect(wrapText(measure, 'abcdefghijkl', 50)).toEqual(['abcde', 'fghij', 'kl']);
  });

  it('respects explicit line breaks', () => {
    expect(wrapText(measure, 'a\nb', 100)).toEqual(['a', 'b']);
  });
});
