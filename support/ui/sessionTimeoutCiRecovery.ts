import type { Page, TestInfo } from '@playwright/test';
import { mirrorSessionUserTokensToLocalStorage, waitForBearerTokenInPage } from '../auth/browserAuthSession';
import {
  attemptUiLoginRecovery,
  attemptUiLoginRecoveryFromLoginRoute,
  logBrowserAuthDebug,
} from './authSessionRecovery';
import { handleSessionTimeout } from './handleSessionTimeout';
import { gotoWithRetry } from './navigation';

/**
 * When the SPA shows a session-expired / re-auth modal, `handleSessionTimeout` throws.
 * In CI, attempt one UI re-login and re-check so mid-suite flakes from stale UI state can recover.
 */
export async function handleSessionTimeoutWithOptionalCiRecovery(
  page: Page,
  _testInfo: TestInfo | undefined,
  label: string
): Promise<void> {
  try {
    await handleSessionTimeout(page);
    return;
  } catch (err) {
    if (!process.env.CI) {
      throw err;
    }
    console.warn(`[auth] ${label}: session timeout UI in CI — attempting UI recovery`);
    await logBrowserAuthDebug(page, `${label}-session-timeout-before-recovery`);
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
