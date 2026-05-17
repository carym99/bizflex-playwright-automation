import { type Page, type TestInfo } from '@playwright/test';
import { mirrorSessionUserTokensToLocalStorage } from '../auth/browserAuthSession';
import { assertAccessTokenPresent, failIfLoginRedirect } from './assertStillAuthenticated';
import { dismissCardModal } from './dismissCardModal';
import { dismissCookieBanner } from './dismissCookieBanner';
import { waitForDashboardReadiness } from './dashboardReadiness';
import { handleSessionTimeoutWithOptionalCiRecovery } from './sessionTimeoutCiRecovery';
import { readAuthSessionSeed } from '../auth/storageState';
import { pathnameLooksLikeAccountDashboardPath } from './accountRoutes';
import type { AccountSelectOptions } from '../../config/accountContext';
import { attachAccountContextCapture } from './accountContextApi';
import { ensureAuthenticatedDashboardPage } from './ensureAuthenticatedDashboard';
import { isDashboardShellVisible } from './dashboardReadiness';

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

function getPathname(page: Page): string {
  try {
    return new URL(page.url()).pathname.trim().toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Standard entry for authenticated UI flows: account context selected, dashboard shell, session verified.
 * Idempotent when the fixture already ran `ensureAuthenticatedDashboardPage`.
 */
export async function prepareAuthenticatedPage(
  page: Page,
  testInfo: TestInfo,
  accountOptions?: AccountSelectOptions
): Promise<void> {
  attachAccountContextCapture(page);

  const path = getPathname(page);
  const shellVisible = await isDashboardShellVisible(page);
  if (!pathnameLooksLikeAccountDashboardPath(path) || !shellVisible) {
    await ensureAuthenticatedDashboardPage(page, testInfo, accountOptions);
  }

  await mirrorSessionUserTokensToLocalStorage(page).catch(() => {});
  await handleSessionTimeoutWithOptionalCiRecovery(page, testInfo, 'prepareAuthenticatedPage');
  await dismissCardModal(page);
  await dismissCookieBanner(page);
  await waitForDashboardReadiness(page);
  await failIfLoginRedirect(page, testInfo, 'prepareAuthenticatedPage: after dashboard wait');
  await assertAccessTokenPresent(page, testInfo, 'prepareAuthenticatedPage: after dashboard wait');
}
