import { type Page, expect } from '@playwright/test';
import { paymentLinkSelectors as s } from '../utils/selectors';
import { ensureBizflexCardModalClosed } from '../utils/modal';

export type PaymentLinkForm = {
  name: string;
  amount: string | number;
  email: string;
  description: string;
};

export class PaymentLinkPage {
  constructor(private readonly page: Page) {}

  async navigate(): Promise<void> {
    await this.page.goto('/payment-link', { waitUntil: 'domcontentloaded' });
    await ensureBizflexCardModalClosed(this.page);
    await expect(this.page).toHaveURL(/payment-link/i, { timeout: 45_000 });
  }

  async assertDashboardVisible(): Promise<void> {
    const dash = this.page.locator(s.dashboard).first();
    const body = this.page.locator('body');
    const dashVisible = await dash.isVisible().catch(() => false);
    if (dashVisible) {
      await expect(dash).toBeVisible();
    }
    await expect(body).toContainText(/payment link|create unique|total links/i, { timeout: 20_000 });
  }

  async assertGeneralSectionVisible(): Promise<void> {
    const card = this.page.locator(s.generalCard).first();
    await card.scrollIntoViewIfNeeded().catch(() => null);
    await expect(card).toBeVisible({ timeout: 20_000 });
  }

  async createUniquePaymentLink(data: PaymentLinkForm): Promise<void> {
    const createBtn = this.page.locator(s.createUnique).first();
    await createBtn.scrollIntoViewIfNeeded();
    await createBtn.click({ force: true });

    const modal = this.page.locator(s.modal).first();
    await expect(modal).toBeVisible({ timeout: 15_000 });

    await this.page.locator(s.paymentName).first().fill(data.name);
    await this.page.locator(s.amount).first().fill(String(data.amount));
    await this.page.locator(s.email).first().fill(data.email);
    await this.page.locator(s.description).first().fill(data.description);

    await this.page.locator(s.publish).first().click({ force: true });

    const success = this.page.locator(s.successModal).first();
    await expect(success).toBeVisible({ timeout: 60_000 });
    await expect(this.page.locator(s.generatedLink).first()).toBeVisible();
  }

  async closeSuccessModal(): Promise<void> {
    await this.page.getByRole('button', { name: /got it|done|close/i }).first().click({ force: true });
  }
}
