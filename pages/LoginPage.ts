import { type Page, type TestInfo, expect } from '@playwright/test';
import { assertStillAuthenticated } from '../support/ui/assertStillAuthenticated';
import { ensureBizflexCardModalClosed } from '../utils/modal';
import { urlIsAccountDashboard } from '../support/ui/accountRoutes';
import { resolveSelectAccountToDashboardIfNeeded } from '../support/ui/resolveSelectAccount';
import {
  assertLoginFormReady,
  getLoginEmailInput,
  getLoginPasswordInput,
  getLoginSubmitButton,
} from '../support/ui/loginHelpers';
import { gotoWithRetry } from '../support/ui/navigation';
import { isAuthLoginRequest } from '../utils/loginResponse';

/**
 * Minimal UI login + verification — mirrors stable Cypress authSelectors.
 * Default suite uses API-injected storage; use uiLogin() for ~20% UI verification flows.
 */
export class LoginPage {
  constructor(private readonly page: Page) {}

  /** ~20% UI check: authenticated session can load account shell. */
  async verifyLoggedIn(testInfo: TestInfo): Promise<void> {
    await gotoWithRetry(this.page, '/account', { waitUntil: 'domcontentloaded' });
    await resolveSelectAccountToDashboardIfNeeded(this.page);
    await assertStillAuthenticated(this.page, testInfo, 'LoginPage.verifyLoggedIn');
    await ensureBizflexCardModalClosed(this.page);
    await expect(this.page).toHaveURL(urlIsAccountDashboard, { timeout: 45_000 });
    const body = this.page.locator('body');
    await expect(body).toContainText(/quick action|account|dashboard|bizflex/i, { timeout: 20_000 });
  }

  /**
   * Full browser login (no pre-seeded storage) — use in dedicated projects or before generateStorageState validation.
   */
  async uiLogin(email: string, password: string): Promise<void> {
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
    const loginResponse = this.page.waitForResponse((response) => isAuthLoginRequest(response.request()), {
      timeout: accountTimeout,
    });
    // Enter submit is more reliable than click on Chakra submit in CI.
    await passwordInput.press('Enter');
    await loginResponse;

    await this.page.waitForURL(
      (url) => {
        const p = url.pathname.toLowerCase();
        return /^\/select-account(\/|$)/.test(p) || /^\/account(\/|$)/.test(p) || /^\/login(\/|$)/.test(p);
      },
      { timeout: accountTimeout }
    );
    await resolveSelectAccountToDashboardIfNeeded(this.page);
    await expect(this.page).toHaveURL(urlIsAccountDashboard, { timeout: accountTimeout });
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    await ensureBizflexCardModalClosed(this.page);
  }
}
