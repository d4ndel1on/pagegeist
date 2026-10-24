import { expect, test } from '@playwright/test';

// The starter apps from examples/starters/ with the packed tarball installed – see
// scripts/build-starters.mjs. Checks the integration claims of the docs end to end: one mascot,
// she lands on the page, no errors or hydration warnings, nothing rendered on the server.

const STARTERS = [
  { name: 'Next.js App Router (production)', url: 'http://localhost:3100/', ssr: true },
  { name: 'Next.js App Router (dev)', url: 'http://localhost:3101/', ssr: true },
  { name: 'Vite (production)', url: 'http://localhost:3200/' },
  { name: 'Vite (dev, HMR client)', url: 'http://localhost:3201/' },
  { name: 'React + Vite (production)', url: 'http://localhost:3300/' },
  { name: 'React + Vite (dev, StrictMode)', url: 'http://localhost:3301/' },
];

declare global {
  interface Window {
    landings: number;
  }
}

for (const { name, url, ssr } of STARTERS) {
  test(name, async ({ page, request }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => (m.type() === 'error' || /hydrat/i.test(m.text())) && errors.push(m.text()));
    // Count landings from the very first frame via the bubbling DOM event.
    await page.addInitScript(() => {
      window.landings = 0;
      document.addEventListener('pagegeist:land', () => window.landings++);
    });

    if (ssr) {
      const html = await (await request.get(url)).text();
      expect(html).toContain('She lives here now.');
      // The RSC payload names the module, but no markup of hers may be rendered on the server.
      expect(html, 'nothing of the mascot is rendered on the server').not.toMatch(/class="pagegeist|<canvas/);
    }

    await page.goto(url);
    await expect(page.getByRole('heading', { name: 'She lives here now.' })).toBeVisible();
    await page.waitForFunction(() => window.landings > 0, null, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Pause mascot' })).toBeVisible();
    // Exactly one mascot, also after StrictMode's double mount and late effects.
    await page.waitForTimeout(500);
    await expect(page.locator('.pagegeist')).toHaveCount(1);
    await expect(page.locator('.pagegeist-hitbox')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}
