import { defineConfig, devices } from '@playwright/test';

/**
 * The starter apps in examples/starters/ with the packed tarball installed
 * (`npm run build && node scripts/build-starters.mjs` first). Production builds and dev servers –
 * the dev servers are where React StrictMode mounts twice.
 */
const starter = (name: string, command: string, port: number) => ({
  command: `${command} --port ${port}`,
  cwd: `examples/starters/${name}`,
  url: `http://localhost:${port}/`,
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
  env: { NEXT_TELEMETRY_DISABLED: '1' },
});

export default defineConfig({
  testDir: 'e2e',
  testMatch: 'starters.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
  webServer: [
    starter('next', 'npx next start', 3100),
    // The starter's own dev script, exactly as people run it.
    starter('next', 'npm run dev --', 3101),
    starter('vite', 'npx vite preview --strictPort', 3200),
    starter('vite', 'npx vite --strictPort', 3201),
    starter('react', 'npx vite preview --strictPort', 3300),
    starter('react', 'npx vite --strictPort', 3301),
  ],
});
