import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { seeded } from '../src';
import {
  type OutfitStyle,
  type OutlineMode,
  Pagegeist,
  type PagegeistCallbacks,
  type PagegeistHandle,
  type PagegeistProps,
  type PauseControlOptions,
  type PhraseList,
  type ShoeStyle,
  type TextLineMode,
  type Vec2,
} from '../src/react';

// Compile-time check: the React entry re-exports all public core types.
type ReExported = [
  PagegeistCallbacks,
  OutfitStyle,
  OutlineMode,
  PauseControlOptions,
  PhraseList,
  ShoeStyle,
  TextLineMode,
  Vec2,
];

afterEach(() => {
  document.body.innerHTML = '';
});

/** Renders <Pagegeist /> and returns a rerender helper that keeps the same ref. */
function setup(props: PagegeistProps) {
  const ref = createRef<PagegeistHandle>();
  const view = render(<Pagegeist ref={ref} {...props} />);
  const instance = ref.current?.instance;
  if (!instance) throw new Error('not mounted');
  const update = vi.spyOn(instance, 'update');
  return {
    ref,
    instance,
    update,
    rerender: (next: PagegeistProps) => view.rerender(<Pagegeist ref={ref} {...next} />),
  };
}

describe('<Pagegeist /> declarative props', () => {
  it('re-exports the public core types', () => {
    const reExported: ReExported | null = null;
    expect(reExported).toBeNull();
  });

  it('restores defaults when props are removed', () => {
    const { rerender, update } = setup({ pauseControl: true, debug: true, behaviors: { walk: false } });
    expect(document.querySelector('.pagegeist-pause')).not.toBeNull();
    rerender({});
    expect(document.querySelector('.pagegeist-pause')).toBeNull();
    expect(update).toHaveBeenCalledTimes(1);
    const applied = update.mock.calls[0]?.[0];
    expect(applied?.debug).toBe(false);
    expect(applied?.pauseControl).toBe(false);
    expect(applied?.behaviors?.walk).toBe(true);
  });

  it('stops calling a removed callback', () => {
    const onSay = vi.fn();
    const { ref, rerender } = setup({ onSay });
    act(() => ref.current?.say('One.'));
    expect(onSay).toHaveBeenCalledTimes(1);
    rerender({});
    act(() => ref.current?.say('Two.'));
    expect(onSay).toHaveBeenCalledTimes(1);
  });

  it('does not call update() on unrelated re-renders', () => {
    const { rerender, update } = setup({ behaviors: { sit: false }, phrases: { poke: ['Hey'] }, onLand: () => {} });
    // Fresh but equal objects and a new callback identity.
    rerender({ behaviors: { sit: false }, phrases: { poke: ['Hey'] }, onLand: () => {} });
    rerender({ behaviors: { sit: false }, phrases: { poke: ['Hey'] }, onLand: () => {} });
    expect(update).not.toHaveBeenCalled();
    rerender({ behaviors: { sit: true }, phrases: { poke: ['Hey'] } });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('applies `paused` only when the prop changes', () => {
    const { ref, rerender } = setup({ paused: false });
    act(() => ref.current?.pause());
    rerender({ paused: false, debug: true });
    expect(ref.current?.paused).toBe(true);
    rerender({ paused: true, debug: true });
    expect(ref.current?.paused).toBe(true);
    act(() => ref.current?.resume());
    rerender({ paused: true });
    expect(ref.current?.paused).toBe(false);
    rerender({});
    expect(ref.current?.paused).toBe(false);
    rerender({ paused: true });
    expect(ref.current?.paused).toBe(true);
  });

  it('does not recreate when an inline `random` changes', () => {
    const { ref, instance, rerender } = setup({ random: seeded(1) });
    rerender({ random: seeded(1) });
    rerender({ random: seeded(2) });
    expect(ref.current?.instance).toBe(instance);
  });

  it('keeps handle.on() listeners across recreation and unsubscribes', () => {
    const { ref, instance, rerender } = setup({ size: 100 });
    const listener = vi.fn();
    const off = ref.current?.on('say', listener);
    act(() => ref.current?.say('One.'));
    expect(listener).toHaveBeenCalledTimes(1);
    rerender({ size: 120 });
    expect(ref.current?.instance).not.toBe(instance);
    act(() => ref.current?.say('Two.'));
    expect(listener).toHaveBeenLastCalledWith({ text: 'Two.', trigger: 'api' });
    off?.();
    act(() => ref.current?.say('Three.'));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
