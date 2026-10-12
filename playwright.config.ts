import { defineConfig, devices } from '@playwright/test';

/**
 * 4173 unless E2E_PORT says otherwise: two checkouts on one machine (a
 * worktree beside the main one) each need their own preview, and reusing
 * the other's server would test the other's code.
 */
const PORT = process.env['E2E_PORT'] ?? '4173';
const ORIGIN = `http://127.0.0.1:${PORT}`;

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
    baseURL: ORIGIN,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // The service worker would answer requests the tests mean to watch go to
    // the server; tests/e2e/offline-app.spec.ts turns it on and tests it.
    serviceWorkers: 'block',
  },
  webServer: {
    command: PORT === '4173' ? 'npm run build && npm run preview' : `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `${ORIGIN}/`,
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
