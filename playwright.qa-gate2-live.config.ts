import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config.js';

/**
 * QA/GATE-2 LIVE-DEV-STACK override for FC-AUDIT-PAYROLL.
 *
 * Runs payroll-period-and-run.spec.ts against the ALREADY-RUNNING shared
 * dev stack (API :3000, web :5173) and its real seeded Neon dev data,
 * instead of spinning up isolated webServers against a throwaway DB.
 * webServer is undefined so Playwright never spawns or touches ports
 * 3000/5173 itself (MEMORY-SAFETY: shared servers only, no isolated stack).
 */
export default defineConfig({
  ...baseConfig,
  webServer: undefined,
  use: {
    ...baseConfig.use,
    baseURL: 'http://localhost:5173',
  },
});
