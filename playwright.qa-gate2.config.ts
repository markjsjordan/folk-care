import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config.js';

/**
 * QA/GATE-2 isolated override for FC-AUDIT-QUALITY-ASSURANCE.
 *
 * The shared playwright.config.ts's webServer only boots the API
 * (test:e2e:server) and assumes a platform (Vercel in production) serves the
 * built frontend as static files — there is no express.static in
 * packages/app locally, so page.goto() against the bare API returns JSON
 * 404s for frontend routes. This config instead boots BOTH the API and the
 * Vite dev server (proxying /api to the API), fully isolated on ports 3101
 * (API) / 3102 (web) against the dedicated folkcare_e2e_test database, so
 * this verification pass never touches the shared dev:server (:3000) /
 * dev:web (:5173) processes.
 */
const baseWebServer = Array.isArray(baseConfig.webServer)
  ? baseConfig.webServer[0]
  : baseConfig.webServer;

const TEST_DB_URL =
  process.env['E2E_DATABASE_URL'] ||
  process.env['DATABASE_URL'] ||
  'postgresql://markjordan:x@localhost:5432/folkcare_e2e_test_qagate2';

export default defineConfig({
  ...baseConfig,
  webServer: [
    {
      ...baseWebServer,
      command: 'npm run test:e2e:server',
      port: 3101,
      env: {
        ...baseWebServer?.env,
        PORT: '3101',
        NODE_ENV: 'test',
        DATABASE_URL: TEST_DB_URL,
      },
    },
    {
      command: 'npm run dev:web',
      port: 3102,
      timeout: 30000,
      reuseExistingServer: !process.env['CI'],
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        WEB_PORT: '3102',
        API_PORT: '3101',
        // packages/web/.env hardcodes an absolute VITE_API_BASE_URL
        // (http://localhost:3000), which bypasses the Vite dev-server proxy
        // entirely and points every API call at the shared dev:server
        // instead of this isolated test API — override it here so requests
        // go through the proxy (relative /api -> API_PORT) instead.
        VITE_API_BASE_URL: '',
      },
    },
  ],
  use: {
    ...baseConfig.use,
    baseURL: 'http://localhost:3102',
  },
});
