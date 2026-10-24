import type { PlatformOptions, SafeAreaOptions } from './options';
import type { Platform, PlatformKind } from './types';

/** Elements inside this attribute are never platforms (the overlay itself carries it). */
export const IGNORE_ATTRIBUTE = 'data-pagegeist-ignore';

/** Mutation-triggered rescans happen at most this often (React apps mutate a lot). */
const MUTATION_THROTTLE_MS = 150;
/** Text-only mutations (clocks, counters) rarely move platforms: throttle them harder. */
const TEXT_THROTTLE_MS = 500;
/** Fallback poll; backs off to every 3rd tick once a few scans found nothing new. */
const POLL_MS = 800;

export interface Viewport {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Turns visible DOM elements into one-way platforms.
 *
 * All platforms are stored in document space. Full scans are lazy – only when something is
 * dirty (resize, DOM mutation, fonts loaded, fallback poll) – and cover a band of ±2
 * viewports. A pure scroll does not move normal-flow platforms, so scrolling only
 * re-measures elements inside `position: fixed/sticky` (navbars) and the safe area, and
 * filters the band down to ±1 viewport; a full rescan follows once the viewport leaves the
 * band. The mascot finds her platform again via its stable ID and is carried along.
 *
 * The world also measures the "safe area": fixed/sticky bars at the top and bottom of the
 * viewport that would hide her.
 */
export class DomCollisionWorld {
  private platforms: Platform[] = [];
  private byId = new Map<string, Platform>();
  private elementIds = new WeakMap<Element, string>();
  private nextElementId = 0;
  private dirty = true;
  private dirtySince = 0;
  private wait = MUTATION_THROTTLE_MS;
  private urgent = true;
  private scrolled = false;
  /** Last full scan in document order: measured normal-flow platforms or pinned elements. */
  private entries: Array<Platform | Element> = [];
  private scanned = { x: 0, y: 0, w: 0, h: 0 };
  private signature = 0;
  private calm = 0;
  private version = 0;
  private cleanup: Array<() => void> = [];
  private overlayRoot: Element | null = null;
  private insets = { top: 0, bottom: 0 };

  constructor(
    private options: PlatformOptions,
    private safeArea: SafeAreaOptions,
  ) {}

  /** Increases whenever the platform list is rebuilt (rescan or scroll refresh). */
  get revision(): number {
    return this.version;
  }

  get all(): readonly Platform[] {
    return this.platforms;
  }

  get(id: string | null): Platform | null {
    return id ? (this.byId.get(id) ?? null) : null;
  }

  /** Visible viewport in document space. */
  viewport(): Viewport {
    const left = window.scrollX;
    const top = window.scrollY;
    return { left, top, right: left + document.documentElement.clientWidth, bottom: top + window.innerHeight };
  }

  /** Viewport minus fixed/sticky bars, in document space. */
  safeViewport(): Viewport {
    const v = this.viewport();
    return { ...v, top: v.top + this.insets.top, bottom: v.bottom - this.insets.bottom };
  }

  configure(options: PlatformOptions, safeArea: SafeAreaOptions): void {
    this.options = options;
    this.safeArea = safeArea;
    this.markDirty();
  }

  start(overlayRoot: Element): void {
    this.overlayRoot = overlayRoot;
    const mark = () => this.markDirty();
    const scroll = () => {
      this.scrolled = true;
    };
    const visible = () => {
      if (!document.hidden) mark();
    };
    const opts: AddEventListenerOptions = { passive: true };
    window.addEventListener('scroll', scroll, opts);
    document.addEventListener('visibilitychange', visible);
    this.cleanup.push(() => {
      window.removeEventListener('scroll', scroll);
      document.removeEventListener('visibilitychange', visible);
    });

    const ro = new ResizeObserver(mark);
    ro.observe(document.documentElement);
    this.cleanup.push(() => ro.disconnect());

    const mo = new MutationObserver((records) => {
      // Ignore mutations inside the overlay itself (hitbox styles etc.).
      if (records.every((r) => overlayRoot.contains(r.target))) return;
      // Text changes can still reflow lines, so they count – just less often.
      const textOnly = records.every((r) => r.type === 'characterData');
      this.markDirty(false, textOnly ? TEXT_THROTTLE_MS : MUTATION_THROTTLE_MS);
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    this.cleanup.push(() => mo.disconnect());

    let active = true;
    this.cleanup.push(() => {
      active = false;
    });
    document.fonts?.ready
      .then(() => {
        if (active) mark();
      })
      .catch(() => undefined);

    // Fallback for layout changes without an event (CSS transitions, animations, …).
    // Paused in background tabs (rescans on return), slower while nothing changes.
    let tick = 0;
    const interval = window.setInterval(() => {
      if (!document.hidden && (this.calm < 4 || ++tick % 3 === 0)) this.markDirty(false);
    }, POLL_MS);
    this.cleanup.push(() => window.clearInterval(interval));
  }

  stop(): void {
    for (const fn of this.cleanup) fn();
    this.cleanup = [];
    this.overlayRoot = null;
  }

  /** `urgent = false` lets the rescan be throttled by `wait` ms (mutations and polling). */
  markDirty(urgent: boolean = true, wait: number = MUTATION_THROTTLE_MS): void {
    if (!this.dirty) {
      this.dirtySince = performance.now();
      this.wait = wait;
    } else this.wait = Math.min(this.wait, wait);
    this.dirty = true;
    this.urgent ||= urgent;
  }

  /** Call once per frame (read phase). Returns true if the platforms were updated. */
  update(now: number = performance.now()): boolean {
    const scrolled = this.scrolled;
    this.scrolled = false;
    const s = this.scanned;
    if (scrolled && (Math.abs(window.scrollY - s.y) > s.h || Math.abs(window.scrollX - s.x) > s.w)) {
      this.markDirty(false); // viewport left the scanned band
    }
    if (this.dirty && (this.urgent || now - this.dirtySince >= this.wait)) {
      this.dirty = false;
      this.urgent = false;
      this.scan();
      return true;
    }
    if (scrolled) this.refresh();
    return scrolled;
  }

  /** Highest platform whose top edge is at or below y and that covers x. */
  platformBelow(x: number, y: number, exclude?: string): Platform | null {
    let best: Platform | null = null;
    for (const p of this.platforms) {
      if (p.id === exclude || x < p.left || x > p.right || p.top < y - 0.5) continue;
      if (!best || p.top < best.top) best = p;
    }
    return best;
  }

  private isIgnored(el: Element): boolean {
    if (el.closest(`[${IGNORE_ATTRIBUTE}]`)) return true;
    for (const selector of this.options.ignore) {
      try {
        if (el.closest(selector)) return true;
      } catch {
        // Invalid selector from user config – skip it.
      }
    }
    return false;
  }

  /** Full scan: measures all matching elements within ±2 viewports. */
  private scan(): void {
    const { selectors } = this.options;
    const x = window.scrollX;
    const y = window.scrollY;
    const w = document.documentElement.clientWidth;
    const h = window.innerHeight;

    let elements: NodeListOf<Element> | Element[] = [];
    try {
      elements = selectors.length ? document.querySelectorAll(selectors.join(',')) : [];
    } catch {
      elements = []; // invalid selector list
    }

    const entries: Array<Platform | Element> = [];
    const pinned = new Map<Element, boolean>();
    for (const el of elements) {
      if (this.isIgnored(el) || !isVisible(el)) continue;
      const box = el.getBoundingClientRect();
      // Cheap pre-filter before line measurement and style lookups.
      if (!near(box, 0, 0, w, h, 2)) continue;
      if (isPinned(el, pinned)) entries.push(el);
      else this.measure(el, box, entries, 2, x, y);
    }

    let signature = entries.length;
    for (const p of entries) if (!(p instanceof Element)) signature += p.left + 3 * p.top + 7 * p.right + 13 * p.bottom;
    this.calm = signature === this.signature ? this.calm + 1 : 0;
    this.signature = signature;
    this.entries = entries;
    this.scanned = { x, y, w, h };
    this.refresh();
  }

  /** Cheap update (also after scrolling): safe area, pinned elements, ±1 viewport, floor. */
  private refresh(): void {
    const sx = window.scrollX;
    const sy = window.scrollY;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    this.insets = {
      top: this.measureInset('top', vw, vh),
      bottom: this.measureInset('bottom', vw, vh),
    };

    const out: Platform[] = [];
    for (const e of this.entries) {
      if (e instanceof Element) this.measure(e, e.getBoundingClientRect(), out, 1, sx, sy);
      else if (near(e, sx, sy, vw, vh, 1)) out.push(e);
    }

    // Virtual floor = bottom of the (safe) viewport. Moves along while scrolling.
    const floorTop = sy + vh - this.insets.bottom;
    out.push({
      id: 'floor',
      kind: 'floor',
      element: null,
      left: sx,
      right: sx + vw,
      top: floorTop,
      bottom: floorTop + 1,
      hangable: false,
      sittable: false,
    });

    this.platforms = out;
    this.byId = new Map(out.map((p) => [p.id, p]));
    this.version++;
  }

  /** Pushes the platforms of one element (viewport rect `box`) lying within `k` viewports. */
  private measure(el: Element, box: Rectish, out: Array<Platform | Element>, k: number, sx: number, sy: number): void {
    const { minWidth, textLines } = this.options;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const id = this.idFor(el);
    const kind = kindFor(el);
    const push = (pid: string, r: Rectish) => {
      if (r.width < minWidth || r.height < 2 || !near(r, 0, 0, vw, vh, k)) return;
      out.push({
        id: pid,
        kind,
        element: el,
        left: r.left + sx,
        right: r.right + sx,
        top: r.top + sy,
        bottom: r.bottom + sy,
        hangable: true,
        sittable: true,
      });
    };

    // Text: walk on the rendered text, not on the block box – a heading's box usually
    // spans the full column even if the text is short. Falls back to the box if no text.
    if (kind === 'text-line' || kind === 'heading') {
      const lines = lineRects(el);
      if (lines.length) {
        if (kind === 'text-line' && textLines === 'none') {
          push(id, unionRect(lines));
        } else {
          const count = kind === 'text-line' && textLines === 'first' ? 1 : lines.length;
          for (let i = 0; i < count; i++) push(`${id}:L${i}`, lines[i]!);
        }
        return;
      }
    }
    push(id, box);
  }

  /** Height of fixed/sticky bars glued to the top or bottom viewport edge. */
  private measureInset(edge: 'top' | 'bottom', vw: number, vh: number): number {
    const configured = this.safeArea[edge];
    if (configured !== 'auto') return Math.max(0, configured);
    if (typeof document.elementsFromPoint !== 'function') return 0;

    const y = edge === 'top' ? 2 : vh - 2;
    let inset = 0;
    for (const fx of [0.08, 0.5, 0.92]) {
      const hit = document
        .elementsFromPoint(vw * fx, y)
        .find((el) => !this.overlayRoot?.contains(el) && el !== document.documentElement && el !== document.body);
      let el: Element | null = hit ?? null;
      for (let depth = 0; el && el !== document.body && depth < 12; depth++, el = el.parentElement) {
        const position = getComputedStyle(el).position;
        if (position !== 'fixed' && position !== 'sticky') continue;
        const r = el.getBoundingClientRect();
        if (r.height > vh * 0.4) break; // a full-height wrapper is not a bar
        if (edge === 'top' && r.top <= 1) inset = Math.max(inset, r.bottom);
        if (edge === 'bottom' && r.bottom >= vh - 1) inset = Math.max(inset, vh - r.top);
        break;
      }
    }
    return inset;
  }

  private idFor(el: Element): string {
    let id = this.elementIds.get(el);
    if (!id) {
      id = `e${this.nextElementId++}`;
      this.elementIds.set(el, id);
    }
    return id;
  }
}

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface Rectish extends Box {
  width: number;
  height: number;
}

/** Whether a box lies within `k` viewport heights above/below and `k - 1` widths beside (x, y). */
function near(r: Box, x: number, y: number, vw: number, vh: number, k: number): boolean {
  return r.bottom >= y - k * vh && r.top <= y + (k + 1) * vh && r.right >= x - (k - 1) * vw && r.left <= x + k * vw;
}

/** Whether the element moves with the viewport (inside position fixed/sticky). Memoized per scan. */
function isPinned(el: Element | null, memo: Map<Element, boolean>): boolean {
  if (!el || el === document.body) return false;
  let pinned = memo.get(el);
  if (pinned === undefined) {
    const position = getComputedStyle(el).position;
    pinned = position === 'fixed' || position === 'sticky' || isPinned(el.parentElement, memo);
    memo.set(el, pinned);
  }
  return pinned;
}

function unionRect(rects: readonly Rectish[]): Rectish {
  const left = Math.min(...rects.map((r) => r.left));
  const right = Math.max(...rects.map((r) => r.right));
  const top = rects[0]!.top;
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

function kindFor(el: Element): PlatformKind {
  if (el.matches('h1, h2, h3, h4')) return 'heading';
  if (el.matches('button, .btn, [role="button"]')) return 'button';
  if (el.matches('.card')) return 'card';
  if (el.matches('p')) return 'text-line';
  return 'generic';
}

function isVisible(el: Element): boolean {
  const withCheck = el as Element & { checkVisibility?: (o?: object) => boolean };
  if (withCheck.checkVisibility) return withCheck.checkVisibility({ visibilityProperty: true, opacityProperty: true });
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/**
 * Splits a text block into line rectangles. A Range's getClientRects() yields one rect
 * per inline fragment – these are merged into lines (similar top). The standing surface
 * is moved slightly below the line top (roughly cap height) so she visually stands on the
 * letters instead of in the line gap.
 */
function lineRects(el: Element): Rectish[] {
  const range = document.createRange();
  range.selectNodeContents(el);
  const rects = Array.from(range.getClientRects())
    .filter((r) => r.width > 1 && r.height > 1)
    .sort((a, b) => a.top - b.top);

  const lines: Rectish[] = [];
  for (const r of rects) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(r.top - last.top) < last.height * 0.5) {
      last.left = Math.min(last.left, r.left);
      last.right = Math.max(last.right, r.right);
      last.width = last.right - last.left;
      continue;
    }
    lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height });
  }
  for (const l of lines) l.top += l.height * 0.2;
  return lines;
}
