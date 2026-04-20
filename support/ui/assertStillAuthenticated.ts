import { expect, type Page, type TestInfo } from '@playwright/test';
import { getBearerTokenFromPage, mirrorSessionUserTokensToLocalStorage } from '../auth/browserAuthSession';
import { attachAuthFailureArtifacts, logAuthDiagnostics } from '../auth/debugAuthState';
import { handleSessionTimeout } from './handleSessionTimeout';
import {
  attemptUiLoginRecovery,
  attemptUiLoginRecoveryFromLoginRoute,
  logBrowserAuthDebug,
  pathnameLooksLikeLogin,
} from './authSessionRecovery';
import { gotoWithRetry } from './navigation';

async function readHasAnyAccessToken(page: Page): Promise<boolean> {
  if (page.isClosed()) return false;
  const t = await getBearerTokenFromPage(page);
  return Boolean(t && t.length > 0);
}

/**
 * Polls URL for transient `/login` ↔ `/account` hydration churn (SPA + trackers in CI).
 * If still on `/login` with tokens present, nudges `/account` and may run UI login recovery.
 */
async function stabilizeAuthHydration(page: Page, testInfo: TestInfo | undefined, phase: string): Promise<void> {
  const intervalMs = 500;
  const maxMs = 10_000;
  const deadline = Date.now() + maxMs;

  while (Date.now() < deadline) {
    if (page.isClosed()) {
      throw new Error(`[auth] Page closed during hydration stabilization — ${phase}`);
    }
    if (!pathnameLooksLikeLogin(page)) {
      return;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  if (page.isClosed()) {
    throw new Error(`[auth] Page closed after hydration poll — ${phase}`);
  }

  const onLogin = pathnameLooksLikeLogin(page);
  const hasToken = await readHasAnyAccessToken(page);

  if (onLogin && hasToken) {
    console.warn(`[auth] ${phase}: still on /login with tokens — treating as hydration; nudging /account`);
    await logBrowserAuthDebug(page, `${phase}-hydration`);
    await gotoWithRetry(page, '/account', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/account|\/login/i, { timeout: 15_000 }).catch(() => {});
  }

  if (page.isClosed()) {
    throw new Error(`[auth] Page closed after /account nudge — ${phase}`);
  }

  if (pathnameLooksLikeLogin(page) && (await readHasAnyAccessToken(page))) {
    const recovered =
      (await attemptUiLoginRecovery(page)) || (await attemptUiLoginRecoveryFromLoginRoute(page));
    if (recovered) {
      await gotoWithRetry(page, '/account', { waitUntil: 'domcontentloaded' });
    }
  }
}

async function resolveLoginPathWithTokens(
  page: Page,
  testInfo: TestInfo,
  context: string
): Promise<void> {
  if (!pathnameLooksLikeLogin(page)) return;
  const hasToken = await readHasAnyAccessToken(page);
  if (!hasToken) return;

  console.warn(`[auth] ${context}: still on /login with tokens — final nudge + optional UI recovery`);
  await logBrowserAuthDebug(page, `${context}-login-with-tokens-final`);
  await gotoWithRetry(page, '/account', { waitUntil: 'domcontentloaded' });
  await page
    .waitForFunction(
      () => {
        const p = window.location.pathname.toLowerCase();
        return !/^\/login(\/|$)/.test(p);
      },
      null,
      { timeout: 12_000 }
    )
    .catch(() => {});

  if (pathnameLooksLikeLogin(page)) {
    const recovered =
      (await attemptUiLoginRecovery(page)) || (await attemptUiLoginRecoveryFromLoginRoute(page));
    if (recovered) {
      await gotoWithRetry(page, '/account', { waitUntil: 'domcontentloaded' });
    }
  }

  await stabilizeAuthHydration(page, testInfo, `${context}-post-final-nudge`);
  await failIfLoginRedirect(page, testInfo, `${context}-post-final-nudge`);
}

/**
 * After navigation, confirm a bearer-like token is still in `localStorage` (SPA auth).
 * Call after `failIfLoginRedirect` when the URL is not `/login`.
 */
export async function assertAccessTokenPresent(
  page: Page,
  testInfo: TestInfo | undefined,
  phase: string
): Promise<void> {
  if (pathnameLooksLikeLogin(page)) {
    return;
  }

  try {
    await mirrorSessionUserTokensToLocalStorage(page).catch(() => {});
    await expect
      .poll(async () => (await getBearerTokenFromPage(page)) ?? '', { timeout: 20_000 })
      .not.toBe('');
  } catch {
    if (testInfo) {
      await attachAuthFailureArtifacts(page, testInfo, `${phase}-missing-access-token`);
    } else {
      await logAuthDiagnostics(page, `${phase}-missing-access-token`);
    }

    throw new Error(
      `Session invalid: missing accessToken (or token/authToken) in localStorage or sessionStorage.user — ${phase}`
    );
  }

  if (process.env.CI) {
    const token = await getBearerTokenFromPage(page);
    console.log(
      `[auth] ${phase}: url=${page.url()} accessTokenPresent=${Boolean(token && token.length > 0)}`
    );
  }
}

/**
 * If the app redirected to `/login`, attach diagnostics (when `testInfo` is set), log URL / cookies / storage, and throw.
 * Used by `prepareAuthenticatedPage` and by specs after navigations that could drop session.
 *
 * When `/login` is shown but tokens still exist, this is usually a hydration/router race — callers should run
 * {@link stabilizeAuthHydration} first. This function only throws when there is no usable bearer token.
 */
export async function failIfLoginRedirect(
  page: Page,
  testInfo: TestInfo | undefined,
  phase: string
): Promise<void> {
  if (!pathnameLooksLikeLogin(page)) return;

  const hasToken = await readHasAnyAccessToken(page);
  if (hasToken) {
    console.warn(
      `[auth] /login with token present — ${phase} (skipping hard fail; stabilize/hydration should follow or already ran)`
    );
    return;
  }

  console.error('[auth] Unexpected /login — current URL:', page.url());
  console.error('[auth] phase:', phase);
  await logBrowserAuthDebug(page, `${phase}-failIfLoginRedirect`);

  if (testInfo) {
    await attachAuthFailureArtifacts(page, testInfo, phase);
  } else {
    const diag = await logAuthDiagnostics(page, phase);
    console.error('[auth] cookies:', JSON.stringify(diag.cookies, null, 2));
    console.error('[auth] localStorage keys:', diag.localStorageKeys);
    console.error('[auth] localStorage (full):', JSON.stringify(diag.localStorage, null, 2));
  }

  throw new Error(
    `Authenticated session lost (redirected to /login) — ${phase}. See trace, auth-diagnostics.json, and screenshot when attached.`
  );
}

/**
 * Fail fast after any navigation or action that might invalidate seeded auth.
 *
 * @example
 * await page.goto('/payment-links');
 * await assertStillAuthenticated(page, testInfo, 'after /payment-links');
 */
export async function assertStillAuthenticated(
  page: Page,
  testInfo: TestInfo,
  context = 'assertStillAuthenticated'
): Promise<void> {
  if (!pathnameLooksLikeLogin(page)) {
    await handleSessionTimeout(page);
  }
  await stabilizeAuthHydration(page, testInfo, context);
  await failIfLoginRedirect(page, testInfo, context);
  await resolveLoginPathWithTokens(page, testInfo, context);
  if (pathnameLooksLikeLogin(page)) {
    await logBrowserAuthDebug(page, `${context}-still-on-login-post-stabilize`);
    throw new Error(`Session stuck on /login after hydration — ${context}`);
  }
  await assertAccessTokenPresent(page, testInfo, context);
}
