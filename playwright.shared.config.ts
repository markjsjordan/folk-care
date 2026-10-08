import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright override config for running specs against the ALREADY-RUNNING
 * shared dev servers (API :3000, web :5173) instead of spinning up an
 * isolated webServer/test-database stack.
 *
 * This repo's default playwright.config.ts starts its own webServer and a
 * dedicated folkcare_e2e_test Postgres database via globalSetup. In this
 * session that isolated stack conflicts with the shared dev servers already
 * running in the background (and has previously caused OOM / exit 137 when
 * both stacks run concurrently), and the test DB migration is currently
 * broken in this environment ("role postgres does not exist").
 *
 * This file is test infrastructure only — no production code is touched.
 * Usage: npx playwright test -c playwright.shared.config.ts <spec> --workers=1
 */
export default defineConfig({
  testDir: './e2e/tests',
  timeout: 30000,
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  workers: 1,

  reporter: [['list']],

  use: {
    // Shared Vite dev server, not the API server directly — matches how a
    // real user/browser hits the app (web proxies/calls the API).
    baseURL: process.env['E2E_BASE_URL'] || 'http://localhost:5173',
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
    timezoneId: 'America/New_York',
    ignoreHTTPSErrors: true,
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },
  ],

  // Intentionally NO webServer and NO globalSetup/globalTeardown — this
  // config assumes the shared dev servers are already up and healthy.
});
