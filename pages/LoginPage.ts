import { type Page, type TestInfo, expect } from '@playwright/test';
import { assertStillAuthenticated } from '../support/ui/assertStillAuthenticated';
import { ensureBizflexCardModalClosed } from '../utils/modal';
import { mergeAccountSelectOptions, type AccountSelectOptions } from '../config/accountContext';
import { urlIsAccountDashboard } from '../support/ui/accountRoutes';
import { resolveSelectAccountToDashboardIfNeeded } from '../support/ui/selectAccount';
import {
  assertLoginFormReady,
  getLoginEmailInput,
  getLoginPasswordInput,
  getLoginSubmitButton,
} from '../support/ui/loginHelpers';
import { waitForLoginOutcomeAfterSubmit } from '../support/ui/waitForLoginOutcome';
import { gotoWithRetry } from '../support/ui/navigation';

/**
 * Minimal UI login + verification — mirrors stable Cypress authSelectors.
 * Default suite uses API-injected storage; use uiLogin() for ~20% UI verification flows.
 */
export class LoginPage {
  constructor(private readonly page: Page) {}

  /** ~20% UI check: authenticated session can load account shell. */
  async verifyLoggedIn(testInfo: TestInfo): Promise<void> {
    await gotoWithRetry(this.page, '/account', { waitUntil: 'domcontentloaded' });
    await resolveSelectAccountToDashboardIfNeeded(this.page, mergeAccountSelectOptions());
    await assertStillAuthenticated(this.page, testInfo, 'LoginPage.verifyLoggedIn');
    await ensureBizflexCardModalClosed(this.page);
    await expect(this.page).toHaveURL(urlIsAccountDashboard, { timeout: 45_000 });
    const body = this.page.locator('body');
    await expect(body).toContainText(/quick action|account|dashboard|bizflex/i, { timeout: 20_000 });
  }

  /**
   * Full browser login (no pre-seeded storage) — use in dedicated projects or before generateStorageState validation.
   * @param completeAccountSelection When false, stops after `/select-account` (picker specs).
   */
  async uiLogin(
    email: string,
    password: string,
    accountOptions?: AccountSelectOptions,
    options?: { completeAccountSelection?: boolean }
  ): Promise<void> {
    const navTimeout = process.env.CI ? 120_000 : 60_000;
    const accountTimeout = process.env.CI ? 90_000 : 45_000;
    const submitEnableTimeout = process.env.CI ? 45_000 : 20_000;

    await gotoWithRetry(this.page, '/login', {
      waitUntil: process.env.CI ? 'networkidle' : 'domcontentloaded',
      timeout: navTimeout,
    });
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});

    await assertLoginFormReady(this.page);

    const emailInput = getLoginEmailInput(this.page);
    const passwordInput = getLoginPasswordInput(this.page);
    const submitButton = getLoginSubmitButton(this.page);

    await expect(emailInput).toBeEditable({ timeout: 15_000 });
    await expect(passwordInput).toBeEditable({ timeout: 15_000 });
    await emailInput.fill(email);
    await passwordInput.fill(password);
    await expect(submitButton).toBeEnabled({ timeout: submitEnableTimeout });

    await submitButton.click();
    const stillOnLogin = () => /\/login(\/|$)/i.test(new URL(this.page.url()).pathname);
    if (stillOnLogin()) {
      await passwordInput.press('Enter').catch(() => {});
    }

    const outcome = await waitForLoginOutcomeAfterSubmit(this.page, {
      timeoutMs: accountTimeout,
      emailForErrors: email,
    });

    const complete = options?.completeAccountSelection !== false;
    if (!complete) {
      if (outcome.kind !== 'select-account' && outcome.kind !== 'account') {
        throw new Error(
          `Login did not reach /select-account or /account (url=${this.page.url()}). ` +
            `Check UI_USER_EMAIL + UI_USER_PASSWORD (or TEST_EMAIL + TEST_PASSWORD) and API_URL.`
        );
      }
      return;
    }

    if (complete && outcome.kind === 'account') {
      await resolveSelectAccountToDashboardIfNeeded(this.page, accountOptions);
      await expect(this.page).toHaveURL(urlIsAccountDashboard, { timeout: accountTimeout });
      await this.page.waitForLoadState('domcontentloaded').catch(() => {});
      await ensureBizflexCardModalClosed(this.page);
      return;
    }

    if (complete && outcome.kind === 'select-account') {
      await resolveSelectAccountToDashboardIfNeeded(this.page, accountOptions);
      await expect(this.page).toHaveURL(urlIsAccountDashboard, { timeout: accountTimeout });
      await this.page.waitForLoadState('domcontentloaded').catch(() => {});
      await ensureBizflexCardModalClosed(this.page);
    }
  }
}
