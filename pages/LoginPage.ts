import { type Page, type Locator, expect } from '@playwright/test';
import { loginSelectors as s } from '../utils/selectors';
import { ensureBizflexCardModalClosed } from '../utils/modal';

/**
 * Minimal UI login + verification — mirrors stable Cypress authSelectors.
 * Default suite uses API-injected storage; use uiLogin() for ~20% UI verification flows.
 */
export class LoginPage {
  constructor(private readonly page: Page) {}

  private firstMatching(selectors: string): Locator {
    const parts = selectors.split(',').map((x) => x.trim());
    return this.page.locator(parts.join(', ')).first();
  }

  /** ~20% UI check: authenticated session can load account shell. */
  async verifyLoggedIn(): Promise<void> {
    await this.page.goto('/account', { waitUntil: 'domcontentloaded' });
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
    await this.firstMatching(s.email).fill(email);
    await this.firstMatching(s.password).fill(password);
    await this.page.getByRole('button', { name: /login|sign in/i }).first().click();
    await expect(this.page).toHaveURL(/\/account/i, { timeout: 45_000 });
    await ensureBizflexCardModalClosed(this.page);
  }
}
