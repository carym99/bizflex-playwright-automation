/**
 * Visual baselines are **opt-in** so CI does not fail on first run without committed PNGs.
 *
 * Local: `VISUAL_REGRESSION=1 npx playwright test tests/regression/visual.critical.spec.ts --update-snapshots`
 * Then commit snapshots under `tests/regression/visual.critical.spec.ts-snapshots/`.
 *
 * Checkout modal: add a third test here once a stable modal selector exists (avoid flaky overlays).
 */
import { test, expect } from '@playwright/test';
import { prepareAuthenticatedPage } from '../../support/ui/prepareAuthenticatedPage';
import { PaymentLinkPage } from '../../pages/PaymentLinkPage';

const visualEnabled = () => process.env.VISUAL_REGRESSION === '1';

test.describe('@regression Visual — critical authenticated screens (opt-in)', () => {
  test.beforeEach(() => {
    test.skip(!visualEnabled(), 'Set VISUAL_REGRESSION=1 to run screenshot assertions');
  });

  test('dashboard shell', async ({ page }, testInfo) => {
    await test.step('Land on account with seeded session', async () => {
      await prepareAuthenticatedPage(page, testInfo);
    });
    await test.step('Snapshot dashboard', async () => {
      await expect(page).toHaveScreenshot('dashboard.png', {
        fullPage: true,
        maxDiffPixels: 500,
      });
    });
  });

  test('payment link workspace', async ({ page }, testInfo) => {
    await test.step('Authenticated payment-link page', async () => {
      await prepareAuthenticatedPage(page, testInfo);
      const pl = new PaymentLinkPage(page);
      await pl.navigate(testInfo);
    });
    await expect(page).toHaveScreenshot('payment-link-workspace.png', { fullPage: true, maxDiffPixels: 500 });
  });
});
