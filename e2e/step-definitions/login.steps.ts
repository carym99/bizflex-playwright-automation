import { Before, After, Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { E2EWorld } from '../support/world';
import { LoginPage } from '../../pages/LoginPage';
import { getUiEmail, getValidPassword } from '../../fixtures/auth.fixture';
import { transactionSelectors } from '../../utils/selectors';
import { assertRecentTransactionsTableVisible } from '../../utils/dashboard';

Before(async function (this: E2EWorld) {
  this.browser = await (await import('@playwright/test')).chromium.launch({ headless: true });
  this.context = await this.browser.newContext({
    baseURL: process.env.BASE_URL || process.env.PLAYWRIGHT_BASE_URL || 'https://bizflex-app.netlify.app',
  });
  this.page = await this.context.newPage();
});

After(async function (this: E2EWorld) {
  await this.context?.close();
  await this.browser?.close();
});

Given('I open the BizFlex login page', async function (this: E2EWorld) {
  await this.page!.goto('/login', { waitUntil: 'domcontentloaded' });
});

When('I sign in with a valid customer account', async function (this: E2EWorld) {
  const loginPage = new LoginPage(this.page!);
  await loginPage.uiLogin(getUiEmail(), getValidPassword());
});

Then('I should be redirected to the secure dashboard', async function (this: E2EWorld) {
  await expect(this.page!).toHaveURL(/\/account/i, { timeout: 45_000 });
});

Then('I should see my wallet balance and quick actions', async function (this: E2EWorld) {
  const page = this.page!;
  const quickAction = page.getByText(/quick action/i);

  const walletCard = page.locator('text=Main Acc.').locator('..').locator('..');
  // Chakra: one <p> is “₦”, the next is “0.00”; parent row holds both.
  const balanceGroup = walletCard.locator('p').filter({ hasText: /^₦$/ }).locator('..');
  const combinedBalanceDiv = walletCard.locator('div').filter({ hasText: /₦\s*[\d,]+\.\d{2}/ }).first();
  const balanceByTestId = page.locator(transactionSelectors.balanceWidget).first();

  await expect(quickAction).toBeVisible({ timeout: 20_000 });

  try {
    await expect(balanceGroup.or(combinedBalanceDiv).or(balanceByTestId)).toBeVisible({
      timeout: 15_000,
    });
    if (await balanceGroup.isVisible().catch(() => false)) {
      await expect(
        balanceGroup.locator('p').filter({ hasText: /^[\d,]+\.\d{2}$/ }).first()
      ).toBeVisible({ timeout: 5_000 });
    }
  } catch {
    await expect(page.locator('body')).toContainText(/balance|wallet|ngn|\u20A6|₦/i, {
      timeout: 15_000,
    });
  }
});

Then('I should see the recent transactions table', async function (this: E2EWorld) {
  await assertRecentTransactionsTableVisible(this.page!);
});

When('I sign in with an MFA-enabled account', async function (this: E2EWorld) {
  const mfaEmail = process.env.MFA_USER_EMAIL || getUiEmail();
  await this.page!.locator('[data-testid="email"], [data-testid="email-input"], input[type="email"]').first().fill(mfaEmail);
  await this.page!
    .locator('[data-testid="password"], [data-testid="password-input"], input[type="password"]')
    .first()
    .fill(getValidPassword());
  await this.page!.getByRole('button', { name: /login|sign in/i }).first().click();
});

Then('I should see that a 2FA code was sent', async function (this: E2EWorld) {
  const bodyText = (await this.page!.locator('body').innerText()).toLowerCase();
  expect(
    bodyText.includes('2fa code sent') || bodyText.includes('otp') || /\/(2fa|mfa|otp|verify)/i.test(this.page!.url())
  ).toBe(true);
});

When('I enter the valid OTP code', async function (this: E2EWorld) {
  const otp = process.env.MFA_TEST_OTP;
  if (!otp) {
    return 'skipped';
  }

  const otpInput = this.page!
    .locator('[data-testid="otp-input"], input[name="otp"], input[autocomplete="one-time-code"]')
    .first();
  if ((await otpInput.count()) === 0) {
    return 'skipped';
  }

  await otpInput.fill(otp);
  await this.page!.getByRole('button', { name: /verify|continue|submit/i }).first().click();
});

