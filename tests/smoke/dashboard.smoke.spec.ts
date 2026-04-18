/**
 * Authenticated dashboard shell — fresh context + storage from `tests/shared/fixtures/auth.fixture.ts`.
 */
import { test, expect } from '../shared/fixtures/auth.fixture';
import { prepareAuthenticatedPage } from '../../support/ui/prepareAuthenticatedPage';
import { isDashboardShellVisible } from '../../support/ui/dashboardReadiness';

test.describe('@smoke Dashboard shell', () => {
  test('account dashboard loads (flexible shell checks)', async ({ authenticatedPage }, testInfo) => {
    test.setTimeout(90_000);

    await test.step('Load account: dismiss modals, wait for dashboard', async () => {
      await prepareAuthenticatedPage(authenticatedPage, testInfo);
    });

    await test.step('Assert URL and shell', async () => {
      await expect(authenticatedPage).toHaveURL(/\/account/i);
      expect(await isDashboardShellVisible(authenticatedPage)).toBeTruthy();
    });

    await test.step('Flexible shell heuristics (search / nav / balance)', async () => {
      const hasSearch = (await authenticatedPage.getByPlaceholder(/search/i).count()) > 0;
      const hasNavText =
        (await authenticatedPage.getByText(/Quick Action|Transfer|Pay Bills|International Transfer|Withdraw Cash/i).count()) >
        0;
      const hasBalance = (await authenticatedPage.locator('[data-testid="account-balance"]').count()) > 0;
      expect(hasSearch || hasNavText || hasBalance).toBeTruthy();
    });

    await test.step('No blocking card promo', async () => {
      const cardModalHeadline = authenticatedPage.getByText(/Your New BizFlex Card Awaits/i);
      await expect(cardModalHeadline).not.toBeVisible();
      await expect(authenticatedPage.locator('.css-pyq07j')).toHaveCount(0);
    });
  });
});
