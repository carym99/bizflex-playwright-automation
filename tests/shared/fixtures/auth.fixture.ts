import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  duplicateCanonicalAuthStorageToWorkerFiles,
  getAuthenticatedStorageState,
  getAuthenticatedStorageStatePathForWorker,
} from '../../../support/auth/storageState';
import { getBearerTokenFromPage } from '../../../support/auth/browserAuthSession';
import { assertStillAuthenticated } from '../../../support/ui/assertStillAuthenticated';
import { installAuthSessionSeedInitScript } from '../../../support/ui/prepareAuthenticatedPage';
import { urlIsAccountDashboard } from '../../../support/ui/accountRoutes';
import { resolveSelectAccountToDashboardIfNeeded } from '../../../support/ui/resolveSelectAccount';

/**
 * Authenticated UI smoke / isolated flows: fresh browser context per test from
 * `storage/authenticated-user-worker-{N}.json` (per Playwright worker), session seed init script,
 * `/account` bootstrap, and token validation. On first bootstrap failure, regenerates canonical
 * storage once, reclones worker files, and retries.
 */
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ browser }, use, testInfo) => {
    let context: BrowserContext | undefined;
    let page: Page | undefined;
    const parallelIndex = testInfo.parallelIndex;

    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt === 1) {
        console.warn(
          '[auth-fixture] Bootstrap failed; regenerating canonical auth + recloning worker storage (once)'
        );
        await getAuthenticatedStorageState();
        await duplicateCanonicalAuthStorageToWorkerFiles();
      }

      const workerStoragePath = getAuthenticatedStorageStatePathForWorker(parallelIndex);
      if (process.env.CI) {
        console.log('[auth-fixture] workerStoragePath=', workerStoragePath, 'parallelIndex=', parallelIndex);
      }

      const ctx = await browser.newContext({ storageState: workerStoragePath });
      const pg = await ctx.newPage();
      try {
        await installAuthSessionSeedInitScript(pg);
        await pg.goto('/account', {
          waitUntil: 'domcontentloaded',
          timeout: process.env.CI ? 120_000 : 90_000,
        });
        await pg.waitForLoadState('domcontentloaded');
        if (process.env.CI) {
          const tokenProbe = Boolean(await getBearerTokenFromPage(pg));
          console.log('[auth-fixture] after /account url=', pg.url(), 'accessTokenPresent=', tokenProbe);
        }
        if (/\/login/i.test(pg.url())) {
          await testInfo.attach('auth-fixture-login-after-account.png', {
            body: await pg.screenshot({ fullPage: true }),
            contentType: 'image/png',
          });
          throw new Error('Authenticated storage state is invalid or expired (landed on /login after /account)');
        }
        await resolveSelectAccountToDashboardIfNeeded(pg);
        await expect(pg).toHaveURL(urlIsAccountDashboard, { timeout: 60_000 });
        await assertStillAuthenticated(pg, testInfo, `auth-fixture-bootstrap-${attempt}`);
        context = ctx;
        page = pg;
        break;
      } catch (err) {
        await ctx.close().catch(() => {});
        if (attempt === 1) {
          throw err;
        }
      }
    }

    if (!context || !page) {
      throw new Error('[auth-fixture] Failed to create authenticated page');
    }

    await use(page);
    await context.close();
  },
});

export { expect };
