import { act, render } from '@testing-library/react';
import { createRef, StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Pagegeist, type PagegeistHandle } from '../src/react';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('<Pagegeist />', () => {
  it('renders nothing on the server', () => {
    expect(renderToString(<Pagegeist />)).toBe('');
  });

  it('mounts exactly one overlay under StrictMode and cleans up on unmount', () => {
    const { unmount } = render(
      <StrictMode>
        <Pagegeist />
      </StrictMode>,
    );
    expect(document.querySelectorAll('.pagegeist')).toHaveLength(1);
    unmount();
    expect(document.querySelector('.pagegeist')).toBeNull();
  });

  it('exposes an imperative handle', () => {
    const ref = createRef<PagegeistHandle>();
    const onSay = vi.fn();
    render(<Pagegeist ref={ref} onSay={onSay} />);
    act(() => ref.current?.say('Hi.'));
    expect(onSay).toHaveBeenCalledWith({ text: 'Hi.', trigger: 'api' });
    act(() => ref.current?.pause());
    expect(ref.current?.paused).toBe(true);
    expect(ref.current?.instance).not.toBeNull();
  });

  it('uses the latest callback without remounting', () => {
    const ref = createRef<PagegeistHandle>();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Pagegeist ref={ref} onSay={first} />);
    const instance = ref.current?.instance;
    rerender(<Pagegeist ref={ref} onSay={second} />);
    expect(ref.current?.instance).toBe(instance);
    act(() => ref.current?.say('Hi.'));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });

  it('applies live option changes and recreates on structural ones', () => {
    const ref = createRef<PagegeistHandle>();
    const { rerender } = render(<Pagegeist ref={ref} size={168} />);
    const instance = ref.current?.instance;
    rerender(<Pagegeist ref={ref} size={168} pauseControl />);
    expect(document.querySelector('.pagegeist-pause')).not.toBeNull();
    expect(ref.current?.instance).toBe(instance);
    rerender(<Pagegeist ref={ref} size={120} pauseControl />);
    expect(ref.current?.instance).not.toBe(instance);
    expect(document.querySelectorAll('.pagegeist')).toHaveLength(1);
  });
});
