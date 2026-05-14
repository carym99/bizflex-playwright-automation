import { expect, type Page } from '@playwright/test';
import { urlIsAccountDashboard } from '../support/ui/accountRoutes';

export class AccountPage {
  constructor(private readonly page: Page) {}

  async assertOnAccountPage(): Promise<void> {
    await expect(this.page).toHaveURL(urlIsAccountDashboard, { timeout: 45_000 });
    await expect(this.page.locator('body')).toContainText(/quick action|dashboard|account/i, {
      timeout: 20_000,
    });
  }
}

