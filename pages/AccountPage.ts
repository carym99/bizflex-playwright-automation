import { expect, type Page } from '@playwright/test';

export class AccountPage {
  constructor(private readonly page: Page) {}

  async assertOnAccountPage(): Promise<void> {
    await expect(this.page).toHaveURL(/\/account/i, { timeout: 45_000 });
    await expect(this.page.locator('body')).toContainText(/quick action|dashboard|account/i, {
      timeout: 20_000,
    });
  }
}

