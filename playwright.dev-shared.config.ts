import { defineConfig, devices } from '@playwright/test';

/**
 * TEST-ONLY config override for running the FC-AUDIT-BILLING-PAYROLL-EVV
 * e2e specs (billing-invoice-lifecycle, payroll-period-and-run,
 * evv-clock-persistence) against the already-running shared dev servers
 * (API :3000, web/Vite :5173) with real seeded demo data, instead of the
 * main playwright.config.ts's ephemeral TestDatabase/globalSetup stack
 * (which spins up its own Postgres test DB + API-only server — wrong stack
 * for these specs, see their file-header comments).
 *
 * Not referenced by package.json scripts or CI — invoked explicitly via
 * `npx playwright test --config=playwright.dev-shared.config.ts`.
 * Does not start or stop any server (no webServer block): points at
 * whatever is already listening on :5173, per this task's memory-safety
 * rule against configs with their own webServer directive.
 */
export default defineConfig({
  testDir: './e2e/tests',
  timeout: 30000,
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env['E2E_BASE_URL'] || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
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
});
