import { test, expect } from '@playwright/test';
import * as path from 'path';
import paymentData from '../../fixtures/paymentData.json';
import { LoginPage } from '../../pages/LoginPage';
import { PaymentLinkPage } from '../../pages/PaymentLinkPage';

test.use({ storageState: path.join(__dirname, '..', '..', 'storage', 'auth.json') });

test.describe('@ui @payment-link Payment Link', () => {
  test('localStorage carries auth tokens after navigation', async ({ page }) => {
    await page.goto('/account', { waitUntil: 'domcontentloaded' });
    const token = await page.evaluate(() => window.localStorage.getItem('token'));
    expect(token, 'token in localStorage').toBeTruthy();
    expect(token!.length).toBeGreaterThan(20);
  });

  test('account dashboard loads for authenticated session', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.verifyLoggedIn();
  });

  test('create unique payment link from authenticated dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const paymentLinkPage = new PaymentLinkPage(page);

    await loginPage.verifyLoggedIn();
    await paymentLinkPage.navigate();
    await paymentLinkPage.assertDashboardVisible();
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
  });
});

