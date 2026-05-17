import { test as base, expect, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import type { AccountSelectOptions } from '../../../config/accountContext';
import {
  resolveBusinessAccountContextFromEnv,
  resolveDefaultAccountContextFromEnv,
  resolveFreelanceAccountContextFromEnv,
} from '../../../config/accountContext';
import {
  duplicateCanonicalAuthStorageToWorkerFiles,
  getAuthenticatedStorageState,
  getAuthenticatedStorageStatePathForWorker,
} from '../../../support/auth/storageState';
import { prepareAuthenticatedPage } from '../../../support/ui/prepareAuthenticatedPage';
import { ensureAuthenticatedDashboardPage } from '../../../support/ui/ensureAuthenticatedDashboard';
import { loginAndSelectAccount } from '../../../support/ui/loginAndSelectAccount';

export type AccountFixtureOptions = {
  /** Per-test account context (overrides env defaults for picker selection). */
  accountContext: AccountSelectOptions;
};

async function bootstrapAuthenticatedPage(
  browser: Browser,
  testInfo: TestInfo,
  accountContext: AccountSelectOptions
): Promise<{ context: BrowserContext; page: Page }> {
  const parallelIndex = testInfo.parallelIndex;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt === 1) {
      console.warn('[account-fixture] Regenerating canonical auth + worker clones (once)');
      await getAuthenticatedStorageState();
      await duplicateCanonicalAuthStorageToWorkerFiles();
    }

    const workerStoragePath = getAuthenticatedStorageStatePathForWorker(parallelIndex);
    const ctx = await browser.newContext({ storageState: workerStoragePath });
    const pg = await ctx.newPage();

    try {
      await ensureAuthenticatedDashboardPage(pg, testInfo, accountContext);
      return { context: ctx, page: pg };
    } catch (err) {
      await ctx.close().catch(() => {});
      if (attempt === 1) throw err;
    }
  }

  throw new Error('[account-fixture] Failed to bootstrap authenticated page');
}

function resolveContextOption(explicit: AccountSelectOptions): AccountSelectOptions {
  return Object.keys(explicit).length > 0 ? explicit : resolveDefaultAccountContextFromEnv();
}

/**
 * Account-aware Playwright fixtures.
 * - `accountContext` option: override picker selection per test
 * - `authenticatedPage`: seeded storage + picker for `accountContext` (default env)
 * - `freelancePage` / `businessPage`: explicit freelance or business preset from env
 * - `freshAccountPage`: empty storage, full UI login + account selection (isolated)
 */
export const test = base.extend<AccountFixtureOptions & {
  authenticatedPage: Page;
  freelancePage: Page;
  businessPage: Page;
  freshAccountPage: Page;
}>({
  accountContext: [{}, { option: true }],

  authenticatedPage: async ({ browser, accountContext }, use, testInfo) => {
    const ctxOpts = resolveContextOption(accountContext);
    const { context, page } = await bootstrapAuthenticatedPage(browser, testInfo, ctxOpts);
    await prepareAuthenticatedPage(page, testInfo, ctxOpts);
    await use(page);
    await context.close();
  },

  freelancePage: async ({ browser }, use, testInfo) => {
    const ctxOpts = resolveFreelanceAccountContextFromEnv();
    const { context, page } = await bootstrapAuthenticatedPage(browser, testInfo, ctxOpts);
    await prepareAuthenticatedPage(page, testInfo, ctxOpts);
    await use(page);
    await context.close();
  },

  businessPage: async ({ browser }, use, testInfo) => {
    const ctxOpts = resolveBusinessAccountContextFromEnv('default');
    const { context, page } = await bootstrapAuthenticatedPage(browser, testInfo, ctxOpts);
    await prepareAuthenticatedPage(page, testInfo, ctxOpts);
    await use(page);
    await context.close();
  },

  freshAccountPage: async ({ browser, accountContext }, use, testInfo) => {
    const ctxOpts = resolveContextOption(accountContext);
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await loginAndSelectAccount(page, { ...ctxOpts, skipLoginIfAuthenticated: false });
    await prepareAuthenticatedPage(page, testInfo, ctxOpts);
    await use(page);
    await context.close();
  },
});

export { expect };
