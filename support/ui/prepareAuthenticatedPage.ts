import { type Page, type TestInfo } from '@playwright/test';
import {
  getBearerTokenFromPage,
  mirrorSessionUserTokensToLocalStorage,
  waitForBearerTokenInPage,
} from '../auth/browserAuthSession';
import { assertAccessTokenPresent, failIfLoginRedirect } from './assertStillAuthenticated';
import {
  attemptUiLoginRecovery,
  attemptUiLoginRecoveryFromLoginRoute,
  getPagePathname,
  logBrowserAuthDebug,
  pathnameLooksLikeLogin,
  waitForStableAuthenticatedRoute,
} from './authSessionRecovery';
import { dismissCardModal } from './dismissCardModal';
import { dismissCookieBanner } from './dismissCookieBanner';
import { waitForDashboardReadiness } from './dashboardReadiness';
import { handleSessionTimeoutWithOptionalCiRecovery } from './sessionTimeoutCiRecovery';
import { readAuthSessionSeed } from '../auth/storageState';
import {
  pathnameLooksLikeAccountDashboardPath,
  pathnameLooksLikeSelectAccountPath,
} from './accountRoutes';
import { gotoWithRetry } from './navigation';
import { resolveSelectAccountToDashboardIfNeeded } from './resolveSelectAccount';

/**
 * Ensures `sessionStorage` matches the API-written seed file before the first navigation.
 * Playwright `storageState` persists cookies/localStorage origins but not sessionStorage.
 */
export async function installAuthSessionSeedInitScript(page: Page): Promise<void> {
  const sessionSeed = readAuthSessionSeed();
  if (!sessionSeed) return;
  await page.addInitScript(
    ({ user, email }) => {
      window.sessionStorage.setItem('user', JSON.stringify(user));
      window.sessionStorage.setItem('email', email);
    },
    { user: sessionSeed.user, email: sessionSeed.email }
  );
}

async function hasBrowserTokens(page: Page): Promise<boolean> {
  try {
    return Boolean(await getBearerTokenFromPage(page));
  } catch {
    return false;
  }
}

async function assertHasBrowserTokens(page: Page, phase: string): Promise<void> {
  /** Headroom for Netlify + parallel workers; `waitForFunction` survives SPA navigations better than evaluate polls. */
  const tokenWaitMs = process.env.CI ? 120_000 : 55_000;
  try {
    await waitForBearerTokenInPage(page, tokenWaitMs);
  } catch {
    // Last-resort nudge: tokens may hydrate only after a second navigation to /account.
    if (!pathnameLooksLikeLogin(page) && pathnameLooksLikeAccountDashboardPath(getPagePathname(page))) {
      await gotoWithRetry(page, '/account', { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      try {
        await waitForBearerTokenInPage(page, process.env.CI ? 45_000 : 20_000);
        return;
      } catch {
        /* fall through to debug + throw */
      }
    }
    await logBrowserAuthDebug(page, `${phase}-missing-tokens`);
    throw new Error(
      `${phase}: expected bearer token in localStorage or sessionStorage.user after navigation`
    );
  }
}

/**
 * Standard entry for authenticated UI flows: land on account, clear interruptions, assert dashboard shell.
 * Always pass `testInfo` so an unexpected `/login` redirect attaches `auth-diagnostics.json` + screenshot.
 *
 * Avoids `waitForLoadState('load')` — the SPA keeps long-polling / trackers and never reaches `load` reliably in CI.
 */
export async function prepareAuthenticatedPage(page: Page, testInfo: TestInfo): Promise<void> {
  await installAuthSessionSeedInitScript(page);

  await gotoWithRetry(page, '/account', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page
    .waitForLoadState('networkidle', { timeout: process.env.CI ? 8_000 : 5_000 })
    .catch(() => {});

  try {
    await page.waitForFunction(
      () => {
        const p = window.location.pathname.toLowerCase();
        return (
          /^\/login(\/|$)/.test(p) ||
          /^\/select-account(\/|$)/.test(p) ||
          /^\/account(\/|$)/.test(p)
        );
      },
      null,
      { timeout: 30_000 }
    );
  } catch {
    await logBrowserAuthDebug(page, 'prepareAuthenticatedPage wait for /account or /login path timeout');
  }

  if (pathnameLooksLikeLogin(page)) {
    if (await hasBrowserTokens(page)) {
      console.warn('[auth] prepareAuthenticatedPage: /login path with tokens — nudging /account');
      await gotoWithRetry(page, '/account', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      try {
        await page.waitForFunction(
          () => {
            const p = window.location.pathname.toLowerCase();
            return (
              /^\/login(\/|$)/.test(p) ||
              /^\/select-account(\/|$)/.test(p) ||
              /^\/account(\/|$)/.test(p)
            );
          },
          null,
          { timeout: 20_000 }
        );
      } catch {
        await logBrowserAuthDebug(page, 'prepareAuthenticatedPage post-nudge path wait');
      }
    }

    if (pathnameLooksLikeLogin(page)) {
      const recovered =
        (await attemptUiLoginRecovery(page)) || (await attemptUiLoginRecoveryFromLoginRoute(page));
      if (!recovered) {
        await logBrowserAuthDebug(page, 'prepareAuthenticatedPage login path without UI recovery');
        await failIfLoginRedirect(page, testInfo, 'prepareAuthenticatedPage: initial navigation');
        if (pathnameLooksLikeLogin(page)) {
          throw new Error('prepareAuthenticatedPage: still on /login after failed recovery (see auth-debug logs)');
        }
      } else {
        await gotoWithRetry(page, '/account', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('domcontentloaded').catch(() => {});
        try {
          await page.waitForFunction(
            () => {
              const p = window.location.pathname.toLowerCase();
              return (
                /^\/login(\/|$)/.test(p) ||
                /^\/select-account(\/|$)/.test(p) ||
                /^\/account(\/|$)/.test(p)
              );
            },
            null,
            { timeout: 30_000 }
          );
        } catch {
          await logBrowserAuthDebug(page, 'prepareAuthenticatedPage post-recovery path wait timeout');
        }
      }
    }
  }

  if (pathnameLooksLikeLogin(page)) {
    await logBrowserAuthDebug(page, 'prepareAuthenticatedPage still on /login path before stable-route wait');
    await failIfLoginRedirect(page, testInfo, 'prepareAuthenticatedPage: after recovery check');
    if (pathnameLooksLikeLogin(page)) {
      throw new Error('prepareAuthenticatedPage: still on /login before waitForStableAuthenticatedRoute');
    }
  }

  await page.waitForURL(/\/account|\/login|\/select-account/i, { timeout: 45_000 }).catch(() => {});
  await page.waitForLoadState('domcontentloaded').catch(() => {});

  const pathAfterTokens = getPagePathname(page);
  const alreadyOnAccountShell =
    (pathnameLooksLikeAccountDashboardPath(pathAfterTokens) || pathnameLooksLikeSelectAccountPath(pathAfterTokens)) &&
    !pathnameLooksLikeLogin(page);
  if (!alreadyOnAccountShell) {
    await waitForStableAuthenticatedRoute(page, 25_000).catch(async () => {
      await logBrowserAuthDebug(page, 'prepareAuthenticatedPage waitForStableAuthenticatedRoute timeout');
      const p = getPagePathname(page);
      const ok =
        pathnameLooksLikeAccountDashboardPath(p) ||
        pathnameLooksLikeSelectAccountPath(p) ||
        p.includes('payment-link') ||
        /\/transactions?/i.test(p);
      if (!ok) {
        throw new Error(
          'prepareAuthenticatedPage: URL did not stabilize on /account, /select-account, /payment-link, or /transactions'
        );
      }
    });
  }

  await failIfLoginRedirect(page, testInfo, 'prepareAuthenticatedPage: after stable route');
  await resolveSelectAccountToDashboardIfNeeded(page);

  await assertHasBrowserTokens(page, 'prepareAuthenticatedPage');
  await mirrorSessionUserTokensToLocalStorage(page);

  await handleSessionTimeoutWithOptionalCiRecovery(page, testInfo, 'prepareAuthenticatedPage');
  await dismissCardModal(page);
  await dismissCookieBanner(page);

  await waitForDashboardReadiness(page);
  await mirrorSessionUserTokensToLocalStorage(page).catch(() => {});
  await failIfLoginRedirect(page, testInfo, 'prepareAuthenticatedPage: after dashboard wait');
  await assertAccessTokenPresent(page, testInfo, 'prepareAuthenticatedPage: after dashboard wait');
}
