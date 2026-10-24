import type { PagegeistCallbacks, PagegeistEventName, PagegeistInstance, PagegeistOptions } from '@d4ndel1on/pagegeist';
import { expect, type Page, test } from '@playwright/test';

// Smoke tests in real browser engines against the built bundle (dist/), served by e2e/serve.mjs.
// They cover what happy-dom cannot: layout-based platforms, canvas drawing, pointer/touch input,
// media queries and cleanup in an actual page.

type Lib = typeof import('@d4ndel1on/pagegeist');
interface RecordedEvent {
  type: PagegeistEventName;
  /** id of the element she landed on, '' for an element without id, null for the floor. */
  element?: string | null;
}

declare global {
  interface Window {
    pagegeistLib: Lib;
    pg: PagegeistInstance;
    events: RecordedEvent[];
  }
}

/** She stays where she lands – keeps pointer tests from chasing a moving target. */
const STAY = { walk: false, jump: false, hang: false, sit: false, drop: false, chatter: false } as const;

/** Options that survive serialization into the page (no elements, functions or resolvers). */
type JsonOptions = Omit<PagegeistOptions, 'container' | 'random' | 'phrases' | keyof PagegeistCallbacks>;

const errors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', (e) => list.push(e.message));
  page.on('console', (m) => m.type() === 'error' && list.push(m.text()));
  await page.goto('/e2e/fixture/');
  await page.waitForFunction(() => window.pagegeistLib !== undefined);
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page), 'no errors in the page').toEqual([]);
});

/** Creates the mascot from JSON-safe options (seeded, so runs are reproducible) and records all events. */
async function create(page: Page, options: JsonOptions = {}): Promise<void> {
  await page.evaluate((opts: JsonOptions) => {
    const lib = window.pagegeistLib;
    window.events = [];
    window.pg = lib.createPagegeist({ spawn: 0.2, ...opts, random: lib.seeded(7) });
    const names: PagegeistEventName[] = ['stateChange', 'land', 'poke', 'grab', 'release', 'say', 'pause', 'resume'];
    // Untyped listener: one recorder for every event payload.
    const on = window.pg.on.bind(window.pg) as (
      type: PagegeistEventName,
      listener: (e: { element?: Element | null }) => void,
    ) => void;
    for (const type of names) {
      on(type, (e) => {
        const element = 'element' in e ? (e.element ? e.element.id : null) : undefined;
        window.events.push(element === undefined ? { type } : { type, element });
      });
    }
  }, options);
}

const events = (page: Page, type: PagegeistEventName) =>
  page.evaluate((t) => window.events.filter((e) => e.type === t), type);

async function waitForEvent(page: Page, type: PagegeistEventName, timeout = 8000): Promise<void> {
  await page.waitForFunction((t) => window.events.some((e) => e.type === t), type, { timeout });
}

/** Center of her hitbox in viewport coordinates. */
async function hitboxCenter(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('.pagegeist-hitbox').boundingBox();
  if (!box) throw new Error('hitbox not visible');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('falls in and lands on a real element', async ({ page }) => {
  await create(page);
  await page.waitForFunction(() => window.events.some((e) => e.type === 'land' && e.element !== null), null, {
    timeout: 8000,
  });
  await expect(page.locator('.pagegeist canvas')).toHaveAttribute('aria-hidden', 'true');
});

test('draws her on the canvas', async ({ page }) => {
  await create(page, { behaviors: STAY });
  await waitForEvent(page, 'land');
  const painted = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.pagegeist canvas');
    const data = canvas?.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 3; data && i < data.length; i += 4) if ((data[i] ?? 0) > 0) count++;
    return count;
  });
  expect(painted).toBeGreaterThan(500);
});

test('a click pokes her and she answers', async ({ page }) => {
  await create(page, { behaviors: STAY });
  await waitForEvent(page, 'land');
  await page.waitForTimeout(300); // let the landing settle
  const { x, y } = await hitboxCenter(page);
  await page.mouse.click(x, y);
  await waitForEvent(page, 'poke', 2000);
  await waitForEvent(page, 'say', 2000);
});

test('drag and throw: grab, carry, release, land again', async ({ page }) => {
  await create(page, { behaviors: STAY });
  await waitForEvent(page, 'land');
  await page.waitForTimeout(300);
  const { x, y } = await hitboxCenter(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y + 40, { steps: 8 });
  await expect.poll(() => page.evaluate(() => window.pg.state)).toBe('GRABBED');
  await page.mouse.move(x + 160, y + 60, { steps: 8 });
  await page.mouse.up();
  await waitForEvent(page, 'release', 2000);
  const landings = (await events(page, 'land')).length;
  await page.waitForFunction((n) => window.events.filter((e) => e.type === 'land').length > n, landings, {
    timeout: 8000,
  });
  expect(await events(page, 'grab')).toHaveLength(1);
  // No stray text selection after the drag.
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
});

test('a tap pokes her on touch devices @touch', async ({ page }) => {
  await create(page, { behaviors: STAY });
  await waitForEvent(page, 'land');
  await page.waitForTimeout(300);
  const { x, y } = await hitboxCenter(page);
  await page.touchscreen.tap(x, y);
  await waitForEvent(page, 'poke', 2000);
});

test('reduced motion (static): appears on an element and stays put', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await create(page);
  await expect(page.locator('.pagegeist-hitbox')).toBeVisible();
  await page.waitForTimeout(500);
  const before = await hitboxCenter(page);
  await page.waitForTimeout(2500);
  // Blinking and looking around remain, which may shift the hitbox by a pixel – no walking.
  const after = await hitboxCenter(page);
  expect(Math.abs(after.x - before.x)).toBeLessThan(2);
  expect(Math.abs(after.y - before.y)).toBeLessThan(2);
  expect(['IDLE', 'SIT_ON_ELEMENT']).toContain(await page.evaluate(() => window.pg.state));
});

test('pause control: accessible button pauses and resumes', async ({ page }) => {
  await create(page, { pauseControl: true });
  const pause = page.getByRole('button', { name: 'Pause mascot' });
  await pause.click();
  expect(await page.evaluate(() => window.pg.paused)).toBe(true);
  await page.getByRole('button', { name: 'Resume mascot' }).click();
  expect(await page.evaluate(() => window.pg.paused)).toBe(false);
  await waitForEvent(page, 'resume', 1000);
});

test('destroy() leaves the page exactly as it was', async ({ page }) => {
  const snapshot = () => page.evaluate(() => document.body.outerHTML);
  const original = await snapshot();
  await create(page, { markElements: true, pauseControl: true, announce: true });
  await waitForEvent(page, 'land');
  await page.evaluate(() => {
    window.pg.destroy();
    window.pg.destroy(); // idempotent
  });
  expect(await snapshot()).toBe(original);
  expect(await page.evaluate(() => document.documentElement.style.userSelect)).toBe('');
});
