/**
 * Authenticated dashboard shell — uses shared storage + interruption helpers.
 */
import { test, expect } from '@playwright/test';
import { prepareAuthenticatedPage } from '../../support/ui/prepareAuthenticatedPage';
import { isDashboardShellVisible } from '../../support/ui/dashboardReadiness';

test.describe('@smoke @ui Dashboard', () => {
  test('account dashboard loads (flexible shell checks)', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await prepareAuthenticatedPage(page, testInfo);

    await expect(page).toHaveURL(/\/account/i);

    expect(await isDashboardShellVisible(page)).toBeTruthy();

    const hasSearch = (await page.getByPlaceholder(/search/i).count()) > 0;
    const hasNavText =
      (await page.getByText(/Quick Action|Transfer|Pay Bills|International Transfer|Withdraw Cash/i).count()) >
      0;
    const hasBalance = (await page.locator('[data-testid="account-balance"]').count()) > 0;
    expect(hasSearch || hasNavText || hasBalance).toBeTruthy();

    const cardModalHeadline = page.getByText(/Your New BizFlex Card Awaits/i);
    await expect(cardModalHeadline).not.toBeVisible();

    await expect(page.locator('.css-pyq07j')).toHaveCount(0);
  });
});
