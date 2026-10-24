import { defineConfig, devices } from '@playwright/test';

/** Browser smoke tests against the built bundle (`npm run build` first). */
export default defineConfig({
  testDir: 'e2e',
  testMatch: 'smoke.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, grepInvert: /@touch/ },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, grepInvert: /@touch/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, grepInvert: /@touch/ },
    // Touch input: iOS Safari's engine and Chrome on Android.
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] }, grep: /@touch/ },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] }, grep: /@touch/ },
  ],
  webServer: {
    command: 'node e2e/serve.mjs 4173',
    url: 'http://localhost:4173/e2e/fixture/',
    reuseExistingServer: !process.env.CI,
  },
});
