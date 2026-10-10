import { defineConfig, devices } from '@playwright/test';

/**
 * The e2e tests run against the BUILT site served by `vite preview`, with the
 * production headers from app/public/_headers applied. That is deliberate: the
 * Content-Security-Policy on the tool pages is the proof that nothing leaves
 * the device, and a policy nobody runs the tests under is a policy nobody has
 * checked. Dev mode would need the policy relaxed (Vite's HMR injects inline
 * styles), so dev mode is not what we test.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'tests/output/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  // Four CPUs here; the ops run in workers inside each browser, so two
  // parallel browsers is plenty and keeps timing honest.
  workers: process.env['CI'] ? 2 : 2,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
  projects: [
    {
      // The target device first: a cheap Android at 360px wide.
      name: 'phone',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 360, height: 780 },
        // The preinstalled browser is Chromium; Pixel 5 asks for the Chrome channel.
        channel: undefined,
      },
    },
    {
      name: 'laptop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 }, channel: undefined },
    },
  ],
});
