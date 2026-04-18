/**
 * Project dependency: runs before `chromium` (authenticated UI) tests.
 *
 * Refreshes `storage/authenticated-user.json`, verifies `/account` plus tokens, re-saves canonical storage,
 * then clones it to `storage/authenticated-user-worker-*.json` so parallel workers do not share one file.
 */
import { test as setup, expect, chromium } from '@playwright/test';
import {
  duplicateCanonicalAuthStorageToWorkerFiles,
  getAuthenticatedStorageState,
  getAuthenticatedStorageStatePath,
} from '../../support/auth/storageState';
import { installAuthSessionSeedInitScript } from '../../support/ui/prepareAuthenticatedPage';

setup('prepare and verify authenticated storage', async () => {
  await getAuthenticatedStorageState();

  const storagePath = getAuthenticatedStorageStatePath();
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || 'https://bizflex-app.netlify.app';

  const browser = await chromium.launch({
    args: process.env.CI ? ['--disable-dev-shm-usage'] : [],
  });

  try {
    const context = await browser.newContext({
      baseURL,
      storageState: storagePath,
    });
    const page = await context.newPage();
    await installAuthSessionSeedInitScript(page);

    try {
      await page.goto('/account', {
        waitUntil: 'domcontentloaded',
        timeout: process.env.CI ? 120_000 : 90_000,
      });
      await page.waitForLoadState('domcontentloaded');

      if (process.env.CI) {
        const accessProbe = await page.evaluate(() => Boolean(localStorage.getItem('accessToken')));
        console.log('[auth.setup] after /account url=', page.url(), 'accessTokenPresent=', accessProbe);
      }

      await expect(page).toHaveURL(/\/account/i, { timeout: 60_000 });

      const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
      const refreshToken = await page.evaluate(() => localStorage.getItem('refreshToken'));
      expect(accessToken, 'accessToken must exist in localStorage after /account').toBeTruthy();
      expect(refreshToken, 'refreshToken must exist in localStorage after /account').toBeTruthy();

      await context.storageState({ path: storagePath });
      await duplicateCanonicalAuthStorageToWorkerFiles();
    } finally {
      await page.close().catch(() => {});
      await context.close().catch(() => {});
    }
  } finally {
    await browser.close();
  }
});
