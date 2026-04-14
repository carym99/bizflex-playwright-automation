import { type Page, type TestInfo, expect } from '@playwright/test';
import { assertStillAuthenticated } from '../support/ui/assertStillAuthenticated';
import { ensureBizflexCardModalClosed } from '../utils/modal';
import {
  assertLoginFormReady,
  getLoginEmailInput,
  getLoginPasswordInput,
  getLoginSubmitButton,
} from '../support/ui/loginHelpers';

/**
 * Minimal UI login + verification — mirrors stable Cypress authSelectors.
 * Default suite uses API-injected storage; use uiLogin() for ~20% UI verification flows.
 */
export class LoginPage {
  constructor(private readonly page: Page) {}

  /** ~20% UI check: authenticated session can load account shell. */
  async verifyLoggedIn(testInfo: TestInfo): Promise<void> {
    await this.page.goto('/account', { waitUntil: 'domcontentloaded' });
    await assertStillAuthenticated(this.page, testInfo, 'LoginPage.verifyLoggedIn');
    await ensureBizflexCardModalClosed(this.page);
    await expect(this.page).toHaveURL(/\/account/i, { timeout: 45_000 });
    const body = this.page.locator('body');
    await expect(body).toContainText(/quick action|account|dashboard|bizflex/i, { timeout: 20_000 });
  }

  /**
   * Full browser login (no pre-seeded storage) — use in dedicated projects or before generateStorageState validation.
   */
  async uiLogin(email: string, password: string): Promise<void> {
    await this.page.goto('/login', { waitUntil: 'domcontentloaded' });
    await assertLoginFormReady(this.page);
    const emailInput = getLoginEmailInput(this.page);
    const passwordInput = getLoginPasswordInput(this.page);
    const submitButton = getLoginSubmitButton(this.page);
    await emailInput.fill(email);
    await passwordInput.fill(password);
    await expect(submitButton).toBeEnabled();
    await submitButton.click();
    await expect(this.page).toHaveURL(/\/account/i, { timeout: 45_000 });
    await ensureBizflexCardModalClosed(this.page);
  }
}
