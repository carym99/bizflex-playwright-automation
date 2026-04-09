import type { Page } from '@playwright/test';

const CARD_HEADLINE = /Your New BizFlex Card Awaits/i;

/**
 * Dismisses the BizFlex "new card" promo modal when present.
 * Clicks the legacy Chakra class used in production; no-ops safely when the modal is absent.
 */
export async function dismissCardModal(page: Page): Promise<void> {
  const body = await page.locator('body').innerText().catch(() => '');
  if (!CARD_HEADLINE.test(body)) return;

  const target = page.locator('.css-pyq07j').first();
  const visible = await target.isVisible().catch(() => false);
  if (!visible) return;

  await target.click({ force: true }).catch(() => {});

  const after = await page.locator('body').innerText().catch(() => '');
  if (CARD_HEADLINE.test(after)) {
    console.warn('[dismissCardModal] Card modal headline still visible after click — continuing');
  }
}
