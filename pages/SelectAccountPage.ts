import { expect, type Locator, type Page } from '@playwright/test';
import { accountNamesMatchLoosely, type AccountSelectOptions } from '../config/accountContext';
import { pathnameLooksLikeSelectAccountPath } from '../support/ui/accountRoutes';

const PICKER_HEADING = /choose an account to continue/i;

/**
 * Post-login account picker at `/select-account`.
 * Rows are Chakra `role="button"` tiles labelled with Freelancer / Business.
 */
export class SelectAccountPage {
  constructor(private readonly page: Page) {}

  pickerHeading(): Locator {
    return this.page.getByText(PICKER_HEADING);
  }

  /** Picker shell: URL and/or heading (do not rely on URL alone). */
  async assertPickerShellVisible(): Promise<void> {
    await expect
      .poll(
        async () => {
          if (this.isOnSelectAccountPath()) return true;
          return this.pickerHeading().isVisible().catch(() => false);
        },
        { timeout: 45_000, message: 'Account picker shell did not appear' }
      )
      .toBe(true);
    await expect(this.pickerHeading()).toBeVisible({ timeout: 20_000 });
  }

  async assertOnSelectAccountScreen(): Promise<void> {
    await this.assertPickerShellVisible();
  }

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

  cardByContextTestId(contextId: string): Locator {
    return this.page
      .locator(
        `[data-testid="select-account-context-${contextId}"], [data-testid="account-context-${contextId}"]`
      )
      .first();
  }

  cardByNameSubstring(name: string): Locator {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.page.getByRole('button', { name: new RegExp(escaped, 'i') }).first();
  }

  /** Match card by loose name (ignores spacing differences vs API). */
  async cardByLooseName(name: string): Promise<Locator | null> {
    const count = await this.accountCards().count();
    for (let i = 0; i < count; i++) {
      const card = this.accountCards().nth(i);
      const text = (await card.innerText().catch(() => '')) ?? '';
      if (accountNamesMatchLoosely(name, text)) return card;
    }
    return null;
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

  async assertConfiguredAccountVisible(options: AccountSelectOptions): Promise<void> {
    if (options.accountContextId) {
      const byCtx = this.cardByContextTestId(options.accountContextId);
      if (await byCtx.isVisible({ timeout: 12_000 }).catch(() => false)) {
        await expect(byCtx).toBeVisible();
        return;
      }
    }
    if (options.accountId) {
      const byId = this.cardByTestId(options.accountId);
      if (await byId.isVisible({ timeout: 12_000 }).catch(() => false)) {
        await expect(byId).toBeVisible();
        return;
      }
    }
    if (options.accountName) {
      const loose = await this.cardByLooseName(options.accountName);
      if (loose) {
        await expect(loose).toBeVisible();
        return;
      }
      await expect(this.cardByNameSubstring(options.accountName)).toBeVisible({ timeout: 15_000 });
      return;
    }
    if (options.accountType === 'freelance') {
      const cards = this.freelanceCards();
      const count = await cards.count();
      if (count === 0) throw new Error('[select-account] No Freelancer account card visible.');
      if (count > 1) {
        throw new Error(
          `[select-account] ${count} Freelancer cards — set E2E_FREELANCE_ACCOUNT_NAME or E2E_FREELANCE_ACCOUNT_ID (do not assume order).`
        );
      }
      await expect(cards.first()).toBeVisible();
      return;
    }
    if (options.accountType === 'business') {
      const cards = this.businessCards();
      const count = await cards.count();
      if (count === 0) throw new Error('[select-account] No Business account card visible.');
      if (count > 1) {
        throw new Error(
          `[select-account] ${count} Business cards — set E2E_BUSINESS_ACCOUNT_NAME or E2E_BUSINESS_ACCOUNT_ID (do not assume order).`
        );
      }
      await expect(cards.first()).toBeVisible();
    }
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
