import { test, expect } from '@playwright/test';
import { TransactionPage } from '../../pages/TransactionPage';
import { transactionSelectors as s } from '../../utils/selectors';
import { prepareAuthenticatedPage } from '../../support/ui/prepareAuthenticatedPage';
import { assertStillAuthenticated } from '../../support/ui/assertStillAuthenticated';

test.describe('@ui @wallet @transfer Transaction history & balance', () => {
  test('transaction history page loads; table or empty state', async ({ page }, testInfo) => {
    await prepareAuthenticatedPage(page, testInfo);
    const tx = new TransactionPage(page);
    await tx.visitHistory(testInfo);
    await assertStillAuthenticated(page, testInfo, 'transactions: after visitHistory');
    await expect(page.locator(s.table).first()).toBeVisible({ timeout: 30_000 });
    await tx.assertFirstRowOrEmptyState();
  });

  test('balance widget visible on account', async ({ page }, testInfo) => {
    await prepareAuthenticatedPage(page, testInfo);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await assertStillAuthenticated(page, testInfo, 'transactions: after reload /account');

    const tx = new TransactionPage(page);
    await tx.assertBalanceWidgetVisible(testInfo);
    await assertStillAuthenticated(page, testInfo, 'transactions: after assertBalanceWidgetVisible');
  });
});
