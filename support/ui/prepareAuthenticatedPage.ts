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
import { handleSessionTimeout } from './handleSessionTimeout';
import { waitForDashboardReadiness } from './dashboardReadiness';
import { readAuthSessionSeed } from '../auth/storageState';
import { gotoWithRetry } from './navigation';

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
    if (!pathnameLooksLikeLogin(page) && getPagePathname(page).includes('account')) {
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
 * If the SPA shows a session-expired modal (common under CI load), try UI re-login once before failing.
 */
async function handleSessionTimeoutWithOptionalCiRecovery(page: Page, testInfo: TestInfo): Promise<void> {
  try {
    await handleSessionTimeout(page);
    return;
  } catch (err) {
    if (!process.env.CI) {
      throw err;
    }
    console.warn('[auth] prepareAuthenticatedPage: session timeout UI in CI — attempting UI recovery');
    await logBrowserAuthDebug(page, 'prepareAuthenticatedPage-session-timeout-before-recovery');
    const recovered =
      (await attemptUiLoginRecovery(page)) || (await attemptUiLoginRecoveryFromLoginRoute(page));
    if (!recovered) {
      throw err;
    }
    await gotoWithRetry(page, '/account', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await waitForBearerTokenInPage(page, 60_000).catch(() => {});
    await mirrorSessionUserTokensToLocalStorage(page).catch(() => {});
    await handleSessionTimeout(page);
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
        return p.includes('account') || /^\/login(\/|$)/.test(p);
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
            return p.includes('account') || /^\/login(\/|$)/.test(p);
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
              return p.includes('account') || /^\/login(\/|$)/.test(p);
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

  await page.waitForURL(/\/account|\/login/i, { timeout: 45_000 }).catch(() => {});
  await page.waitForLoadState('domcontentloaded').catch(() => {});

  const pathAfterTokens = getPagePathname(page);
  const alreadyOnAccountShell =
    pathAfterTokens.includes('account') && !pathnameLooksLikeLogin(page);
  if (!alreadyOnAccountShell) {
    await waitForStableAuthenticatedRoute(page, 25_000).catch(async () => {
      await logBrowserAuthDebug(page, 'prepareAuthenticatedPage waitForStableAuthenticatedRoute timeout');
      const p = getPagePathname(page);
      const ok = p.includes('account') || p.includes('payment-link') || /\/transactions?/i.test(p);
      if (!ok) {
        throw new Error('prepareAuthenticatedPage: URL did not stabilize on /account, /payment-link, or /transactions');
      }
    });
  }

  await assertHasBrowserTokens(page, 'prepareAuthenticatedPage');
  await mirrorSessionUserTokensToLocalStorage(page);

  await failIfLoginRedirect(page, testInfo, 'prepareAuthenticatedPage: after stable route');
  await handleSessionTimeoutWithOptionalCiRecovery(page, testInfo);
  await dismissCardModal(page);
  await dismissCookieBanner(page);

  await waitForDashboardReadiness(page);
  await mirrorSessionUserTokensToLocalStorage(page).catch(() => {});
  await failIfLoginRedirect(page, testInfo, 'prepareAuthenticatedPage: after dashboard wait');
  await assertAccessTokenPresent(page, testInfo, 'prepareAuthenticatedPage: after dashboard wait');
}
