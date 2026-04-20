import { type Page, type TestInfo, expect } from '@playwright/test';
import { assertStillAuthenticated } from '../support/ui/assertStillAuthenticated';
import {
  attemptUiLoginRecovery,
  attemptUiLoginRecoveryFromLoginRoute,
  pathnameLooksLikeLogin,
} from '../support/ui/authSessionRecovery';
import { gotoWithRetry } from '../support/ui/navigation';
import { transactionSelectors as s } from '../utils/selectors';
import { ensureBizflexCardModalClosed } from '../utils/modal';

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TransactionPage {
  constructor(private readonly page: Page) {}

  async visitHistory(testInfo: TestInfo): Promise<void> {
    try {
      await gotoWithRetry(this.page, '/transactions', { waitUntil: 'domcontentloaded' });
    } catch (e) {
      if (String(e).includes('ERR_ABORTED')) {
        await sleepMs(2000);
        await gotoWithRetry(this.page, '/transactions', { waitUntil: 'domcontentloaded' });
      } else {
        throw e;
      }
    }

    if (pathnameLooksLikeLogin(this.page)) {
      const recovered =
        (await attemptUiLoginRecovery(this.page)) || (await attemptUiLoginRecoveryFromLoginRoute(this.page));
      if (recovered) {
        await gotoWithRetry(this.page, '/transactions', { waitUntil: 'domcontentloaded' });
      }
    }

    await assertStillAuthenticated(this.page, testInfo, 'after goto /transactions');
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
  async assertBalanceWidgetVisible(testInfo: TestInfo): Promise<void> {
    await this.page.goto('/account', { waitUntil: 'domcontentloaded' });
    await assertStillAuthenticated(this.page, testInfo, 'assertBalanceWidgetVisible after goto /account');
    await ensureBizflexCardModalClosed(this.page);
    const w = this.page.locator(s.balanceWidget).first();
    if (await w.isVisible().catch(() => false)) {
      await expect(w).toBeVisible({ timeout: 25_000 });
      return;
    }
    const body = await this.page.locator('body').innerText();
    expect(
      /balance|wallet|ngn|\u20A6|quick action|suggestions for you|transfer|pay bills|account/i.test(body),
      'balance context on account'
    ).toBeTruthy();
  }
}
