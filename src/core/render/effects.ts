/**
 * 2.5D effects that are independent of the character renderer:
 * ground shadow (depth via distance) and wall shadow (mascot hangs *in front of* the element).
 */

/** Soft contact shadow. `distance` = feet → surface below. */
export function drawGroundShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  distance: number,
  scale: number,
): void {
  const t = Math.min(1, Math.max(0, distance) / (380 * scale));
  const alpha = 0.34 * (1 - t);
  if (alpha <= 0.01) return;
  const s = scale * (1 - t * 0.55);
  // Light from the top left → the shadow moves right with height
  const cx = x + distance * 0.12;
  const rx = 21 * s;
  const ry = 5 * s;
  const g = ctx.createRadialGradient(cx, y, 0, cx, y, rx);
  g.addColorStop(0, `rgba(8, 4, 14, ${alpha})`);
  g.addColorStop(1, 'rgba(8, 4, 14, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Shadow on the element surface behind the figure (while hanging/climbing). */
export function drawWallShadow(ctx: CanvasRenderingContext2D, x: number, y: number, height: number): void {
  const cx = x + 7;
  const cy = y - height * 0.45 + 5;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, height * 0.55);
  g.addColorStop(0, 'rgba(8, 4, 14, 0.22)');
  g.addColorStop(1, 'rgba(8, 4, 14, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, height * 0.2, height * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
}

const BUBBLE_FONT =
  '600 13px ui-rounded, system-ui, -apple-system, "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", "Noto Sans CJK", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"';
const BUBBLE_MAX_WIDTH = 220;
const LINE_HEIGHT = 17;

/** Greedy word wrap; words longer than a line (e.g. CJK runs) are broken per character. */
export function wrapText(measure: (s: string) => number, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const token of paragraph.split(/(\s+)/)) {
      if (!token) continue;
      if (measure(line + token) <= maxWidth) {
        line += token;
        continue;
      }
      if (line.trim()) lines.push(line.trimEnd());
      line = '';
      if (/^\s+$/.test(token)) continue;
      if (measure(token) <= maxWidth) {
        line = token;
        continue;
      }
      // Single overlong word: break it up by characters.
      for (const ch of Array.from(token)) {
        if (line && measure(line + ch) > maxWidth) {
          lines.push(line);
          line = '';
        }
        line += ch;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/** Last wrapped bubble – the text rarely changes, so wrapping/measuring runs once per phrase. */
let bubbleCache: { text: string; maxWidth: number; lines: string[]; width: number } | null = null;

/** Wrapped lines and their widest width, cached per (text, maxWidth). */
export function bubbleLayout(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number = BUBBLE_MAX_WIDTH,
): { lines: string[]; width: number } {
  const c = bubbleCache;
  if (c && c.text === text && c.maxWidth === maxWidth) return c;
  ctx.font = BUBBLE_FONT;
  const measure = (s: string) => ctx.measureText(s).width;
  const lines = wrapText(measure, text, maxWidth);
  bubbleCache = { text, maxWidth, lines, width: Math.max(...lines.map(measure)) };
  return bubbleCache;
}

/**
 * Speech bubble drawn on the canvas. Text is only ever passed to fillText – it is never
 * parsed as HTML, so phrases cannot inject markup. The bubble stays inside the viewport,
 * whose width is derived from the canvas size and transform scale – unlike `clientWidth`,
 * that never forces a layout.
 */
export function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  alpha: number,
): void {
  ctx.globalAlpha = alpha;
  const padX = 10;
  const padY = 5;
  ctx.font = BUBBLE_FONT;
  const { lines, width } = bubbleLayout(ctx, text);
  const w = Math.ceil(width) + padX * 2;
  const h = lines.length * LINE_HEIGHT + padY * 2 + 2;
  const vw = ctx.canvas.width / (ctx.getTransform?.().a || 1);
  const left = Math.max(6, Math.min(x - w / 2, vw - w - 6));
  const top = Math.max(6, y - h - 10);
  ctx.fillStyle = 'rgba(18, 13, 24, 0.92)';
  ctx.strokeStyle = 'rgba(190, 150, 255, 0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(left, top, w, h, 10);
  else {
    // Fallback for browsers without roundRect (Chrome < 99, Safari < 16, Firefox < 112).
    const r = 10;
    const right = left + w;
    const bottom = top + h;
    ctx.moveTo(left + r, top);
    ctx.arcTo(right, top, right, bottom, r);
    ctx.arcTo(right, bottom, left, bottom, r);
    ctx.arcTo(left, bottom, left, top, r);
    ctx.arcTo(left, top, right, top, r);
    ctx.closePath();
  }
  const tipX = Math.max(left + 12, Math.min(x, left + w - 12));
  ctx.moveTo(tipX - 5, top + h);
  ctx.lineTo(tipX, top + h + 7);
  ctx.lineTo(tipX + 5, top + h);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f2ecff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i]!, left + w / 2, top + padY + 1 + LINE_HEIGHT * (i + 0.5));
  }
}
