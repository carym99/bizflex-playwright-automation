import type { Locator, Page } from '@playwright/test';
import { pathnameLooksLikeAccountDashboardPath, pathnameLooksLikeSelectAccountPath } from './accountRoutes';
import { gotoWithRetry } from './navigation';

function getPathname(page: Page): string {
  try {
    return new URL(page.url()).pathname.trim().toLowerCase();
  } catch {
    return '';
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Account rows on `/select-account` are Chakra `role="button"` tiles (Freelancer / Business), not unstable `css-*` classes.
 * Excludes primary chrome: Continue, Add New Account.
 */
function accountPickerCards(page: Page): Locator {
  return page
    .getByRole('button')
    .filter({ hasText: /Freelancer|Business/i })
    .filter({ hasNotText: /^Add New Account$/i })
    .filter({ hasNotText: /^Continue$/i });
}

async function clickContinueToDashboard(page: Page): Promise<boolean> {
  const continueBtn = page.getByRole('button', { name: /^Continue$/i }).first();
  if (!(await continueBtn.isVisible({ timeout: 10_000 }).catch(() => false))) {
    return false;
  }
  await continueBtn.click();
  await page
    .waitForFunction(
      () => /^\/account(\/|$)/i.test(new URL(window.location.href).pathname),
      null,
      { timeout: 45_000 }
    )
    .catch(() => {});
  return pathnameLooksLikeAccountDashboardPath(getPathname(page));
}

/**
 * Picks an account tile when the UI requires an explicit selection before **Continue** enables navigation.
 */
async function clickPreferredAccountCard(page: Page): Promise<boolean> {
  const preferredId = process.env.E2E_DEFAULT_ACCOUNT_ID?.trim();
  if (preferredId) {
    const explicit = page
      .locator(
        `[data-testid="select-account-option-${preferredId}"], [data-testid="account-option-${preferredId}"], [data-testid="select-account-row-${preferredId}"]`
      )
      .first();
    if (await explicit.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await explicit.click();
      return true;
    }
  }

  const nameSub = process.env.E2E_SELECT_ACCOUNT_NAME?.trim();
  if (nameSub) {
    const byName = page.getByRole('button', { name: new RegExp(escapeRegExp(nameSub), 'i') }).first();
    if (await byName.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await byName.click();
      return true;
    }
  }

  const lastUsed = page.getByRole('button').filter({ hasText: /last used/i }).first();
  if (await lastUsed.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await lastUsed.click();
    return true;
  }

  const type = process.env.E2E_SELECT_ACCOUNT_TYPE?.trim().toLowerCase();
  if (type === 'freelancer') {
    const f = accountPickerCards(page).filter({ hasText: /freelancer/i }).first();
    if (await f.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await f.click();
      return true;
    }
  }
  if (type === 'business') {
    const b = accountPickerCards(page).filter({ hasText: /business/i }).first();
    if (await b.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await b.click();
      return true;
    }
  }

  const firstCard = accountPickerCards(page).first();
  if (await firstCard.isVisible({ timeout: 12_000 }).catch(() => false)) {
    await firstCard.click();
    return true;
  }

  return false;
}

/**
 * After login, BizFlex may land on [`/select-account`](https://bizflex-app.netlify.app/select-account) before the dashboard.
 *
 * Resolution order:
 * 1. Optional `data-testid` + `E2E_DEFAULT_ACCOUNT_ID`
 * 2. Nudge `/account` (auto-redirect for some sessions)
 * 3. Chakra flow: pick an account tile (`role="button"` with Freelancer/Business), then **Continue**
 *
 * Env: `E2E_SELECT_ACCOUNT_NAME` (substring of the card, e.g. `France Spain`), `E2E_SELECT_ACCOUNT_TYPE` (`freelancer`|`business`), `E2E_DEFAULT_ACCOUNT_ID` (with matching testids in the app).
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
    if (await explicit.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await explicit.click();
      if (await clickContinueToDashboard(page)) return;
      if (pathnameLooksLikeAccountDashboardPath(path())) return;
    }
  }

  await gotoWithRetry(page, '/account', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  if (pathnameLooksLikeAccountDashboardPath(path())) return;

  if (!pathnameLooksLikeSelectAccountPath(path())) return;

  const picked = await clickPreferredAccountCard(page);
  if (picked && (await clickContinueToDashboard(page))) return;
  if (pathnameLooksLikeAccountDashboardPath(path())) return;

  if (!pathnameLooksLikeSelectAccountPath(path())) return;

  if (await clickContinueToDashboard(page)) return;

  if (pathnameLooksLikeSelectAccountPath(path())) {
    throw new Error(
      'Stuck on /select-account: pick an account card then Continue. Set E2E_SELECT_ACCOUNT_NAME (e.g. business display name), ' +
        'E2E_SELECT_ACCOUNT_TYPE=freelancer|business, or E2E_DEFAULT_ACCOUNT_ID + data-testid on rows. See support/ui/resolveSelectAccount.ts.'
    );
  }
}
