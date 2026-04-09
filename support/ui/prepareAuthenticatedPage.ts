import { type Page, type TestInfo } from '@playwright/test';
import { failIfLoginRedirect } from './assertStillAuthenticated';
import { dismissCardModal } from './dismissCardModal';
import { dismissCookieBanner } from './dismissCookieBanner';
import { handleSessionTimeout } from './handleSessionTimeout';
import { waitForDashboardReadiness } from './dashboardReadiness';

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

/**
 * Standard entry for authenticated UI flows: land on account, clear interruptions, assert dashboard shell.
 * Always pass `testInfo` so an unexpected `/login` redirect attaches `auth-diagnostics.json` + screenshot.
 */
export async function prepareAuthenticatedPage(page: Page, testInfo: TestInfo): Promise<void> {
  await page.goto('/account', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('load');
  await waitForAccountOrLoginRoute(page);
  await failIfLoginRedirect(page, testInfo, 'prepareAuthenticatedPage: initial navigation');

  await handleSessionTimeout(page);
  await dismissCardModal(page);
  await dismissCookieBanner(page);

  await waitForDashboardReadiness(page);
  await failIfLoginRedirect(page, testInfo, 'prepareAuthenticatedPage: after dashboard wait');
}
