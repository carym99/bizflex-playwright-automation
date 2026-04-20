/**
 * Project dependency: runs before `chromium` (authenticated UI) tests.
 *
 * Refreshes `storage/authenticated-user.json` via `getAuthenticatedStorageState()` (UI-first in CI),
 * verifies `/account` plus tokens in a disposable browser, reclones worker slot files.
 */
import { test as setup, expect, chromium } from '@playwright/test';
import type { Browser, BrowserContext, Page, TestInfo } from '@playwright/test';
import {
  duplicateCanonicalAuthStorageToWorkerFiles,
  getAuthenticatedStorageState,
  getAuthenticatedStorageStatePath,
} from '../../support/auth/storageState';
import { collectAuthDiagnostics } from '../../support/auth/debugAuthState';
import {
  getBearerTokenFromPage,
  getRefreshTokenFromPage,
  mirrorSessionUserTokensToLocalStorage,
} from '../../support/auth/browserAuthSession';
import { installAuthSessionSeedInitScript } from '../../support/ui/prepareAuthenticatedPage';

setup('prepare and verify authenticated storage', async ({}, testInfo: TestInfo) => {
  setup.setTimeout(180_000);

  const storagePath = getAuthenticatedStorageStatePath();
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || 'https://bizflex-app.netlify.app';

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;

  try {
    await getAuthenticatedStorageState();

    browser = await chromium.launch({
      args: process.env.CI ? ['--disable-dev-shm-usage'] : [],
    });

    context = await browser.newContext({
      baseURL,
      storageState: storagePath,
    });
    page = await context.newPage();
    await installAuthSessionSeedInitScript(page);

    await page.goto('/account', {
      waitUntil: 'domcontentloaded',
      timeout: process.env.CI ? 120_000 : 90_000,
    });
    await page.waitForLoadState('domcontentloaded');

    if (process.env.CI) {
      const accessProbe = Boolean(await getBearerTokenFromPage(page));
      console.log('[auth.setup] after /account url=', page.url(), 'accessTokenPresent=', accessProbe);
    }

    await expect(page).toHaveURL(/\/account/i, { timeout: 60_000 });

    await mirrorSessionUserTokensToLocalStorage(page);
    const accessToken = await getBearerTokenFromPage(page);
    const refreshToken = await getRefreshTokenFromPage(page);
    expect(accessToken, 'accessToken must exist in browser storage after /account').toBeTruthy();
    expect(refreshToken, 'refreshToken must exist in browser storage after /account').toBeTruthy();

    await context.storageState({ path: storagePath });
    await duplicateCanonicalAuthStorageToWorkerFiles();
  } catch (err) {
    console.error('[auth.setup] failed:', err instanceof Error ? err.message : String(err));
    if (page && !page.isClosed()) {
      try {
        await testInfo.attach('auth-setup-failure.png', {
          body: await page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
        const diag = await collectAuthDiagnostics(page);
        await testInfo.attach('auth-setup-diagnostics.json', {
          body: Buffer.from(JSON.stringify(diag, null, 2), 'utf8'),
          contentType: 'application/json',
        });
      } catch (attachErr) {
        console.warn('[auth.setup] could not attach failure artifacts:', attachErr);
      }
    }
    throw err;
  } finally {
    await page?.close().catch(() => {});
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
});
