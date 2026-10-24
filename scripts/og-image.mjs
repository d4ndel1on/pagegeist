// Renders playground/public/og-image.jpg (1200×630): both sisters, drawn live by dist/, each on
// her own half of the page. Run `npm run build` first, then `node scripts/og-image.mjs`.
// Deterministic: seeded randomness and Playwright's fake clock. Fonts come from Google Fonts.
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'playground/public/og-image.jpg';
const ORIGIN = 'https://og.local';

const html = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;1,9..144,500&family=Inter:wght@400;500&family=JetBrains+Mono:wght@500&display=block">
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body { position: relative; font-family: Inter, sans-serif; }
  .half { position: absolute; top: 0; bottom: 0; width: 600px; }
  .dark { left: 0; background: radial-gradient(circle at 18% 0%, rgba(166, 120, 230, 0.2), transparent 55%) #0f0c14; }
  .light { right: 0; background: radial-gradient(circle at 82% 0%, rgba(120, 160, 230, 0.22), transparent 55%) #f3f6fb; }
  /* pointer-events: none keeps the text out of her background check (elementFromPoint). */
  .row { position: absolute; left: 0; right: 0; pointer-events: none; display: grid; grid-template-columns: 1fr 1fr; }
  .row > :first-child { text-align: right; padding-right: var(--gap, 0px); color: #ebe6f2; }
  .row > :last-child { text-align: left; padding-left: var(--gap, 0px); color: #161b26; }
  .title { top: 200px; font: 600 136px/1 Fraunces, serif; font-variation-settings: "opsz" 72; letter-spacing: -0.01em; }
  .tagline { top: 366px; --gap: 14px; font: italic 500 40px/1.2 Fraunces, serif; font-variation-settings: "opsz" 36; }
  .tagline > :first-child { color: #c49bff; }
  .tagline > :last-child { color: #3f6fc0; }
  .meta { top: 136px; --gap: 22px; font: 500 22px/1 Inter, sans-serif; }
  .meta > :first-child { color: #c49bff; font-family: 'JetBrains Mono', monospace; font-size: 21px; }
  .meta > :last-child { color: #545e70; }
  .ledge { position: absolute; top: 556px; width: 220px; height: 40px; border-radius: 12px; display: grid; place-items: center; font: 500 17px/1 'JetBrains Mono', monospace; }
  .ledge--goth { left: 64px; color: #a69cb3; background: #19141f; border: 1px solid #2d2537; }
  .ledge--sunny { right: 64px; color: #545e70; background: #ffffff; border: 1px solid #dbe2ee; box-shadow: 0 10px 24px rgba(40, 60, 100, 0.08); }
</style>
</head>
<body>
  <div class="half dark"></div><div class="half light"></div>
  <div class="row meta"><span>npm i @d4ndel1on/pagegeist</span><span>d4ndel1on.github.io/pagegeist</span></div>
  <div class="row title"><span>Page</span><span>geist</span></div>
  <div class="row tagline"><span>Two sisters.</span><span>One haunted page.</span></div>
  <div class="ledge ledge--goth">goth</div><div class="ledge ledge--sunny">sunny</div>
  <script type="module">
    import { createPagegeist, seeded } from './dist/index.js';
    import { sunny } from './dist/sunny.js';
    // Stand still and look at the cursor (parked between them by the script).
    const options = (selector) => ({
      size: 300,
      platforms: { selectors: [selector] },
      safeArea: { top: 0, bottom: 0 },
      behaviors: { walk: false, jump: false, hang: false, sit: false, drop: false, drag: false, poke: false, chatter: false },
    });
    createPagegeist({ ...options('.ledge--goth'), spawn: 174 / 1200, random: seeded(1) });
    createPagegeist({ ...options('.ledge--sunny'), spawn: 1026 / 1200, random: seeded(2), character: sunny });
  </script>
</body>
</html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
  await page.clock.install({ time: 0 });
  await page.route(`${ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (!/^\/dist\/[\w.-]+\.js$/.test(path)) return route.fulfill({ status: 404 });
    return route.fulfill({ contentType: 'text/javascript', body: await readFile(`.${path}`) });
  });
  await page.goto(`${ORIGIN}/`);
  await page.evaluate(() => document.fonts.ready);
  await page.clock.runFor(1500);
  await page.mouse.move(600, 380, { steps: 5 });
  await page.clock.runFor(2000);
  await page.screenshot({ path: OUT, type: 'jpeg', quality: 88, scale: 'css' });
  console.log(`wrote ${OUT}`);
} finally {
  await browser.close();
}
