import { defineConfig, devices, type ReporterDescription } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import * as path from 'path';
import * as os from 'os';

/**
 * Authenticated UI uses `storage/authenticated-user.json`.
 * Session is seeded on the **SPA origin** (default https://bizflex-app.netlify.app), not the API host,
 * so `PLAYWRIGHT_BASE_URL`/`BASE_URL` must match where the browser loads the app.
 *
 * Tests live under `tests/` and are filtered in CI by lane tags: @smoke, @auth, @api-auth, @regression.
 * Tag constants: `config/tags.ts`.
 */
loadEnv({ path: path.join(__dirname, '.env.local') });
loadEnv({ path: path.join(__dirname, '.env') });

const authenticatedStorageState = path.join(__dirname, 'storage', 'authenticated-user.json');
/** Fresh browser profile (no saved auth) for login UI specs */
const emptyStorageState = { cookies: [], origins: [] };

const apiBaseURL = process.env.API_URL || 'https://bizflex.onrender.com';
const uiBaseURL = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || 'https://bizflex-app.netlify.app';

const ciWorkers = (): number | undefined => {
  if (!process.env.CI) return undefined;
  const fromEnv = Number(process.env.PW_WORKERS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  const half = Math.max(1, Math.floor(os.cpus().length / 2));
  return Math.min(4, Math.max(2, half));
};

const reporters: ReporterDescription[] = [
  ['list'],
  ['html', { open: 'never' }],
  ['junit', { outputFile: path.join(__dirname, 'reports', 'junit.xml') }],
];
if (process.env.GITHUB_ACTIONS) {
  reporters.push(['github']);
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: ciWorkers(),
  timeout: process.env.CI ? 90_000 : 60_000,
  expect: {
    timeout: process.env.CI ? 15_000 : 10_000,
  },
  reporter: reporters,

  globalSetup: path.join(__dirname, 'support', 'auth', 'global-setup.ts'),

  use: {
    baseURL: uiBaseURL,
    headless: true,
    testIdAttribute: 'data-testid',
    actionTimeout: 15_000,
    navigationTimeout: process.env.CI ? 45_000 : 30_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'api',
      testDir: './tests',
      testMatch: ['api-auth/**/*.spec.ts', 'regression/**/*.api.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: apiBaseURL,
      },
    },
    {
      name: 'ui-authenticated',
      testDir: './tests',
      testMatch: ['smoke/**/*.spec.ts', 'regression/**/*.spec.ts'],
      testIgnore: ['**/*.api.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: uiBaseURL,
        storageState: authenticatedStorageState,
      },
    },
    {
      name: 'ui-login',
      testDir: './tests',
      testMatch: ['auth/**/*.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: uiBaseURL,
        storageState: emptyStorageState,
      },
    },
  ],
});
