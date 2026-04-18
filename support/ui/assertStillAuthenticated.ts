import type { Page, TestInfo } from '@playwright/test';
import { attachAuthFailureArtifacts, logAuthDiagnostics } from '../auth/debugAuthState';
import { handleSessionTimeout } from './handleSessionTimeout';

/**
 * After navigation, confirm a bearer-like token is still in `localStorage` (SPA auth).
 * Call after `failIfLoginRedirect` when the URL is not `/login`.
 */
export async function assertAccessTokenPresent(
  page: Page,
  testInfo: TestInfo | undefined,
  phase: string
): Promise<void> {
  if (/\/login/i.test(page.url())) {
    return;
  }

  const token = await page.evaluate(() => {
    return (
      window.localStorage.getItem('accessToken') ??
      window.localStorage.getItem('token') ??
      window.localStorage.getItem('authToken')
    );
  });

  if (process.env.CI) {
    console.log(
      `[auth] ${phase}: url=${page.url()} accessTokenPresent=${Boolean(token && token.length > 0)}`
    );
  }

  if (token && token.length > 0) {
    return;
  }

  if (testInfo) {
    await attachAuthFailureArtifacts(page, testInfo, `${phase}-missing-access-token`);
  } else {
    await logAuthDiagnostics(page, `${phase}-missing-access-token`);
  }

  throw new Error(`Session invalid: missing accessToken (or token/authToken) in localStorage — ${phase}`);
}

/**
 * If the app redirected to `/login`, attach diagnostics (when `testInfo` is set), log URL / cookies / storage, and throw.
 * Used by `prepareAuthenticatedPage` and by specs after navigations that could drop session.
 */
export async function failIfLoginRedirect(
  page: Page,
  testInfo: TestInfo | undefined,
  phase: string
): Promise<void> {
  const url = page.url();
  if (!/\/login/i.test(url)) return;

  console.error('[auth] Unexpected /login — current URL:', url);
  console.error('[auth] phase:', phase);

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
  // Session-expiry / forced re-auth modals often appear before URL becomes `/login`.
  if (!/\/login/i.test(page.url())) {
    await handleSessionTimeout(page);
  }
  await failIfLoginRedirect(page, testInfo, context);
  await assertAccessTokenPresent(page, testInfo, context);
}
