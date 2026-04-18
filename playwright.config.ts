import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import * as path from 'path';

/**
 * Authenticated UI uses `storage/authenticated-user.json`.
 * Session is seeded on the **SPA origin** (default https://bizflex-app.netlify.app), not the API host,
 * so `PLAYWRIGHT_BASE_URL`/`BASE_URL` must match where the browser loads the app.
 *
 * Tests live under `tests/` and are filtered in CI by lane tags: @smoke, @auth, @api-auth, @regression.
 */
loadEnv({ path: path.join(__dirname, '.env.local') });
loadEnv({ path: path.join(__dirname, '.env') });

const authenticatedStorageState = path.join(__dirname, 'storage', 'authenticated-user.json');
/** Fresh browser profile (no saved auth) for login UI specs */
const emptyStorageState = { cookies: [], origins: [] };

const apiBaseURL = process.env.API_URL || 'https://bizflex.onrender.com';
const uiBaseURL = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || 'https://bizflex-app.netlify.app';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: process.env.CI ? 90_000 : 60_000,
  expect: {
    timeout: process.env.CI ? 15_000 : 10_000,
  },
  reporter: [['html', { open: 'never' }], ['list']],

  globalSetup: path.join(__dirname, 'support', 'auth', 'global-setup.ts'),

  use: {
    baseURL: uiBaseURL,
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: process.env.CI ? 45_000 : 30_000,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
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
