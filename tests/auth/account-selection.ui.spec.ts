/**
 * Account switching after login — `/select-account` picker and dashboard context.
 */
import { test, expect } from '@playwright/test';
import { getUiEmail, getUiPassword } from '../../fixtures/auth.fixture';
import {
  businessEnvSkipReason,
  freelanceEnvSkipReason,
  resolveBusinessAccountContextFromEnv,
  resolveFreelanceAccountContextFromEnv,
} from '../../config/accountContext';
import { LoginPage } from '../../pages/LoginPage';
import { SelectAccountPage } from '../../pages/SelectAccountPage';
import { urlIsAccountDashboard } from '../../support/ui/accountRoutes';
import { attachAccountContextCapture } from '../../support/ui/accountContextApi';
import { selectAccountOnPicker, assertActiveAccountContext } from '../../support/ui/selectAccount';
import { loginAndSelectAccount } from '../../support/ui/loginAndSelectAccount';
import { gotoWithRetry } from '../../support/ui/navigation';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe.configure({ timeout: 120_000 });

async function loginToAccountPicker(page: import('@playwright/test').Page): Promise<void> {
  attachAccountContextCapture(page);
  const loginPage = new LoginPage(page);
  await loginPage.uiLogin(getUiEmail(), getUiPassword(), undefined, { completeAccountSelection: false });
  const picker = new SelectAccountPage(page);
  if (!picker.isOnSelectAccountPath() && !(await picker.pickerHeading().isVisible().catch(() => false))) {
    await gotoWithRetry(page, '/select-account', { waitUntil: 'domcontentloaded' });
  }
  if (stillOnLogin(page)) {
    throw new Error(
      `Still on /login after submit (url=${page.url()}). ` +
        `Likely invalid credentials or login API wait mismatch — verify UI_USER_EMAIL/UI_USER_PASSWORD in .env.local.`
    );
  }
  await picker.assertPickerShellVisible();
}

function stillOnLogin(page: import('@playwright/test').Page): boolean {
  try {
    return /^\/login(\/|$)/i.test(new URL(page.url()).pathname);
  } catch {
    return false;
  }
}

test.describe('@auth @account-selection Account selection after login', () => {
  test('user lands on select-account and sees account picker', async ({ page }) => {
    await loginToAccountPicker(page);
    const picker = new SelectAccountPage(page);
    await expect(picker.pickerHeading()).toHaveText(/choose an account to continue/i);
    await expect(picker.continueButton()).toBeVisible();
    await expect(picker.addNewAccountButton()).toBeVisible();
    const count = await picker.countVisibleAccountCards();
    expect(count, 'QA user should have at least one linked account').toBeGreaterThan(0);
  });

  test('user sees freelance account option when configured', async ({ page }) => {
    const freelance = resolveFreelanceAccountContextFromEnv();
    const skip = freelanceEnvSkipReason();
    test.skip(!!skip, skip ?? '');

    await loginToAccountPicker(page);
    const picker = new SelectAccountPage(page);
    await picker.assertConfiguredAccountVisible(freelance);
    await expect(picker.freelanceCards().first()).toContainText(/freelancer/i);
  });

  test('user sees business account option when configured', async ({ page }) => {
    const business = resolveBusinessAccountContextFromEnv('default');
    const skip = businessEnvSkipReason('default');
    test.skip(!!skip, skip ?? '');

    await loginToAccountPicker(page);
    const picker = new SelectAccountPage(page);
    await picker.assertConfiguredAccountVisible(business);
    await expect(picker.businessCards().first()).toContainText(/business/i);
  });

  test('user sees second business account when configured', async ({ page }) => {
    const business2 = resolveBusinessAccountContextFromEnv('secondary');
    const skip = businessEnvSkipReason('secondary');
    test.skip(!!skip, skip ?? '');

    await loginToAccountPicker(page);
    const picker = new SelectAccountPage(page);
    await picker.assertConfiguredAccountVisible(business2);
  });

  test('user can select freelance account and reach dashboard', async ({ page }) => {
    const freelance = resolveFreelanceAccountContextFromEnv();
    const skip = freelanceEnvSkipReason();
    test.skip(!!skip, skip ?? '');

    await loginToAccountPicker(page);
    const result = await selectAccountOnPicker(page, { ...freelance, accountType: 'freelance' });
    await expect(page).toHaveURL(urlIsAccountDashboard, { timeout: 45_000 });
    await assertActiveAccountContext(page, result);
  });

  test('user can select business account and reach dashboard', async ({ page }) => {
    const business = resolveBusinessAccountContextFromEnv('default');
    const skip = businessEnvSkipReason('default');
    test.skip(!!skip, skip ?? '');

    await loginToAccountPicker(page);
    const result = await selectAccountOnPicker(page, { ...business, accountType: 'business' });
    await expect(page).toHaveURL(urlIsAccountDashboard, { timeout: 45_000 });
    await assertActiveAccountContext(page, result);
  });

  test('user can switch from freelance to business via select-account', async ({ page }) => {
    const freelance = resolveFreelanceAccountContextFromEnv();
    const business = resolveBusinessAccountContextFromEnv('default');
    const skipFreelance = freelanceEnvSkipReason();
    const skipBusiness = businessEnvSkipReason('default');
    test.skip(!!skipFreelance || !!skipBusiness, skipFreelance ?? skipBusiness ?? '');

    await loginToAccountPicker(page);
    const freelanceResult = await selectAccountOnPicker(page, { ...freelance, accountType: 'freelance' });
    await expect(page).toHaveURL(urlIsAccountDashboard, { timeout: 45_000 });
    await assertActiveAccountContext(page, freelanceResult);

    await gotoWithRetry(page, '/select-account', { waitUntil: 'domcontentloaded' });
    const businessResult = await selectAccountOnPicker(page, { ...business, accountType: 'business' });
    await expect(page).toHaveURL(urlIsAccountDashboard, { timeout: 45_000 });
    await assertActiveAccountContext(page, businessResult);
  });

  test('user can switch between two business accounts when configured', async ({ page }) => {
    const business1 = resolveBusinessAccountContextFromEnv('default');
    const business2 = resolveBusinessAccountContextFromEnv('secondary');
    const skip1 = businessEnvSkipReason('default');
    const skip2 = businessEnvSkipReason('secondary');
    test.skip(!!skip1 || !!skip2, skip1 ?? skip2 ?? '');

    await loginToAccountPicker(page);
    const first = await selectAccountOnPicker(page, { ...business1, accountType: 'business' });
    await expect(page).toHaveURL(urlIsAccountDashboard, { timeout: 45_000 });
    await assertActiveAccountContext(page, first);

    await gotoWithRetry(page, '/select-account', { waitUntil: 'domcontentloaded' });
    const second = await selectAccountOnPicker(page, { ...business2, accountType: 'business' });
    await expect(page).toHaveURL(urlIsAccountDashboard, { timeout: 45_000 });
    await assertActiveAccountContext(page, second);
  });
});

test.describe('@auth @account-selection loginAndSelectAccount helper', () => {
  test('loginAndSelectAccount reaches dashboard with env default context', async ({ page }) => {
    await loginAndSelectAccount(page, { skipLoginIfAuthenticated: false });
    await expect(page).toHaveURL(urlIsAccountDashboard, { timeout: 45_000 });
  });
});
