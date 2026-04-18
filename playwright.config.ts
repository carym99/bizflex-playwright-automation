import { defineConfig, devices, type ReporterDescription } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import * as path from 'path';
import * as os from 'os';

/**
 * Auth for authenticated UI:
 * - `tests/setup/auth.setup.ts` runs first (project `setup`) and copies seeded storage to `playwright/.auth/user.json`.
 * - `chromium` project depends on `setup` and loads that file (explicit in reports vs only globalSetup).
 *
 * API tests use `APIRequestContext` (no browser storage). Login UI uses `ui-login` with empty storage.
 *
 * Tag constants: `config/tags.ts`.
 */
loadEnv({ path: path.join(__dirname, '.env.local') });
loadEnv({ path: path.join(__dirname, '.env') });

/** Canonical path used by setup project after `getAuthenticatedStorageState()` runs. */
const playwrightAuthState = path.join(__dirname, 'playwright', '.auth', 'user.json');
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
    /** Visual baselines: allow small anti-aliasing drift when `VISUAL_REGRESSION=1`. */
    toHaveScreenshot: { maxDiffPixels: 500 },
  },
  reporter: reporters,

  use: {
    baseURL: uiBaseURL,
    headless: true,
    testIdAttribute: 'data-testid',
    actionTimeout: 15_000,
    navigationTimeout: process.env.CI ? 45_000 : 30_000,
    /** CI: traces on retry keep artifacts small while preserving first-failure context. */
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'setup',
      testMatch: '**/setup/auth.setup.ts',
    },
    {
      name: 'api',
      testMatch: ['api-auth/**/*.spec.ts', 'regression/**/*.api.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: apiBaseURL,
      },
    },
    {
      name: 'chromium',
      dependencies: ['setup'],
      testMatch: ['smoke/**/*.spec.ts', 'regression/**/*.spec.ts'],
      testIgnore: ['**/*.api.spec.ts', '**/setup/**'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: uiBaseURL,
        storageState: playwrightAuthState,
      },
    },
    {
      name: 'ui-login',
      testMatch: ['auth/**/*.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: uiBaseURL,
        storageState: emptyStorageState,
      },
    },
  ],
});
