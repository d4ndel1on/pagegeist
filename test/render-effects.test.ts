import { describe, expect, it } from 'vitest';
import { bubbleLayout, drawGroundShadow, drawSpeechBubble, drawWallShadow, wrapText } from '../src/core/render/effects';
import { recordingContext } from './render-helpers';

const calls = (log: unknown[], name: string) => log.filter((l) => (l as unknown[])[0] === name) as unknown[][];
const sets = (log: unknown[], prop: string) =>
  log.filter((l) => (l as unknown[])[0] === '=' && (l as unknown[])[1] === prop).map((l) => (l as unknown[])[2]);

describe('shadows', () => {
  it('fades the ground shadow with distance', () => {
    const near = recordingContext();
    drawGroundShadow(near.ctx, 100, 200, 0, 1);
    expect(calls(near.log, 'ellipse')[0]).toEqual(['ellipse', 100, 200, 21, 5, 0, 0, Math.round(Math.PI * 2e6) / 1e6]);
    expect(calls(near.log, 'grad.addColorStop')[0]).toEqual(['grad.addColorStop', 0, 'rgba(8, 4, 14, 0.34)']);
    const far = recordingContext();
    drawGroundShadow(far.ctx, 100, 200, 1000, 1);
    expect(far.log).toEqual([]);
  });

  it('draws the wall shadow behind the figure', () => {
    const { ctx, log } = recordingContext();
    drawWallShadow(ctx, 100, 300, 100);
    expect(calls(log, 'ellipse')[0]?.slice(1, 5)).toEqual([107, 260, 20, 55]);
  });
});

describe('wrapText', () => {
  const measure = (s: string) => s.length * 10;

  it('wraps greedily at whitespace and keeps explicit line breaks', () => {
    expect(wrapText(measure, 'aa bb cc dd', 50)).toEqual(['aa bb', 'cc dd']);
    expect(wrapText(measure, 'one\ntwo', 500)).toEqual(['one', 'two']);
  });

  it('breaks overlong words per character', () => {
    expect(wrapText(measure, 'abcdefgh', 30)).toEqual(['abc', 'def', 'gh']);
    expect(wrapText(measure, '日本語のテキスト', 30)).toEqual(['日本語', 'のテキ', 'スト']);
  });
});

describe('speech bubble', () => {
  it('measures a phrase once and reuses the wrapped lines every frame', () => {
    const { ctx, log } = recordingContext();
    const text = `cached bubble ${Math.random()}`;
    for (let i = 0; i < 5; i++) drawSpeechBubble(ctx, 400, 300, text, 1);
    const measured = calls(log, 'measureText').length;
    expect(measured).toBeGreaterThan(0);
    const again = recordingContext();
    drawSpeechBubble(again.ctx, 400, 300, text, 1);
    expect(calls(again.log, 'measureText')).toHaveLength(0);
    expect(calls(again.log, 'fillText')).toHaveLength(calls(log, 'fillText').length / 5);
    // A new phrase or width is laid out afresh.
    const other = recordingContext();
    bubbleLayout(other.ctx, text, undefined, 50);
    expect(calls(other.log, 'measureText').length).toBeGreaterThan(0);
  });

  it('wraps long phrases into several centred lines', () => {
    const { ctx, log } = recordingContext();
    drawSpeechBubble(ctx, 400, 300, 'a fairly long phrase that will certainly not fit into a single line', 0.5);
    const lines = calls(log, 'fillText');
    expect(lines.length).toBeGreaterThan(1);
    expect(new Set(lines.map((l) => l[2])).size).toBe(1); // same centre x
    expect(sets(log, 'globalAlpha')).toEqual([0.5]);
    expect(lines.map((l) => l[1]).join(' ')).toBe(
      'a fairly long phrase that will certainly not fit into a single line',
    );
  });

  it('uses roundRect when available', () => {
    const { ctx, log } = recordingContext();
    drawSpeechBubble(ctx, 400, 300, 'hi', 1);
    expect(calls(log, 'roundRect')).toHaveLength(1);
    expect(calls(log, 'arcTo')).toHaveLength(0);
  });

  it('falls back to arcTo without roundRect (older browsers)', () => {
    const { ctx, log } = recordingContext(['roundRect']);
    drawSpeechBubble(ctx, 400, 300, 'hi', 1);
    const arcs = calls(log, 'arcTo');
    expect(arcs).toHaveLength(4);
    expect(arcs.every((a) => a[5] === 10)).toBe(true);
    expect(calls(log, 'fill')).toHaveLength(1);
    expect(calls(log, 'stroke')).toHaveLength(1);
  });

  it('keeps the bubble inside the view width without reading layout', () => {
    // Canvas 800 device px at scale 1 → 800 CSS px; bubble near the right edge is pushed in.
    const { ctx, log } = recordingContext();
    drawSpeechBubble(ctx, 795, 300, 'edge', 1);
    const [, left, , w] = calls(log, 'roundRect')[0] as number[];
    expect(left! + w!).toBe(800 - 6);
    // An explicit view width wins.
    const narrow = recordingContext();
    drawSpeechBubble(narrow.ctx, 795, 300, 'edge', 1, 300);
    const [, l2, , w2] = calls(narrow.log, 'roundRect')[0] as number[];
    expect(l2! + w2!).toBe(300 - 6);
    // And it never leaves the left edge.
    const left0 = recordingContext();
    drawSpeechBubble(left0.ctx, 0, 300, 'edge', 1);
    expect((calls(left0.log, 'roundRect')[0] as number[])[1]).toBe(6);
  });

  it('divides the canvas width by the transform scale (device pixel ratio)', () => {
    const { ctx, log } = recordingContext();
    const scaled = new Proxy(ctx, {
      get: (t, k) => (k === 'getTransform' ? () => ({ a: 2 }) : Reflect.get(t, k)),
    });
    drawSpeechBubble(scaled, 795, 300, 'edge', 1);
    const [, left, , w] = calls(log, 'roundRect')[0] as number[];
    expect(left! + w!).toBe(400 - 6);
  });
});
