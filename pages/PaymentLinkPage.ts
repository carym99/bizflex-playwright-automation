import { type Page, type TestInfo, type Locator, expect } from '@playwright/test';
import { assertStillAuthenticated } from '../support/ui/assertStillAuthenticated';
import { pathnameLooksLikeLogin } from '../support/ui/authSessionRecovery';
import { logAuthDiagnostics } from '../support/auth/debugAuthState';
import { clickWithScrollThenForceFallback } from '../support/ui/clickPreferringActionability';
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

  private createUniqueLinkButton(): Locator {
    return this.page.getByRole('button', { name: /Create Unique Link/i });
  }

  private generateLinkDrawerTitle(): Locator {
    return this.page
      .getByRole('heading', { name: /Generate Link/i })
      .or(this.page.getByText(/Generate Link/i));
  }

  drawerRoot(): Locator {
    return this.generateLinkDrawerTitle().first().locator('..');
  }

  // —— Live DOM locators (Netlify) ——
  generateLinkTitle(): Locator {
    return this.generateLinkDrawerTitle();
  }

  paymentNameInput(): Locator {
    return this.page
      .locator('input[placeholder="Enter Name"]')
      .or(this.page.getByPlaceholder(/Enter Name|Payment Name|Link Name/i))
      .or(this.page.getByLabel(/Payment Name|Name|Title/i))
      .or(this.page.locator('input[name*="name" i]'));
  }

  amountInput(): Locator {
    return this.page
      .locator('input[placeholder="Enter amount"]')
      .or(this.page.getByPlaceholder(/Enter amount|Amount/i))
      .or(this.page.getByLabel(/Amount/i))
      .or(this.page.locator('input[name*="amount" i]'));
  }

  emailInput(): Locator {
    return this.page
      .locator('input[placeholder="Enter Email"]')
      .or(this.page.getByPlaceholder(/Enter Email|Email/i))
      .or(this.page.getByLabel(/Email/i))
      .or(this.page.locator('input[type="email"]'));
  }

  phoneInput(): Locator {
    return this.page.locator('input[placeholder="Enter Phone Number"]');
  }

  descriptionInput(): Locator {
    return this.page
      .locator('textarea[placeholder="Enter payment description"]')
      .or(this.page.getByPlaceholder(/Enter payment description|Description/i))
      .or(this.page.getByLabel(/Description/i))
      .or(this.page.locator('textarea[name*="description" i], textarea'));
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

  private async dismissBlockingCardModalIfPresent(): Promise<void> {
    const maybeLater = this.page.getByRole('button', { name: /Maybe Later/i }).first();
    if (await maybeLater.isVisible().catch(() => false)) {
      await clickWithScrollThenForceFallback(maybeLater);
    }

    const closeModal = this.page.getByRole('button', { name: /Close modal|Close/i }).first();
    if (await closeModal.isVisible().catch(() => false)) {
      await clickWithScrollThenForceFallback(closeModal);
    }
  }

  /** Chakra portals (promos, confirmations) can sit above the page and intercept clicks. */
  private async dismissChakraBlockingModalsIfPresent(): Promise<void> {
    const modalContent = this.page.locator('.chakra-modal__content-container').first();
    for (let attempt = 0; attempt < 4; attempt++) {
      const visible = await modalContent.isVisible().catch(() => false);
      if (!visible) return;

      await this.page.keyboard.press('Escape').catch(() => {});
      try {
        await expect(modalContent).toBeHidden({ timeout: 2_500 });
        return;
      } catch {
        const inDialog = this.page
          .locator('[role="dialog"]')
          .getByRole('button', { name: /Close|Got it|Maybe later|Dismiss/i })
          .first();
        if (await inDialog.isVisible().catch(() => false)) {
          await clickWithScrollThenForceFallback(inDialog);
        }
      }
    }
  }

  async navigate(testInfo: TestInfo): Promise<void> {
    const logNav = (label: string) => {
      const url = this.page.url();
      console.log(`[PaymentLinkPage.navigate] ${label}: ${url}`);
    };

    for (let attempt = 0; attempt < 2; attempt++) {
      await this.page.goto('/payment-link', { waitUntil: 'domcontentloaded' });
      logNav(`after goto /payment-link (attempt ${attempt})`);

      if (pathnameLooksLikeLogin(this.page)) {
        if (process.env.CI) {
          await logAuthDiagnostics(this.page, `PaymentLinkPage.navigate login redirect attempt ${attempt}`);
        }
        await testInfo
          .attach(`payment-link-nav-unexpected-login-${attempt}.png`, {
            body: await this.page.screenshot({ fullPage: true }),
            contentType: 'image/png',
          })
          .catch(() => {});

        if (attempt === 1) {
          throw new Error(
            'PaymentLinkPage.navigate: redirected to /login after /payment-link; storage state invalid or session lost (retry exhausted)'
          );
        }

        console.warn('[PaymentLinkPage.navigate] /login after /payment-link — stabilizing via /account then retry');
        await this.page.goto('/account', { waitUntil: 'domcontentloaded' });
        await assertStillAuthenticated(this.page, testInfo, 'PaymentLinkPage.navigate recovery /account');
        continue;
      }

      break;
    }

    await assertStillAuthenticated(this.page, testInfo, 'PaymentLinkPage.navigate after goto /payment-link');
    await ensureBizflexCardModalClosed(this.page);
    await this.dismissBlockingCardModalIfPresent();
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
    const fallback = this
      .generateLinkTitle()
      .or(this.page.getByRole('button', { name: /Generate Link|Create Unique|Publish Link/i }));
    if (await card.isVisible().catch(() => false)) {
      await card.scrollIntoViewIfNeeded().catch(() => null);
      await expect(card).toBeVisible({ timeout: 20_000 });
      return;
    }
    await expect(fallback.first()).toBeVisible({ timeout: 20_000 });
  }

  async openGenerateLinkModal(testInfo?: TestInfo): Promise<void> {
    await this.dismissBlockingCardModalIfPresent();
    await this.dismissChakraBlockingModalsIfPresent();
    await ensureBizflexCardModalClosed(this.page);
    const createUniqueLinkButton = this.createUniqueLinkButton().first();
    await expect(createUniqueLinkButton).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(async () => createUniqueLinkButton.isEnabled(), { timeout: 20_000 })
      .toBe(true);
    await createUniqueLinkButton.click();

    if (testInfo) {
      await assertStillAuthenticated(
        this.page,
        testInfo,
        'openGenerateLinkModal after Create Unique Link click'
      );
    }

    // Prefer stable form controls over copy-only text (avoids flaky `text=` and duplicate waits).
    await expect(this.paymentNameInput().first()).toBeVisible({ timeout: 20_000 });
    await expect(this.amountInput().first()).toBeVisible({ timeout: 20_000 });
  }

  /** Mandatory for enabling Publish / Save to Draft: name, amount (≥1000), description. Email/phone optional unless product requires them. */
  async fillGenerateLinkForm(params: FillGenerateLinkFormParams): Promise<void> {
    await expect(this.paymentNameInput().first()).toBeVisible({ timeout: 15_000 });
    await this.paymentNameInput().first().fill(params.name);
    await this.amountInput().first().fill(params.amount);
    await this.descriptionInput().first().fill(params.description);
    if (params.email) {
      await this.emailInput().first().fill(params.email);
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
    const publish = this.publishButton().first();
    await expect(publish).toBeVisible({ timeout: 15_000 });
    await clickWithScrollThenForceFallback(publish);
  }

  /** Success copy in modal and/or Chakra toast host. */
  async expectPaymentLinkGeneratedSuccessfully(): Promise<void> {
    const modal = this.successModalText();
    const toast = this.successToastHost().filter({ hasText: SUCCESS_GENERATED });
    await expect(modal.or(toast).first()).toBeVisible({ timeout: 30_000 });
  }

  async closeSuccessModal(): Promise<void> {
    const gotIt = this.gotItButton();
    await expect(gotIt).toBeVisible({ timeout: 30_000 });
    await clickWithScrollThenForceFallback(gotIt);
  }

  async clickViewPaymentLinks(): Promise<void> {
    const view = this.page
      .getByRole('button', { name: /View Payment Links/i })
      .or(this.page.getByRole('link', { name: /View Payment Links/i }))
      .or(this.page.getByText(/View Payment Links/i));
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
