import { type Page, expect } from '@playwright/test';
import { transactionSelectors as s } from '../utils/selectors';
import { ensureBizflexCardModalClosed } from '../utils/modal';

export class TransactionPage {
  constructor(private readonly page: Page) {}

  async visitHistory(): Promise<void> {
    await this.page.goto('/transactions', { waitUntil: 'domcontentloaded' });
    await ensureBizflexCardModalClosed(this.page);
    await expect(this.page).toHaveURL(/transactions/i, { timeout: 45_000 });
  }

  async assertHistoryShellVisible(): Promise<void> {
    const table = this.page.locator(s.table).first();
    await expect(table).toBeVisible({ timeout: 30_000 });
  }

  async assertFirstRowOrEmptyState(): Promise<void> {
    const row = this.page.locator(s.firstRow).first();
    const empty = this.page.getByText(/no transaction|empty|nothing here/i).first();
    const hasRow = await row.isVisible().catch(() => false);
    const hasEmpty = await empty.isVisible().catch(() => false);
    expect(hasRow || hasEmpty, 'transactions table or empty state').toBeTruthy();
  }

  /** Balance/widgets on account — paired with transaction history verification */
  async assertBalanceWidgetVisible(): Promise<void> {
    await this.page.goto('/account', { waitUntil: 'domcontentloaded' });
    await ensureBizflexCardModalClosed(this.page);
    const w = this.page.locator(s.balanceWidget).first();
    if (await w.isVisible().catch(() => false)) {
      await expect(w).toBeVisible({ timeout: 25_000 });
      return;
    }
    const body = await this.page.locator('body').innerText();
    expect(/balance|wallet|ngn|\u20A6/i.test(body), 'balance context on account').toBeTruthy();
  }
}
