import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PLATFORMS } from '../src/core/options';
import { DomCollisionWorld } from '../src/core/World';

const rect = (left: number, top: number, width: number, height: number): DOMRect =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function scan(textLines: 'all' | 'first' | 'none' = 'all') {
  // happy-dom has no layout: give the viewport a width.
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1280);
  const world = new DomCollisionWorld({ ...DEFAULT_PLATFORMS, textLines }, { top: 0, bottom: 0 });
  world.update();
  return world.all.filter((p) => p.kind !== 'floor');
}

describe('DomCollisionWorld', () => {
  it('uses the rendered text width of headings, not the full-width block box', () => {
    document.body.innerHTML = '<h2>How it works</h2>';
    const h2 = document.querySelector('h2')!;
    vi.spyOn(h2, 'getBoundingClientRect').mockReturnValue(rect(40, 100, 900, 40));
    vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue([rect(40, 100, 220, 40)] as unknown as DOMRectList);
    const [platform] = scan();
    expect(platform?.kind).toBe('heading');
    expect(platform?.left).toBe(40);
    expect(platform?.right).toBe(260);
  });

  it('falls back to the element box when there is no text', () => {
    document.body.innerHTML = '<h2></h2>';
    const h2 = document.querySelector('h2')!;
    vi.spyOn(h2, 'getBoundingClientRect').mockReturnValue(rect(40, 100, 300, 40));
    vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue([] as unknown as DOMRectList);
    expect(scan()[0]?.right).toBe(340);
  });

  it('spans only the text when paragraphs are not split into lines', () => {
    document.body.innerHTML = '<p>Two lines</p>';
    const p = document.querySelector('p')!;
    vi.spyOn(p, 'getBoundingClientRect').mockReturnValue(rect(0, 200, 900, 60));
    vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue([
      rect(10, 200, 500, 25),
      rect(10, 230, 300, 25),
    ] as unknown as DOMRectList);
    expect(scan('all')).toHaveLength(2);
    const [block] = scan('none');
    expect([block?.left, block?.right]).toEqual([10, 510]);
  });
});
