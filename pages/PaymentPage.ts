import { type Page, type TestInfo, expect } from '@playwright/test';
import { assertStillAuthenticated } from '../support/ui/assertStillAuthenticated';
import { paymentSelectors as pay } from '../utils/selectors';
import { ensureBizflexCardModalClosed } from '../utils/modal';

/** Card payload — matches cypress/fixtures paymentData.validCard */
export type CardDetails = {
  number: string;
  expiry: string;
  cvv: string;
  name: string;
};

/**
 * Payment / checkout surfaces (hosted payment page or in-app payment step).
 * Parity with Cypress paymentPage where present.
 */
export class PaymentPage {
  constructor(private readonly page: Page) {}

  async gotoPaymentPath(path = '/payment', testInfo?: TestInfo): Promise<void> {
    await this.page.goto(path, { waitUntil: 'domcontentloaded' });
    if (testInfo) {
      await assertStillAuthenticated(this.page, testInfo, `PaymentPage.gotoPaymentPath ${path}`);
    }
    await ensureBizflexCardModalClosed(this.page);
  }

  /**
   * Fill typical card form if fields exist (checkout or modal).
   */
  async fillCardIfPresent(card: CardDetails): Promise<void> {
    const number = this.page.locator(pay.cardNumber).first();
    if (await number.isVisible().catch(() => false)) {
      await number.fill(card.number);
    }
    const expiry = this.page.locator('input[placeholder*="MM" i], input[name*="expir" i]').first();
    if (await expiry.isVisible().catch(() => false)) {
      await expiry.fill(card.expiry);
    }
    const cvv = this.page.locator('input[name*="cvv" i], input[placeholder*="CVC" i]').first();
    if (await cvv.isVisible().catch(() => false)) {
      await cvv.fill(card.cvv);
    }
    const name = this.page.locator('input[name*="name" i]').first();
    if (await name.isVisible().catch(() => false)) {
      await name.fill(card.name);
    }
  }

  async submitIfVisible(): Promise<void> {
    const btn = this.page.locator(pay.paySubmit).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
    }
  }

  /** Soft assertion: payment-related copy or amount widget visible */
  async assertPaymentContextVisible(): Promise<void> {
    const amount = this.page.locator(pay.amount).first();
    const hasAmount = await amount.isVisible().catch(() => false);
    const bodyOk = await this.page
      .locator('body')
      .innerText()
      .then((t) => /pay|amount|checkout|ngn|\u20A6/i.test(t))
      .catch(() => false);
    expect(hasAmount || bodyOk, 'payment or checkout context').toBeTruthy();
  }
}
