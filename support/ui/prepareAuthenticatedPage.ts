import { type Page, type TestInfo } from '@playwright/test';
import { attachAuthFailureArtifacts, logAuthDiagnostics } from '../auth/debugAuthState';
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

async function failIfLoginPage(page: Page, testInfo: TestInfo | undefined, phase: string): Promise<void> {
  const url = page.url();
  if (!/\/login/i.test(url)) return;

  console.error('[auth] Redirected to login despite seeded auth — phase:', phase, 'URL:', url);
  if (testInfo) {
    await attachAuthFailureArtifacts(page, testInfo, `prepareAuthenticatedPage: ${phase}`);
  } else {
    await logAuthDiagnostics(page, `prepareAuthenticatedPage: ${phase}`);
  }
  throw new Error(
    `Authenticated UI reached /login (${phase}). See trace, screenshot, and auth-diagnostics.json attachment.`
  );
}

/**
 * Standard entry for authenticated UI flows: land on account, clear interruptions, assert dashboard shell.
 * Pass `testInfo` from the test body so login redirects attach JSON + screenshot to the report.
 */
export async function prepareAuthenticatedPage(page: Page, testInfo?: TestInfo): Promise<void> {
  await page.goto('/account', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('load');
  await waitForAccountOrLoginRoute(page);
  await failIfLoginPage(page, testInfo, 'initial navigation');

  await handleSessionTimeout(page);
  await dismissCardModal(page);
  await dismissCookieBanner(page);

  await waitForDashboardReadiness(page);
  await failIfLoginPage(page, testInfo, 'after dashboard wait');
}
