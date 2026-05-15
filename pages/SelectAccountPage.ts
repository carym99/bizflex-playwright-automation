import { expect, type Locator, type Page } from '@playwright/test';
import { pathnameLooksLikeSelectAccountPath } from '../support/ui/accountRoutes';

/**
 * Post-login account picker at `/select-account`.
 * Rows are Chakra `role="button"` tiles labelled with Freelancer / Business — not unstable css-* classes.
 */
export class SelectAccountPage {
  constructor(private readonly page: Page) {}

  async assertOnSelectAccountScreen(): Promise<void> {
    await expect(this.page).toHaveURL(/\/select-account/i, { timeout: 45_000 });
    await expect(this.page.getByText(/choose an account to continue/i)).toBeVisible({ timeout: 20_000 });
  }

  /** Account option tiles (excludes Continue and Add New Account). */
  accountCards(): Locator {
    return this.page
      .getByRole('button')
      .filter({ hasText: /Freelancer|Business/i })
      .filter({ hasNotText: /^Add New Account$/i })
      .filter({ hasNotText: /^Continue$/i });
  }

  continueButton(): Locator {
    return this.page.getByRole('button', { name: /^Continue$/i }).first();
  }

  addNewAccountButton(): Locator {
    return this.page.getByRole('button', { name: /add new account/i }).first();
  }

  cardByTestId(accountId: string): Locator {
    return this.page
      .locator(
        `[data-testid="select-account-option-${accountId}"], [data-testid="account-option-${accountId}"], [data-testid="select-account-row-${accountId}"]`
      )
      .first();
  }

  cardByNameSubstring(name: string): Locator {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.page.getByRole('button', { name: new RegExp(escaped, 'i') }).first();
  }

  lastUsedCard(): Locator {
    return this.page.getByRole('button').filter({ hasText: /last used/i }).first();
  }

  freelanceCards(): Locator {
    return this.accountCards().filter({ hasText: /freelancer/i });
  }

  businessCards(): Locator {
    return this.accountCards().filter({ hasText: /business/i });
  }

  async countVisibleAccountCards(): Promise<number> {
    return this.accountCards().count();
  }

  async clickContinue(): Promise<void> {
    const btn = this.continueButton();
    await expect(btn).toBeVisible({ timeout: 15_000 });
    await expect(btn).toBeEnabled({ timeout: 15_000 });
    await btn.click();
  }

  async waitForLeftSelectAccount(): Promise<void> {
    await this.page.waitForFunction(
      () => !/^\/select-account(\/|$)/i.test(new URL(window.location.href).pathname),
      null,
      { timeout: 45_000 }
    );
  }

  isOnSelectAccountPath(): boolean {
    try {
      return pathnameLooksLikeSelectAccountPath(new URL(this.page.url()).pathname);
    } catch {
      return false;
    }
  }
}
