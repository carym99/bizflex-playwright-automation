import { type Page, type TestInfo } from '@playwright/test';
import { failIfLoginRedirect } from './assertStillAuthenticated';
import { dismissCardModal } from './dismissCardModal';
import { dismissCookieBanner } from './dismissCookieBanner';
import { handleSessionTimeout } from './handleSessionTimeout';
import { waitForDashboardReadiness } from './dashboardReadiness';
import { readAuthSessionSeed } from '../auth/storageState';
import { gotoWithRetry } from './navigation';

async function waitForAccountOrLoginRoute(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const p = window.location.pathname.toLowerCase();
        return p.includes('account') || p.includes('login');
      },
      { timeout: 25_000 }
    )
    .catch(() => {});
}

async function attemptUiLoginRecovery(page: Page): Promise<boolean> {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;
  if (!email || !password) {
    return false;
  }

  const emailInput = page
    .locator('[data-testid="email"], [data-testid="email-input"], input[type="email"]')
    .first();
  const passwordInput = page
    .locator('[data-testid="password"], [data-testid="password-input"], input[type="password"]')
    .first();
  const submit = page.getByRole('button', { name: /login|sign in/i }).first();

  const hasLoginForm =
    (await emailInput.isVisible().catch(() => false)) &&
    (await passwordInput.isVisible().catch(() => false)) &&
    (await submit.isVisible().catch(() => false));
  if (!hasLoginForm) return false;

  await emailInput.fill(email);
  await passwordInput.fill(password);
  await submit.click();
  await page.waitForURL(/\/account/i, { timeout: 45_000 });
  console.warn('[auth] Seeded session redirected to /login; recovered with UI login fallback');
  return true;
}

/**
 * Standard entry for authenticated UI flows: land on account, clear interruptions, assert dashboard shell.
 * Always pass `testInfo` so an unexpected `/login` redirect attaches `auth-diagnostics.json` + screenshot.
 */
export async function prepareAuthenticatedPage(page: Page, testInfo: TestInfo): Promise<void> {
  const sessionSeed = readAuthSessionSeed();
  if (sessionSeed) {
    await page.addInitScript(
      ({ user, email }) => {
        window.sessionStorage.setItem('user', JSON.stringify(user));
        window.sessionStorage.setItem('email', email);
      },
      { user: sessionSeed.user, email: sessionSeed.email }
    );
  }

  await gotoWithRetry(page, '/account', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('load');
  await waitForAccountOrLoginRoute(page);
  if (/\/login/i.test(page.url())) {
    const recovered = await attemptUiLoginRecovery(page);
    if (!recovered) {
      await failIfLoginRedirect(page, testInfo, 'prepareAuthenticatedPage: initial navigation');
    }
  }
  await failIfLoginRedirect(page, testInfo, 'prepareAuthenticatedPage: after recovery check');

  await handleSessionTimeout(page);
  await dismissCardModal(page);
  await dismissCookieBanner(page);

  await waitForDashboardReadiness(page);
  await failIfLoginRedirect(page, testInfo, 'prepareAuthenticatedPage: after dashboard wait');
}
