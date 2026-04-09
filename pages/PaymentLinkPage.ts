import { type Page, type TestInfo, type Locator, expect } from '@playwright/test';
import { assertStillAuthenticated } from '../support/ui/assertStillAuthenticated';
import { paymentLinkSelectors as s } from '../utils/selectors';
import { ensureBizflexCardModalClosed } from '../utils/modal';

export type PaymentLinkForm = {
  name: string;
  amount: string | number;
  email: string;
  description: string;
};

/** Live Netlify BizFlex “Generate Link” modal fields (placeholders match production). */
export type FillGenerateLinkFormParams = {
  name: string;
  amount: string;
  description: string;
  email?: string;
  phone?: string;
};

const SUCCESS_GENERATED = /Payment Link Generated Successfully/i;

export class PaymentLinkPage {
  constructor(private readonly page: Page) {}

  // —— Live DOM locators (Netlify) ——
  generateLinkTitle(): Locator {
    return this.page.getByText('Generate Link');
  }

  paymentNameInput(): Locator {
    return this.page.locator('input[placeholder="Enter Name"]');
  }

  amountInput(): Locator {
    return this.page.locator('input[placeholder="Enter amount"]');
  }

  emailInput(): Locator {
    return this.page.locator('input[placeholder="Enter Email"]');
  }

  phoneInput(): Locator {
    return this.page.locator('input[placeholder="Enter Phone Number"]');
  }

  descriptionInput(): Locator {
    return this.page.locator('textarea[placeholder="Enter payment description"]');
  }

  publishButton(): Locator {
    return this.page.getByRole('button', { name: /Publish Link/i });
  }

  saveDraftButton(): Locator {
    return this.page.getByRole('button', { name: /Save to Draft/i });
  }

  gotItButton(): Locator {
    return this.page.getByRole('button', { name: /Got it/i });
  }

  successModalText(): Locator {
    return this.page.getByText(SUCCESS_GENERATED);
  }

  successToastHost(): Locator {
    return this.page.locator('#chakra-toast-manager-top');
  }

  async navigate(testInfo: TestInfo): Promise<void> {
    await this.page.goto('/payment-link', { waitUntil: 'domcontentloaded' });
    await assertStillAuthenticated(this.page, testInfo, 'PaymentLinkPage.navigate after goto /payment-link');
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
    await expect(body).toContainText(/payment link|create unique|total links|generate link/i, { timeout: 20_000 });
  }

  async assertGeneralSectionVisible(): Promise<void> {
    const card = this.page.locator(s.generalCard).first();
    await card.scrollIntoViewIfNeeded().catch(() => null);
    await expect(card).toBeVisible({ timeout: 20_000 });
  }

  async openGenerateLinkModal(): Promise<void> {
    await this.generateLinkTitle().first().click();
    await expect(this.paymentNameInput()).toBeVisible({ timeout: 15_000 });
  }

  /** Mandatory for enabling Publish / Save to Draft: name, amount (≥1000), description. Email/phone optional unless product requires them. */
  async fillGenerateLinkForm(params: FillGenerateLinkFormParams): Promise<void> {
    await this.paymentNameInput().fill(params.name);
    await this.amountInput().fill(params.amount);
    await this.descriptionInput().fill(params.description);
    if (params.email) {
      await this.emailInput().fill(params.email);
    }
    if (params.phone) {
      await this.phoneInput().fill(params.phone);
    }
  }

  async verifyPublishButtonDisabled(): Promise<void> {
    await expect(this.publishButton()).toBeDisabled();
  }

  async verifySaveDraftButtonDisabled(): Promise<void> {
    await expect(this.saveDraftButton()).toBeDisabled();
  }

  async publishPaymentLink(): Promise<void> {
    await this.publishButton().click();
  }

  /** Success copy in modal and/or Chakra toast host. */
  async expectPaymentLinkGeneratedSuccessfully(): Promise<void> {
    const modal = this.successModalText();
    const toast = this.successToastHost().filter({ hasText: SUCCESS_GENERATED });
    await expect(modal.or(toast).first()).toBeVisible({ timeout: 30_000 });
  }

  async closeSuccessModal(): Promise<void> {
    await expect(this.gotItButton()).toBeVisible({ timeout: 30_000 });
    await this.gotItButton().click({ force: true });
  }

  async clickViewPaymentLinks(): Promise<void> {
    const view = this.page
      .getByRole('button', { name: /View Payment Links/i })
      .or(this.page.getByRole('link', { name: /View Payment Links/i }));
    await expect(view.first()).toBeVisible({ timeout: 15_000 });
    await Promise.all([
      this.page.waitForURL(
        (url) => {
          const path = url.pathname.replace(/\/$/, '') || '/';
          return path !== '/payment-link';
        },
        { timeout: 30_000 }
      ),
      view.first().click(),
    ]);
  }

  // —— Legacy API (other specs) —— mapped to live flow ——

  /** @deprecated use {@link openGenerateLinkModal} */
  async openUniqueLinkModal(): Promise<void> {
    await this.openGenerateLinkModal();
  }

  async fillUniqueLinkModal(params: { name: string; amount: string; email: string; description: string }): Promise<void> {
    await this.fillGenerateLinkForm({
      name: params.name,
      amount: params.amount,
      description: params.description,
      email: params.email,
    });
  }

  async submitUniqueLinkModal(): Promise<void> {
    await this.publishPaymentLink();
  }

  async expectCreateSuccessFeedback(): Promise<void> {
    await this.expectPaymentLinkGeneratedSuccessfully();
  }

  async createPaymentLink(name: string, amount: string, description: string, email?: string): Promise<void> {
    const resolvedEmail =
      email ?? process.env.TEST_EMAIL ?? process.env.VALID_USER_EMAIL ?? 'qa.playwright.paymentlink@yopmail.com';
    await this.openGenerateLinkModal();
    await this.fillGenerateLinkForm({ name, amount, description, email: resolvedEmail });
    await this.publishPaymentLink();
    await this.expectPaymentLinkGeneratedSuccessfully();
  }

  async createUniquePaymentLink(data: PaymentLinkForm): Promise<void> {
    await this.openGenerateLinkModal();
    await this.fillGenerateLinkForm({
      name: data.name,
      amount: String(data.amount),
      description: data.description,
      email: data.email,
    });
    await this.publishPaymentLink();
    await this.expectPaymentLinkGeneratedSuccessfully();
  }

  async verifyPaymentLinkVisible(name: string): Promise<void> {
    await this.verifyPaymentLinkVisibleInList(name);
  }

  async verifyPaymentLinkVisibleInList(name: string): Promise<void> {
    const inList = this.page.locator(s.linkListRegion).first().getByText(name, { exact: false });
    const inMain = this.page.locator('main').getByText(name, { exact: false });
    const fallback = this.page.getByText(name, { exact: false });
    await expect(
      inList.or(inMain).or(fallback).first(),
      `Expected payment link titled "${name}" in list/table`
    ).toBeVisible({ timeout: 30_000 });
  }
}
