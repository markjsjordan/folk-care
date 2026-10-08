import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config.js';

/**
 * Verification run for the CaregiverTasksPage list-view signature-gating fix
 * (FC-AUDIT-CAREPLANS follow-up). Per memory-safety constraints for this
 * session, this must NOT spin up an isolated Playwright webServer stack —
 * it targets the already-running SHARED dev servers (API :3000, web :5173)
 * directly and never manages their process lifecycle (no `webServer` entry
 * at all — even `reuseExistingServer: true` can still race/own/kill the
 * process on exit, which is exactly what happened on the first attempt and
 * killed the shared API dev server).
 */
export default defineConfig({
  ...baseConfig,
  workers: 1,
  globalSetup: undefined,
  globalTeardown: undefined,
  webServer: undefined,
  use: {
    ...baseConfig.use,
    baseURL: 'http://localhost:5173',
  },
});
