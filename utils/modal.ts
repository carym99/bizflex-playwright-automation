import type { Page } from '@playwright/test';

/**
 * BizFlex post-login modal — mirrors Cypress ensureBizflexCardModalClosed (text/role first).
 */
export async function ensureBizflexCardModalClosed(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const bodyText = await page.locator('body').innerText().catch(() => '');
    if (!bodyText.includes('Your New BizFlex Card Awaits')) return;

    const maybeLater = page.getByRole('button', { name: /maybe later/i }).first();
    if (await maybeLater.isVisible().catch(() => false)) {
      // The modal can re-render between visibility check and click.
      await maybeLater.click({ force: true }).catch(() => {});
      continue;
    }

    const close = page
      .locator(
        '[role="dialog"] [aria-label="Close"], [role="dialog"] [aria-label*="close" i], .chakra-modal__close-btn'
      )
      .first();
    if (await close.isVisible().catch(() => false)) {
      await close.click({ force: true }).catch(() => {});
      continue;
    }

    // Last resort: legacy hashed class, scoped by button text.
    const legacyMaybeLater = page.locator('.css-pyq07j').filter({ hasText: /maybe later/i }).first();
    if (await legacyMaybeLater.isVisible().catch(() => false)) {
      await legacyMaybeLater.click({ force: true }).catch(() => {});
    }
  }

  const bodyAfter = await page.locator('body').innerText().catch(() => '');
  if (bodyAfter.includes('Your New BizFlex Card Awaits')) {
    throw new Error('New-card modal should be dismissed before proceeding');
  }
}
