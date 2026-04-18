/**
 * Live Netlify payment-link flow: single smoke happy path (create → publish → list).
 * Below-minimum edge case lives in `tests/regression/payment-link.publish-below-minimum.ui.spec.ts`.
 */
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { PaymentLinkPage, type FillGenerateLinkFormParams } from '../../pages/PaymentLinkPage';
import { prepareAuthenticatedPage } from '../../support/ui/prepareAuthenticatedPage';
import { assertStillAuthenticated } from '../../support/ui/assertStillAuthenticated';
import { buildPaymentLinkName } from '../shared/factories/paymentLink.factory';

async function expectLinkNameVisibleWithArtifacts(page: Page, testInfo: TestInfo, linkName: string): Promise<void> {
  try {
    await page.waitForLoadState('domcontentloaded');
    const exact = page.getByText(linkName, { exact: false });
    const fallbackPrefix = linkName.slice(0, Math.min(18, linkName.length));
    const fallback = page.getByText(new RegExp(fallbackPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    await expect(exact.or(fallback).first()).toBeVisible({ timeout: 45_000 });
  } catch (err) {
    await testInfo.attach('payment-link-list-url.txt', {
      body: Buffer.from(page.url(), 'utf8'),
      contentType: 'text/plain',
    });
    try {
      await testInfo.attach('payment-link-list-not-found.png', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    } catch {
      // Page may already be closing due to timeout; keep original assertion failure details.
    }
    throw new Error(
      `Payment link "${linkName}" not visible after View Payment Links: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

test.describe('@smoke Payment link create and verify', () => {
  test('authenticated user can create and verify a payment link', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const linkName = buildPaymentLinkName();
    const description = 'Playwright automated payment link';

    await test.step('Prepare authenticated session', async () => {
      await prepareAuthenticatedPage(page, testInfo);
    });

    const paymentLinkPage = new PaymentLinkPage(page);

    await test.step('Open payment link workspace', async () => {
      await paymentLinkPage.navigate(testInfo);
      await assertStillAuthenticated(page, testInfo, 'after navigating to payment link page');
    });

    await test.step('Create and publish link', async () => {
      await paymentLinkPage.openGenerateLinkModal(testInfo);
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
    });

    await test.step('Close success and verify list', async () => {
      await paymentLinkPage.closeSuccessModal();
      await assertStillAuthenticated(page, testInfo, 'after closing success modal');
      await expect(page).toHaveURL(/payment-link/i);
      await paymentLinkPage.clickViewPaymentLinks();
      await assertStillAuthenticated(page, testInfo, 'after View Payment Links navigation');
      await expect(page).not.toHaveURL(/\/payment-link\/?$/i);
      await expectLinkNameVisibleWithArtifacts(page, testInfo, linkName);
      await assertStillAuthenticated(page, testInfo, 'after list verification');
    });
  });
});
