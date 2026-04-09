import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import * as path from 'path';

/**
 * Authenticated UI uses `storage/authenticated-user.json`.
 * Session is seeded on the **SPA origin** (default https://bizflex-app.netlify.app), not the API host,
 * so `BASE_URL` must match where the browser loads the app.
 */
loadEnv({ path: path.join(__dirname, '.env.local') });
loadEnv({ path: path.join(__dirname, '.env') });

const authenticatedStorageState = path.join(__dirname, 'storage', 'authenticated-user.json');
/** Fresh browser profile (no saved auth) for login UI specs */
const emptyStorageState = { cookies: [], origins: [] };

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],

  globalSetup: path.join(__dirname, 'support', 'auth', 'global-setup.ts'),

  use: {
    /** Must match the Netlify (or other) UI origin used when writing `storage/authenticated-user.json`. */
    baseURL: process.env.BASE_URL || process.env.PLAYWRIGHT_BASE_URL || 'https://bizflex-app.netlify.app',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'api',
      testDir: './api',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'ui-authenticated',
      testDir: './ui',
      testIgnore: ['**/auth/**'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: authenticatedStorageState,
      },
    },
    {
      name: 'ui-login',
      testDir: './ui/auth',
      use: {
        ...devices['Desktop Chrome'],
        storageState: emptyStorageState,
      },
    },
  ],
});
