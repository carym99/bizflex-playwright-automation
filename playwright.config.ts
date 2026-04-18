import { defineConfig, devices, type ReporterDescription } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import * as path from 'path';
import * as os from 'os';
import { getAuthenticatedStorageStatePath } from './support/auth/storageState';

/**
 * Auth for authenticated UI:
 * - `tests/setup/auth.setup.ts` runs first (project `setup`) and refreshes `storage/authenticated-user.json`,
 *   then clones it to `authenticated-user-worker-*.json` for parallel-safe contexts.
 * - `chromium` loads canonical `storage/authenticated-user.json` for the default `page`; specs using
 *   `tests/shared/fixtures/auth.fixture.ts` use per-worker JSON files (`AUTH_WORKER_STORAGE_COUNT`, default 16).
 *
 * API tests use `APIRequestContext` (no browser storage). Login UI uses `ui-login` with empty storage.
 *
 * Tag constants: `config/tags.ts`.
 */
loadEnv({ path: path.join(__dirname, '.env.local') });
loadEnv({ path: path.join(__dirname, '.env') });

const authenticatedUserStorage = getAuthenticatedStorageStatePath();
/** Fresh browser profile (no saved auth) for login UI specs */
const emptyStorageState = { cookies: [], origins: [] };

const apiBaseURL = process.env.API_URL || 'https://bizflex.onrender.com';
const uiBaseURL = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || 'https://bizflex-app.netlify.app';

const ciWorkers = (): number | undefined => {
  if (!process.env.CI) return undefined;
  const raw = process.env.PW_WORKERS;
  if (raw !== undefined && raw !== '') {
    const fromEnv = Number(raw);
    if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  }
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
        storageState: authenticatedUserStorage,
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
