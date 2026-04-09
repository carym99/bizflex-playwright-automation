/**
 * Live Netlify payment-link flow: Generate Link modal, publish, success, View Payment Links list.
 */
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { PaymentLinkPage, type FillGenerateLinkFormParams } from '../../pages/PaymentLinkPage';
import { prepareAuthenticatedPage } from '../../support/ui/prepareAuthenticatedPage';
import { assertStillAuthenticated } from '../../support/ui/assertStillAuthenticated';

async function expectLinkNameVisibleWithArtifacts(page: Page, testInfo: TestInfo, linkName: string): Promise<void> {
  try {
    await expect(page.getByText(linkName)).toBeVisible({ timeout: 30_000 });
  } catch (err) {
    await testInfo.attach('payment-link-list-url.txt', {
      body: Buffer.from(page.url(), 'utf8'),
      contentType: 'text/plain',
    });
    await testInfo.attach('payment-link-list-not-found.png', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    throw new Error(
      `Payment link "${linkName}" not visible after View Payment Links: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

test.describe('@ui @payment-link @smoke', () => {
  test('authenticated user can create and verify a payment link', async ({ page }, testInfo) => {
    const linkName = `Automation Link ${Date.now()}`;
    const description = 'Playwright automated payment link';

    await prepareAuthenticatedPage(page, testInfo);

    const paymentLinkPage = new PaymentLinkPage(page);

    await paymentLinkPage.navigate(testInfo);
    await assertStillAuthenticated(page, testInfo, 'after navigating to payment link page');

    await paymentLinkPage.openGenerateLinkModal();

    await paymentLinkPage.verifyPublishButtonDisabled();
    await paymentLinkPage.verifySaveDraftButtonDisabled();

    const fillParams: FillGenerateLinkFormParams = {
      name: linkName,
      amount: '1000',
      description,
    };
    if (process.env.TEST_EMAIL) {
      fillParams.email = process.env.TEST_EMAIL;
    }
    await paymentLinkPage.fillGenerateLinkForm(fillParams);

    await expect(page.getByRole('button', { name: /Publish Link/i })).toBeEnabled();

    await paymentLinkPage.publishPaymentLink();

    await paymentLinkPage.expectPaymentLinkGeneratedSuccessfully();

    await paymentLinkPage.closeSuccessModal();

    await assertStillAuthenticated(page, testInfo, 'after closing success modal');
    await expect(page).toHaveURL(/payment-link/i);

    await paymentLinkPage.clickViewPaymentLinks();

    await assertStillAuthenticated(page, testInfo, 'after View Payment Links navigation');
    await expect(page).not.toHaveURL(/\/payment-link\/?$/i);

    await expectLinkNameVisibleWithArtifacts(page, testInfo, linkName);
    await assertStillAuthenticated(page, testInfo, 'after list verification');
  });

  test('publish button stays disabled when amount is below minimum', async ({ page }, testInfo) => {
    await prepareAuthenticatedPage(page, testInfo);
    const paymentLinkPage = new PaymentLinkPage(page);

    await paymentLinkPage.navigate(testInfo);
    await paymentLinkPage.openGenerateLinkModal();

    await paymentLinkPage.fillGenerateLinkForm({
      name: `Below min ${Date.now()}`,
      amount: '999',
      description: 'Amount below minimum (requires ≥ 1000)',
    });

    await expect(page.getByRole('button', { name: /Publish Link/i })).toBeDisabled();
  });
});
