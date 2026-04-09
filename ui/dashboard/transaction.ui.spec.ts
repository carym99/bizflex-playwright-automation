import { test, expect } from '@playwright/test';
import { TransactionPage } from '../../pages/TransactionPage';
import { transactionSelectors as s } from '../../utils/selectors';

test.describe('@ui @wallet @transfer Transaction history & balance', () => {
  test('transaction history page loads; table or empty state', async ({ page }) => {
    const tx = new TransactionPage(page);
    await tx.visitHistory();
    await expect(page.locator(s.table).first()).toBeVisible({ timeout: 30_000 });
    await tx.assertFirstRowOrEmptyState();
  });

  test('balance widget visible on account', async ({ page }) => {
    const tx = new TransactionPage(page);
    await tx.assertBalanceWidgetVisible();
  });
});

