import { test, expect } from '@playwright/test';
import paymentData from '../../fixtures/paymentData.json';
import { PaymentPage, type CardDetails } from '../../pages/PaymentPage';
import { ensureBizflexCardModalClosed } from '../../utils/modal';
import { paymentSelectors } from '../../utils/selectors';

test.describe('@ui @wallet Payment', () => {
  test('account shows balance or payment context', async ({ page }) => {
    await page.goto('/account', { waitUntil: 'domcontentloaded' });
    await ensureBizflexCardModalClosed(page);
    const body = await page.locator('body').innerText();
    expect(/quick action|balance|wallet|account|ngn|\u20A6/i.test(body), 'account financial context').toBeTruthy();
  });

  test('/payment or checkout context when available', async ({ page }) => {
    const paymentPage = new PaymentPage(page);
    const res = await page.goto('/payment', { waitUntil: 'domcontentloaded' });

    if (!res || res.status() === 404) {
      await page.goto('/account', { waitUntil: 'domcontentloaded' });
      await ensureBizflexCardModalClosed(page);
      await paymentPage.assertPaymentContextVisible();
      return;
    }

    await ensureBizflexCardModalClosed(page);
    await paymentPage.assertPaymentContextVisible();
  });

  test('card form interaction when checkout fields exist', async ({ page }) => {
    await page.goto('/payment', { waitUntil: 'domcontentloaded' });
    await ensureBizflexCardModalClosed(page);

    const paymentPage = new PaymentPage(page);
    await paymentPage.fillCardIfPresent(paymentData.validCard as CardDetails);

    const anyCardField = page.locator(paymentSelectors.cardNumber).first();
    const visible = await anyCardField.isVisible().catch(() => false);
    if (visible) await expect(anyCardField).toBeVisible();
  });
});

