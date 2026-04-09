import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import * as path from 'path';

/**
 * Shared session: run `npm run auth` (API login → storage/auth.json) before tests.
 * Mirrors Cypress: token + authToken + accessToken in localStorage for bizflex-app.
 */
loadEnv({ path: path.join(__dirname, '.env.local') });
loadEnv({ path: path.join(__dirname, '.env') });

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: process.env.BASE_URL || process.env.PLAYWRIGHT_BASE_URL || 'https://bizflex-app.netlify.app',
    storageState: path.join(__dirname, 'storage', 'auth.json'),
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
      name: 'ui',
      testDir: './ui',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
