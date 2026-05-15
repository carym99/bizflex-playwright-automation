/**
 * Account switching after login — `/select-account` picker and dashboard context.
 */
import { test, expect } from '@playwright/test';
import { getUiEmail, getValidPassword } from '../../fixtures/auth.fixture';
import {
  resolveBusinessAccountContextFromEnv,
  resolveFreelanceAccountContextFromEnv,
} from '../../config/accountContext';
import { LoginPage } from '../../pages/LoginPage';
import { SelectAccountPage } from '../../pages/SelectAccountPage';
import { urlIsAccountDashboard } from '../../support/ui/accountRoutes';
import { selectAccountOnPicker } from '../../support/ui/selectAccount';
import { loginAndSelectAccount } from '../../support/ui/loginAndSelectAccount';
import { gotoWithRetry } from '../../support/ui/navigation';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe.configure({ timeout: 120_000 });

async function loginToAccountPicker(page: import('@playwright/test').Page): Promise<void> {
  const loginPage = new LoginPage(page);
  await loginPage.uiLogin(getUiEmail(), getValidPassword(), undefined, { completeAccountSelection: false });
  const picker = new SelectAccountPage(page);
  if (!picker.isOnSelectAccountPath()) {
    await gotoWithRetry(page, '/select-account', { waitUntil: 'domcontentloaded' });
  }
  await picker.assertOnSelectAccountScreen();
}

test.describe('@auth Account selection after login', () => {
  test('user lands on select-account and sees account picker', async ({ page }) => {
    await loginToAccountPicker(page);
    const picker = new SelectAccountPage(page);
    const count = await picker.countVisibleAccountCards();
    expect(count, 'QA user should have at least one linked account').toBeGreaterThan(0);
  });

  test('user sees freelance account option when configured', async ({ page }) => {
    const freelance = resolveFreelanceAccountContextFromEnv();
    test.skip(!freelance.accountName && !freelance.accountId, 'Set E2E_FREELANCE_ACCOUNT_NAME or E2E_FREELANCE_ACCOUNT_ID');

    await loginToAccountPicker(page);
    const picker = new SelectAccountPage(page);

    if (freelance.accountName) {
      await expect(picker.cardByNameSubstring(freelance.accountName)).toBeVisible({ timeout: 15_000 });
    } else if (freelance.accountId) {
      await expect(picker.cardByTestId(freelance.accountId)).toBeVisible({ timeout: 15_000 });
    } else {
      await expect(picker.freelanceCards().first()).toBeVisible({ timeout: 15_000 });
    }
  });

  test('user sees business account option when configured', async ({ page }) => {
    const business = resolveBusinessAccountContextFromEnv('default');
    test.skip(!business.accountName && !business.accountId, 'Set E2E_BUSINESS_ACCOUNT_NAME or E2E_BUSINESS_ACCOUNT_ID');

    await loginToAccountPicker(page);
    const picker = new SelectAccountPage(page);

    if (business.accountName) {
      await expect(picker.cardByNameSubstring(business.accountName)).toBeVisible({ timeout: 15_000 });
    } else if (business.accountId) {
      await expect(picker.cardByTestId(business.accountId)).toBeVisible({ timeout: 15_000 });
    } else {
      await expect(picker.businessCards().first()).toBeVisible({ timeout: 15_000 });
    }
  });

  test('user can select freelance account and reach dashboard', async ({ page }) => {
    const freelance = resolveFreelanceAccountContextFromEnv();
    test.skip(
      !freelance.accountName && !freelance.accountId,
      'Configure E2E_FREELANCE_ACCOUNT_NAME or E2E_FREELANCE_ACCOUNT_ID'
    );

    await loginToAccountPicker(page);
    const result = await selectAccountOnPicker(page, { ...freelance, accountType: 'freelance' });
    await expect(page).toHaveURL(urlIsAccountDashboard, { timeout: 45_000 });
    if (result.selectedLabel || freelance.accountName) {
      const hint = result.selectedLabel ?? freelance.accountName ?? '';
      const fragment = hint.split(/\s+/)[0];
      if (fragment.length >= 3) {
        await expect(page.locator('body')).toContainText(new RegExp(fragment, 'i'));
      }
    }
  });

  test('user can select business account and reach dashboard', async ({ page }) => {
    const business = resolveBusinessAccountContextFromEnv('default');
    test.skip(
      !business.accountName && !business.accountId,
      'Configure E2E_BUSINESS_ACCOUNT_NAME or E2E_BUSINESS_ACCOUNT_ID'
    );

    await loginToAccountPicker(page);
    const result = await selectAccountOnPicker(page, { ...business, accountType: 'business' });
    await expect(page).toHaveURL(urlIsAccountDashboard, { timeout: 45_000 });
    if (result.selectedLabel || business.accountName) {
      const hint = result.selectedLabel ?? business.accountName ?? '';
      const fragment = hint.split(/\s+/)[0];
      if (fragment.length >= 3) {
        await expect(page.locator('body')).toContainText(new RegExp(fragment, 'i'));
      }
    }
  });

  test('user can switch from freelance to business via select-account', async ({ page }) => {
    const freelance = resolveFreelanceAccountContextFromEnv();
    const business = resolveBusinessAccountContextFromEnv('default');
    test.skip(
      (!freelance.accountName && !freelance.accountId) || (!business.accountName && !business.accountId),
      'Set E2E_FREELANCE_ACCOUNT_NAME and E2E_BUSINESS_ACCOUNT_NAME for switch test'
    );

    await loginToAccountPicker(page);
    await selectAccountOnPicker(page, { ...freelance, accountType: 'freelance' });
    await expect(page).toHaveURL(urlIsAccountDashboard, { timeout: 45_000 });
    const freelanceFragment = (freelance.accountName ?? '').split(/\s+/)[0];
    if (freelanceFragment.length >= 3) {
      await expect(page.locator('body')).toContainText(new RegExp(freelanceFragment, 'i'));
    }

    await gotoWithRetry(page, '/select-account', { waitUntil: 'domcontentloaded' });
    await selectAccountOnPicker(page, { ...business, accountType: 'business' });
    await expect(page).toHaveURL(urlIsAccountDashboard, { timeout: 45_000 });
    const businessFragment = (business.accountName ?? '').split(/\s+/)[0];
    if (businessFragment.length >= 3) {
      await expect(page.locator('body')).toContainText(new RegExp(businessFragment, 'i'));
    }
  });
});

test.describe('@auth loginAndSelectAccount helper', () => {
  test('loginAndSelectAccount reaches dashboard with env default context', async ({ page }) => {
    await loginAndSelectAccount(page, { skipLoginIfAuthenticated: false });
    await expect(page).toHaveURL(urlIsAccountDashboard, { timeout: 45_000 });
  });
});
