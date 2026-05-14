import type { Page } from '@playwright/test';
import { pathnameLooksLikeAccountDashboardPath, pathnameLooksLikeSelectAccountPath } from './accountRoutes';
import { gotoWithRetry } from './navigation';

function getPathname(page: Page): string {
  try {
    return new URL(page.url()).pathname.trim().toLowerCase();
  } catch {
    return '';
  }
}

/**
 * After login, BizFlex may land on `/select-account` before any dashboard API calls succeed.
 * Resolves to `/account/...` when possible so `waitForDashboardReadiness` can run.
 *
 * Prefer stable app testids; set `E2E_DEFAULT_ACCOUNT_ID` to match `data-testid="select-account-option-<id>"` (or `account-option-<id>`).
 */
export async function resolveSelectAccountToDashboardIfNeeded(page: Page): Promise<void> {
  const path = () => getPathname(page);
  if (!pathnameLooksLikeSelectAccountPath(path())) return;

  const preferredId = process.env.E2E_DEFAULT_ACCOUNT_ID?.trim();
  if (preferredId) {
    const explicit = page
      .locator(
        `[data-testid="select-account-option-${preferredId}"], [data-testid="account-option-${preferredId}"], [data-testid="select-account-row-${preferredId}"]`
      )
      .first();
    if (await explicit.isVisible({ timeout: 12_000 }).catch(() => false)) {
      await explicit.click();
      await page
        .waitForFunction(
          () => /^\/account(\/|$)/i.test(new URL(window.location.href).pathname),
          null,
          { timeout: 45_000 }
        )
        .catch(() => {});
      if (pathnameLooksLikeAccountDashboardPath(path())) return;
    }
  }

  // Some sessions redirect to dashboard when only one context applies.
  await gotoWithRetry(page, '/account', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  if (pathnameLooksLikeAccountDashboardPath(path())) return;

  if (!pathnameLooksLikeSelectAccountPath(path())) return;

  const continueBtn = page.getByRole('button', {
    name: /continue|proceed|go to dashboard|enter dashboard|select|open dashboard/i,
  }).first();
  if (await continueBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await continueBtn.click();
    await page
      .waitForFunction(
        () => /^\/account(\/|$)/i.test(new URL(window.location.href).pathname),
        null,
        { timeout: 45_000 }
      )
      .catch(() => {});
    if (pathnameLooksLikeAccountDashboardPath(path())) return;
  }

  if (pathnameLooksLikeSelectAccountPath(path())) {
    throw new Error(
      'Stuck on /select-account: add data-testid="select-account-option-<accountId>" (or account-option-<id>) ' +
        'on the picker, set E2E_DEFAULT_ACCOUNT_ID in .env.local / CI to that id, or extend resolveSelectAccount.ts with your primary CTA label.'
    );
  }
}
