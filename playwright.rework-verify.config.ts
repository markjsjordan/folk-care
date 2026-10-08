import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config.js';

/**
 * Rework verification config for FC-AUDIT-BILLING-PAYROLL-EVV.
 *
 * These 3 new specs (billing-invoice-lifecycle, payroll-period-and-run,
 * evv-clock-persistence) authenticate via real UI login against the LIVE
 * dev stack (admin@folkcare.example) and assert against real seeded data,
 * not the isolated e2e harness DB. webServer is disabled entirely so
 * Playwright never spawns/touches anything -- it just drives the
 * already-running dev:server (:3000) / dev:web (:5173) processes.
 */
export default defineConfig({
  ...baseConfig,
  webServer: undefined,
  use: {
    ...baseConfig.use,
    baseURL: 'http://localhost:5173',
  },
});
