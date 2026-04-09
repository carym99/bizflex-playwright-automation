import { test, expect } from '@playwright/test';
import paymentData from '../../fixtures/paymentData.json';
import { LoginPage } from '../../pages/LoginPage';
import { PaymentLinkPage } from '../../pages/PaymentLinkPage';
import { prepareAuthenticatedPage } from '../../support/ui/prepareAuthenticatedPage';
import { assertStillAuthenticated } from '../../support/ui/assertStillAuthenticated';

test.describe('@ui @payment-link Payment Link', () => {
  test('localStorage carries auth tokens after navigation', async ({ page }, testInfo) => {
    await prepareAuthenticatedPage(page, testInfo);
    const token = await page.evaluate(() => window.localStorage.getItem('token'));
    expect(token, 'token in localStorage').toBeTruthy();
    expect(token!.length).toBeGreaterThan(20);
  });

  test('account dashboard loads for authenticated session', async ({ page }, testInfo) => {
    const loginPage = new LoginPage(page);
    await loginPage.verifyLoggedIn(testInfo);
    await assertStillAuthenticated(page, testInfo, 'payment-link: after verifyLoggedIn');
    const body = page.locator('body');
    await expect(body).toContainText(/quick action|account|dashboard|bizflex/i, { timeout: 20_000 });
  });

  test('create unique payment link from authenticated dashboard', async ({ page }, testInfo) => {
    await prepareAuthenticatedPage(page, testInfo);

    const paymentLinkPage = new PaymentLinkPage(page);

    await paymentLinkPage.navigate(testInfo);
    await assertStillAuthenticated(page, testInfo, 'payment-link: after navigate');

    await paymentLinkPage.assertDashboardVisible();
    await assertStillAuthenticated(page, testInfo, 'payment-link: after assertDashboardVisible');

    await paymentLinkPage.assertGeneralSectionVisible();

    const amount = paymentData.paymentLink?.amount ?? paymentData.amount;
    await paymentLinkPage.createUniquePaymentLink({
      name: `${paymentData.name} ${Date.now()}`,
      amount,
      email: 'qa.playwright.paymentlink@yopmail.com',
      description: paymentData.paymentLink?.description ?? paymentData.description,
    });
    await paymentLinkPage.closeSuccessModal();
    await expect(page).toHaveURL(/payment-link/i);
    await assertStillAuthenticated(page, testInfo, 'payment-link: after create link URL');
  });
});
