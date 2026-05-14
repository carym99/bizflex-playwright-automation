import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { getUiEmail, getValidPassword } from '../../fixtures/auth.fixture';
import { urlIsAccountDashboard } from '../../support/ui/accountRoutes';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('@smoke User login lands on dashboard', () => {
  test('logs in from /login and lands on /account dashboard shell', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.uiLogin(getUiEmail(), getValidPassword());

    await expect(page).toHaveURL(urlIsAccountDashboard, { timeout: 45_000 });
    await expect(page.getByText(/quick action|dashboard|account/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});

