/**
 * Project dependency: runs before `chromium` (authenticated UI) tests.
 *
 * Why not `globalSetup` only? Playwright's `dependencies` + `storageState` tie auth refresh to the
 * same runner lifecycle as tests, so HTML reports show an explicit **setup** row and failures are
 * easier to attribute. We still reuse the same API/browser seeding logic as `getAuthenticatedStorageState`.
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { test as setup } from '@playwright/test';
import { getAuthenticatedStorageState } from '../../support/auth/storageState';

const PLAYWRIGHT_AUTH_JSON = path.join(__dirname, '..', '..', 'playwright', '.auth', 'user.json');

setup('prepare authenticated storage for chromium project', async () => {
  const canonicalPath = await getAuthenticatedStorageState();
  await fs.mkdir(path.dirname(PLAYWRIGHT_AUTH_JSON), { recursive: true });
  await fs.copyFile(canonicalPath, PLAYWRIGHT_AUTH_JSON);
});
